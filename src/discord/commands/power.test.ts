import {
	type GuildConfig,
	getGuildConfig,
	setGuildEnabled,
	upsertGuildConfig,
} from "@/db/guild-config"
import { applySchema } from "@/db/pool"
import type { SyncResult } from "@/roles/sync"
import type { ChatInputCommandInteraction } from "discord.js"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"
import {
	ACTIVATE_FAILED,
	ACTIVATE_SKIPPED,
	ALREADY_OFF,
	ALREADY_ON,
	DEACTIVATE_DONE,
	POWER_GUILD_ONLY,
	POWER_NO_CONFIG,
	POWER_NO_PERMISSION,
	type PowerCommandDeps,
	handleActivate,
	handleDeactivate,
} from "./power"

interface Recorder {
	replies: Array<{ content?: string }>
	edits: Array<{ content?: string }>
	deferred: number
}

function makeInteraction(opts: { guildId: string | null; manage: boolean; userId?: string }) {
	const rec: Recorder = { replies: [], edits: [], deferred: 0 }
	const interaction = {
		guildId: opts.guildId,
		memberPermissions: { has: () => opts.manage },
		user: { id: opts.userId ?? "admin-1" },
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
		modChannelId: "m1",
		roleIds: { legendary: "1", grandmaster: "2", master: "3", elite: "4", lyricist: "5" },
		tierOverrides: null,
		enabled: false,
	}
}

function makeDeps(pool: Pool, result: SyncResult | null) {
	const calls: GuildConfig[] = []
	const deps: PowerCommandDeps = {
		pool,
		async runSyncForGuild(gc) {
			calls.push(gc)
			return result
		},
	}
	return { deps, calls }
}

const okResult: SyncResult = {
	granted: 3,
	removed: 0,
	announced: 3,
	skipped: false,
	transitions: [],
}

describe("handleActivate", () => {
	describe("guards", () => {
		it("refuses outside a guild and does not toggle or sync", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			const { deps, calls } = makeDeps(pool, okResult)
			const { interaction, rec } = makeInteraction({ guildId: null, manage: true })

			const out = await handleActivate(interaction, deps)

			expect(rec.replies[0]?.content).toBe(POWER_GUILD_ONLY)
			expect(calls).toHaveLength(0)
			expect(out.changed).toBe(false)
		})

		it("refuses a member without Manage Server", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			const { deps, calls } = makeDeps(pool, okResult)
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: false })

			await handleActivate(interaction, deps)

			expect(rec.replies[0]?.content).toBe(POWER_NO_PERMISSION)
			expect(calls).toHaveLength(0)
		})

		it("tells an admin to run setup first when there is no config", async () => {
			const pool = await makePool()
			const { deps } = makeDeps(pool, okResult)
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

			await handleActivate(interaction, deps)

			expect(rec.replies[0]?.content).toBe(POWER_NO_CONFIG)
		})
	})

	describe("happy path", () => {
		it("flips the switch on, runs the first sync as enabled, and reports the summary", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			const { deps, calls } = makeDeps(pool, okResult)
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true, userId: "u9" })

			const out = await handleActivate(interaction, deps)

			expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(true)
			expect(calls).toHaveLength(1)
			expect(calls[0]?.enabled).toBe(true)
			expect(rec.deferred).toBe(1)
			expect(rec.edits[0]?.content).toContain("granted 3")
			expect(rec.edits[0]?.content).toContain("announced 3")
			expect(out).toEqual({ changed: true, enabled: true, modChannelId: "m1" })
		})

		it("reports the skipped message but stays on", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			const { deps } = makeDeps(pool, { ...okResult, skipped: true })
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

			await handleActivate(interaction, deps)

			expect(rec.edits[0]?.content).toBe(ACTIVATE_SKIPPED)
			expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(true)
		})

		it("reports the failure message when the first sync could not run", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			const { deps } = makeDeps(pool, null)
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

			await handleActivate(interaction, deps)

			expect(rec.edits[0]?.content).toBe(ACTIVATE_FAILED)
		})
	})

	describe("already on", () => {
		it("does nothing and reports it is already on", async () => {
			const pool = await makePool()
			await upsertGuildConfig(pool, seededConfig("g1"))
			await setGuildEnabled(pool, "g1", true)
			const { deps, calls } = makeDeps(pool, okResult)
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

			const out = await handleActivate(interaction, deps)

			expect(rec.replies[0]?.content).toBe(ALREADY_ON)
			expect(calls).toHaveLength(0)
			expect(out.changed).toBe(false)
		})
	})
})

describe("handleDeactivate", () => {
	it("flips the switch off and reports it", async () => {
		const pool = await makePool()
		await upsertGuildConfig(pool, seededConfig("g1"))
		await setGuildEnabled(pool, "g1", true)
		const { deps } = makeDeps(pool, okResult)
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		const out = await handleDeactivate(interaction, deps)

		expect(rec.replies[0]?.content).toBe(DEACTIVATE_DONE)
		expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(false)
		expect(out).toEqual({ changed: true, enabled: false, modChannelId: "m1" })
	})

	it("does nothing when already off", async () => {
		const pool = await makePool()
		await upsertGuildConfig(pool, seededConfig("g1"))
		const { deps } = makeDeps(pool, okResult)
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		const out = await handleDeactivate(interaction, deps)

		expect(rec.replies[0]?.content).toBe(ALREADY_OFF)
		expect(out.changed).toBe(false)
	})

	it("tells an admin to run setup first when there is no config", async () => {
		const pool = await makePool()
		const { deps } = makeDeps(pool, okResult)
		const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true })

		await handleDeactivate(interaction, deps)

		expect(rec.replies[0]?.content).toBe(POWER_NO_CONFIG)
	})
})
