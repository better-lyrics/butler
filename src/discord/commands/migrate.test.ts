import { MIGRATE_EXPIRY_EDIT_LEAD_MS, MIGRATE_SESSION_TTL_MS } from "@/config"
import {
	migrateAlreadyActive,
	migrateBlacklisted,
	migrateGenericError,
	migrateLinkingDisabled,
} from "@/copy/strings"
import { createCooldown } from "@/discord/migrate/cooldown"
import type { MigrationStartResult, MigrationStatus, MigrationStatusResult } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { handleMigrate, runMigrateExpirySwap } from "./migrate"

const awaitingStatus: MigrationStatus = {
	status: "awaiting_new_key",
	oldKeyId: `${"a".repeat(58)}1b2c3d`,
	newKeyId: null,
	oldNickname: null,
	newNickname: null,
	oldDisplayName: "quiet-fern",
	newDisplayName: "",
	counts: null,
}

function fakeInteraction(userId = "disc-1") {
	const replies: Array<Record<string, unknown>> = []
	const edits: Array<Record<string, unknown>> = []
	const interaction = {
		user: { id: userId },
		reply: async (p: Record<string, unknown>) => {
			replies.push(p)
		},
		editReply: async (p: Record<string, unknown>) => {
			edits.push(p)
		},
	}
	return { interaction, replies, edits }
}

function deps(
	startResult: MigrationStartResult,
	cooldownNow = () => 0,
	statusResult: MigrationStatusResult = { status: "ok", data: awaitingStatus }
) {
	const calls: string[] = []
	const scheduled: Array<{ callback: () => void; delayMs: number }> = []
	return {
		calls,
		scheduled,
		deps: {
			startMigration: async (id: string) => {
				calls.push(id)
				return startResult
			},
			getMigrationStatus: async (_sessionId: string) => statusResult,
			cooldown: createCooldown({ windowMs: 10_000, now: cooldownNow }),
			linkPageUrl: "https://u.test/link",
			now: () => 0,
			schedule: (callback: () => void, delayMs: number) => {
				scheduled.push({ callback, delayMs })
			},
		},
	}
}

function ephemeral(flags: unknown): boolean {
	return ((flags as number) & MessageFlags.Ephemeral) !== 0
}

describe("handleMigrate happy path", () => {
	it("replies with the start card carrying the session id when a migration starts", async () => {
		const { interaction, replies } = fakeInteraction()
		const started: MigrationStartResult = {
			status: "started",
			sessionId: "sess-1",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
		}
		await handleMigrate(interaction, deps(started).deps)
		const s = JSON.stringify(replies[0])
		expect(s).toContain("migrate.continue:sess-1")
		expect(ephemeral(replies[0]?.flags)).toBe(true)
	})

	it("stamps the start card with an expiry of now plus the session ttl", async () => {
		const { interaction, replies } = fakeInteraction()
		const started: MigrationStartResult = {
			status: "started",
			sessionId: "sess-1",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
		}
		const nowMs = 1_788_394_020_000
		await handleMigrate(interaction, { ...deps(started).deps, now: () => nowMs })
		const expected = Math.floor((nowMs + MIGRATE_SESSION_TTL_MS) / 1000)
		expect(JSON.stringify(replies[0])).toContain(`<t:${expected}:R>`)
	})
})

describe("handleMigrate expiry auto-swap", () => {
	const started: MigrationStartResult = {
		status: "started",
		sessionId: "sess-1",
		oldKeyId: `${"a".repeat(58)}1b2c3d`,
	}

	it("schedules the expiry swap a lead time before the session ttl", async () => {
		const { interaction } = fakeInteraction()
		const d = deps(started)
		await handleMigrate(interaction, d.deps)
		expect(d.scheduled).toHaveLength(1)
		expect(d.scheduled[0]?.delayMs).toBe(MIGRATE_SESSION_TTL_MS - MIGRATE_EXPIRY_EDIT_LEAD_MS)
	})

	it("swaps the card to the expired card when the scheduled callback later fires", async () => {
		const { interaction, edits } = fakeInteraction()
		const d = deps(started)
		await handleMigrate(interaction, d.deps)
		d.scheduled[0]?.callback()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(edits).toHaveLength(1)
		expect(JSON.stringify(edits[0])).toContain("expired")
	})
})

