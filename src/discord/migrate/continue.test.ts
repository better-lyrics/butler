import {
	migrateAlreadyCommitted,
	migrateExpired,
	migrateNotYet,
	migrateSessionNotFound,
} from "@/copy/strings"
import type { MigrationStatus, MigrationStatusResult } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { handleMigrateContinue } from "./continue"

const OLD_KEY = `${"a".repeat(58)}1b2c3d`
const NEW_KEY = `${"b".repeat(58)}9e8f7a`

const ready: MigrationStatus = {
	status: "ready",
	oldKeyId: OLD_KEY,
	newKeyId: NEW_KEY,
	oldNickname: "OldName",
	newNickname: "NewName",
	counts: { submissions: 12, votes: 40, reports: 3, fulfillments: 5, collisions: 2 },
}

function fakeInteraction(customId: string) {
	const updates: Array<Record<string, unknown>> = []
	const replies: Array<Record<string, unknown>> = []
	const interaction = {
		customId,
		user: { id: "disc-1" },
		update: async (p: Record<string, unknown>) => {
			updates.push(p)
		},
		reply: async (p: Record<string, unknown>) => {
			replies.push(p)
		},
	}
	return { interaction, updates, replies }
}

function deps(result: MigrationStatusResult) {
	return { getMigrationStatus: async (_sessionId: string) => result }
}

describe("handleMigrateContinue happy path", () => {
	it("renders the preview (default old nickname) on continue when ready", async () => {
		const { interaction, updates, replies } = fakeInteraction("migrate.continue:sess-1")
		await handleMigrateContinue(interaction, deps({ status: "ok", data: ready }))
		expect(replies).toHaveLength(0)
		const s = JSON.stringify(updates[0])
		expect(s).toContain("migrate.confirm:sess-1:old")
		expect(s).toContain("12")
	})

	it("renders the preview carrying the new choice on a nick toggle", async () => {
		const { interaction, updates } = fakeInteraction("migrate.nick:sess-1:new")
		await handleMigrateContinue(interaction, deps({ status: "ok", data: ready }))
		expect(JSON.stringify(updates[0])).toContain("migrate.confirm:sess-1:new")
	})
})

describe("handleMigrateContinue edge cases", () => {
	it("forces old and drops the toggle when the new key has no nickname", async () => {
		const { interaction, updates } = fakeInteraction("migrate.nick:sess-1:new")
		const data = { ...ready, newNickname: null }
		await handleMigrateContinue(interaction, deps({ status: "ok", data }))
		const s = JSON.stringify(updates[0])
		expect(s).toContain("migrate.confirm:sess-1:old")
		expect(s).not.toContain("migrate.nick:")
	})

	it("tells the user to finish signing when still awaiting the new key", async () => {
		const { interaction, updates, replies } = fakeInteraction("migrate.continue:sess-1")
		await handleMigrateContinue(
			interaction,
			deps({
				status: "ok",
				data: { ...ready, status: "awaiting_new_key", newKeyId: null, counts: null },
			})
		)
		expect(updates).toHaveLength(0)
		expect(replies[0]?.content).toBe(migrateNotYet)
	})

	it("reports a missing session", async () => {
		const { interaction, replies } = fakeInteraction("migrate.continue:sess-x")
		await handleMigrateContinue(interaction, deps({ status: "not_found" }))
		expect(replies[0]?.content).toBe(migrateSessionNotFound)
	})

	it("reports an already-committed session", async () => {
		const { interaction, replies } = fakeInteraction("migrate.continue:sess-1")
		await handleMigrateContinue(
			interaction,
			deps({ status: "ok", data: { ...ready, status: "committed" } })
		)
		expect(replies[0]?.content).toBe(migrateAlreadyCommitted)
	})

	it("reports an expired session", async () => {
		const { interaction, replies } = fakeInteraction("migrate.continue:sess-1")
		await handleMigrateContinue(
			interaction,
			deps({ status: "ok", data: { ...ready, status: "expired" } })
		)
		expect(replies[0]?.content).toBe(migrateExpired)
	})
})
