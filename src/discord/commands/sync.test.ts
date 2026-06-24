import { type GuildConfig, upsertGuildConfig } from "@/db/guild-config"
import { applySchema } from "@/db/pool"
import type { SyncResult } from "@/roles/sync"
import type { ChatInputCommandInteraction } from "discord.js"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"
import {
	SYNC_FAILED,
	SYNC_GUILD_ONLY,
	SYNC_NO_CONFIG,
	SYNC_NO_PERMISSION,
	SYNC_SKIPPED,
	type SyncCommandDeps,
	handleSync,
} from "./sync"

interface Recorder {
	replies: Array<{ content?: string }>
	deferred: number
	edits: Array<{ content?: string }>
}

function makeInteraction(opts: { guildId: string | null; manage: boolean }) {
	const rec: Recorder = { replies: [], deferred: 0, edits: [] }
	const interaction = {
		guildId: opts.guildId,
		memberPermissions: { has: () => opts.manage },
		user: { id: "tester-1" },
		async reply(payload: { content?: string }) {
			rec.replies.push(payload)
		},
		async deferReply() {
			rec.deferred++
		},
		async editReply(payload: { content?: string }) {
			rec.edits.push(payload)
		},
	}
	return { interaction: interaction as unknown as ChatInputCommandInteraction, rec }
}

async function makePool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const adapter = db.adapters.createPg()
	const pool = new adapter.Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function seededConfig(guildId: string): GuildConfig {
	return {
		guildId,
		connectChannelId: "c1",
		reportChannelId: "r1",
		announceChannelId: "a1",
		modChannelId: null,
		roleIds: { legendary: "1", grandmaster: "2", master: "3", elite: "4", lyricist: "5" },
		tierOverrides: null,
	}
}

function makeDeps(pool: Pool, result: SyncResult | null) {
	const calls: GuildConfig[] = []
	const deps: SyncCommandDeps = {
		pool,
		async runSyncForGuild(gc) {
			calls.push(gc)
			return result
		},
	}
	return { deps, calls }
}

describe("handleSync permission gates", () => {
	it("refuses outside a guild and does not run a sync", async () => {
		const pool = await makePool()
		const { deps, calls } = makeDeps(pool, null)
		const { interaction, rec } = makeInteraction({ guildId: null, manage: true })

		await handleSync(interaction, deps)

		expect(rec.replies[0]?.content).toBe(SYNC_GUILD_ONLY)
		expect(rec.deferred).toBe(0)
		expect(calls).toHaveLength(0)
	})

	it("refuses a member without Manage Server and does not run a sync", async () => {
		const pool = await makePool()
		const { deps, calls } = makeDeps(pool, null)
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: false })

		await handleSync(interaction, deps)

		expect(rec.replies[0]?.content).toBe(SYNC_NO_PERMISSION)
		expect(calls).toHaveLength(0)
	})
})

describe("handleSync without setup", () => {
	it("tells an admin to run setup first when the guild has no config", async () => {
		const pool = await makePool()
		const { deps, calls } = makeDeps(pool, null)
		const { interaction, rec } = makeInteraction({ guildId: "missing", manage: true })

		await handleSync(interaction, deps)

		expect(rec.replies[0]?.content).toBe(SYNC_NO_CONFIG)
		expect(rec.deferred).toBe(0)
		expect(calls).toHaveLength(0)
	})
})

describe("handleSync result reporting", () => {
	it("defers then reports a successful sync summary", async () => {
		const pool = await makePool()
		await upsertGuildConfig(pool, seededConfig("g1"))
		const { deps, calls } = makeDeps(pool, {
			granted: 2,
			removed: 1,
			announced: 1,
			skipped: false,
			transitions: [],
		})
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		await handleSync(interaction, deps)

		expect(calls).toHaveLength(1)
		expect(rec.deferred).toBe(1)
		const content = rec.edits[0]?.content ?? ""
		expect(content).toContain("Granted 2")
		expect(content).toContain("removed 1")
		expect(content).toContain("announced 1")
	})

	it("reports the skipped message when the sync was skipped", async () => {
		const pool = await makePool()
		await upsertGuildConfig(pool, seededConfig("g1"))
		const { deps } = makeDeps(pool, {
			granted: 0,
			removed: 0,
			announced: 0,
			skipped: true,
			transitions: [],
		})
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		await handleSync(interaction, deps)

		expect(rec.edits[0]?.content).toBe(SYNC_SKIPPED)
	})

	it("reports the failure message when the sync could not run", async () => {
		const pool = await makePool()
		await upsertGuildConfig(pool, seededConfig("g1"))
		const { deps } = makeDeps(pool, null)
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		await handleSync(interaction, deps)

		expect(rec.deferred).toBe(1)
		expect(rec.edits[0]?.content).toBe(SYNC_FAILED)
	})
})
