import {
	migrateAlreadyActive,
	migrateBlacklisted,
	migrateGenericError,
	migrateLinkingDisabled,
} from "@/copy/strings"
import { createCooldown } from "@/discord/migrate/cooldown"
import type { MigrationStartResult } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { handleMigrate } from "./migrate"

function fakeInteraction(userId = "disc-1") {
	const replies: Array<Record<string, unknown>> = []
	const interaction = {
		user: { id: userId },
		reply: async (p: Record<string, unknown>) => {
			replies.push(p)
		},
	}
	return { interaction, replies }
}

function deps(startResult: MigrationStartResult, cooldownNow = () => 0) {
	const calls: string[] = []
	return {
		calls,
		deps: {
			startMigration: async (id: string) => {
				calls.push(id)
				return startResult
			},
			cooldown: createCooldown({ windowMs: 10_000, now: cooldownNow }),
			linkPageUrl: "https://u.test/link",
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