describe("runMigrateExpirySwap", () => {
	function swapInteraction() {
		const edits: Array<Record<string, unknown>> = []
		return {
			interaction: {
				editReply: async (p: Record<string, unknown>) => {
					edits.push(p)
				},
			},
			edits,
		}
	}

	it("swaps the untouched start card to the expired card when the user never signed", async () => {
		const { interaction, edits } = swapInteraction()
		await runMigrateExpirySwap(
			interaction,
			async () => ({ status: "ok", data: awaitingStatus }),
			"sess-1"
		)
		expect(edits).toHaveLength(1)
		const s = JSON.stringify(edits[0])
		expect(s).toContain("expired")
		expect(s).toContain("/migrate")
	})

	it("leaves the card alone once the user has moved past the start card", async () => {
		const { interaction, edits } = swapInteraction()
		const ready: MigrationStatus = { ...awaitingStatus, status: "ready" }
		await runMigrateExpirySwap(interaction, async () => ({ status: "ok", data: ready }), "sess-1")
		expect(edits).toHaveLength(0)
	})

	it("does nothing when the session is already gone", async () => {
		const { interaction, edits } = swapInteraction()
		await runMigrateExpirySwap(interaction, async () => ({ status: "not_found" }), "sess-1")
		expect(edits).toHaveLength(0)
	})
})

describe("handleMigrate business outcomes", () => {
	it("shows the not-linked card with the link page when the discord has no link", async () => {
		const { interaction, replies } = fakeInteraction()
		await handleMigrate(interaction, deps({ status: "not_linked" }).deps)
		expect(JSON.stringify(replies[0])).toContain("https://u.test/link")
		expect(ephemeral(replies[0]?.flags)).toBe(true)
	})

	it("tells the user when a migration is already active", async () => {
		const { interaction, replies } = fakeInteraction()
		await handleMigrate(interaction, deps({ status: "already_active" }).deps)
		expect(replies[0]?.content).toBe(migrateAlreadyActive)
	})

	it("tells the user when the account is blacklisted", async () => {
		const { interaction, replies } = fakeInteraction()
		await handleMigrate(interaction, deps({ status: "blacklisted" }).deps)
		expect(replies[0]?.content).toBe(migrateBlacklisted)
	})

	it("tells the user when linking is disabled", async () => {
		const { interaction, replies } = fakeInteraction()
		await handleMigrate(interaction, deps({ status: "linking_disabled" }).deps)
		expect(replies[0]?.content).toBe(migrateLinkingDisabled)
	})

	it("shows a generic error on transport failure", async () => {
		const { interaction, replies } = fakeInteraction()
		await handleMigrate(interaction, deps({ status: "error", code: 500 }).deps)
		expect(replies[0]?.content).toBe(migrateGenericError)
	})
})

describe("handleMigrate rate limit", () => {
	it("blocks a rapid second invocation and does not call unison the second time", async () => {
		const started: MigrationStartResult = {
			status: "started",
			sessionId: "sess-1",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
		}
		const d = deps(started, () => 0)
		const first = fakeInteraction("disc-1")
		const second = fakeInteraction("disc-1")

		await handleMigrate(first.interaction, d.deps)
		await handleMigrate(second.interaction, d.deps)

		expect(d.calls).toEqual(["disc-1"])
		expect(String(second.replies[0]?.content)).toContain("Slow down")
	})

	it("does not rate-limit a different user", async () => {
		const started: MigrationStartResult = {
			status: "started",
			sessionId: "sess-1",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
		}
		const d = deps(started, () => 0)
		await handleMigrate(fakeInteraction("disc-1").interaction, d.deps)
		await handleMigrate(fakeInteraction("disc-2").interaction, d.deps)
		expect(d.calls).toEqual(["disc-1", "disc-2"])
	})
})
