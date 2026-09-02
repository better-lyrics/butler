import {
	migrateAlreadyCommitted,
	migrateExpired,
	migrateGenericError,
	migrateNotOwner,
	migrateNotReady,
	migrateSessionNotFound,
} from "@/copy/strings"
import type {
	MigrationCommitResult,
	MigrationStatus,
	MigrationStatusResult,
	NicknameChoice,
} from "@/unison/client"
import { describe, expect, it } from "vitest"
import { handleMigrateCommit, handleMigrateConfirm } from "./confirm"

const OLD_KEY = `${"a".repeat(58)}1b2c3d`
const NEW_KEY = `${"b".repeat(58)}9e8f7a`

const ready: MigrationStatus = {
	status: "ready",
	oldKeyId: OLD_KEY,
	newKeyId: NEW_KEY,
	oldNickname: "OldName",
	newNickname: "NewName",
	oldDisplayName: "OldName",
	newDisplayName: "NewName",
	counts: { submissions: 12, votes: 40, reports: 3, fulfillments: 5, collisions: 2 },
}

const committed: MigrationCommitResult = {
	status: "committed",
	migrationId: 42,
	moved: { submissions: 12, votes: 38, reports: 3, fulfillments: 5, collisionsDropped: 2 },
}

function fakeConfirm(customId: string) {
	const modals: Array<{ toJSON(): unknown }> = []
	const interaction = {
		customId,
		showModal: async (m: { toJSON(): unknown }) => {
			modals.push(m)
		},
	}
	return { interaction, modals }
}

function fakeModalSubmit(customId: string, typed: string) {
	const replies: Array<Record<string, unknown>> = []
	const interaction = {
		customId,
		user: { id: "disc-1" },
		fields: { getTextInputValue: (_id: string) => typed },
		reply: async (p: Record<string, unknown>) => {
			replies.push(p)
		},
	}
	return { interaction, replies }
}

function commitDeps(status: MigrationStatusResult, commit: MigrationCommitResult) {
	const commitCalls: Array<{ sessionId: string; discordId: string; keepNickname: NicknameChoice }> =
		[]
	return {
		commitCalls,
		deps: {
			getMigrationStatus: async (_s: string) => status,
			commitMigration: async (
				sessionId: string,
				discordId: string,
				keepNickname: NicknameChoice
			) => {
				commitCalls.push({ sessionId, discordId, keepNickname })
				return commit
			},
		},
	}
}

describe("handleMigrateConfirm", () => {
	it("opens a modal whose submit id carries the session and choice", async () => {
		const { interaction, modals } = fakeConfirm("migrate.confirm:sess-1:new")
		await handleMigrateConfirm(interaction)
		const s = JSON.stringify(modals[0]?.toJSON())
		expect(s).toContain("migrate.commit:sess-1:new")
		expect(s).toContain("shortId")
	})
})

describe("handleMigrateCommit happy path", () => {
	it("commits with the chosen nickname when the typed short id matches and renders success", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:new", "9e8f7a")
		const d = commitDeps({ status: "ok", data: ready }, committed)
		await handleMigrateCommit(interaction, d.deps)
		expect(d.commitCalls).toEqual([
			{ sessionId: "sess-1", discordId: "disc-1", keepNickname: "new" },
		])
		const s = JSON.stringify(replies[0])
		expect(s).toContain("Migration complete")
		expect(s).toContain("9e8f7a")
	})
})

describe("handleMigrateCommit refusals", () => {
	it("rejects a mismatched token and never calls commit", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "ffffff")
		const d = commitDeps({ status: "ok", data: ready }, committed)
		await handleMigrateCommit(interaction, d.deps)
		expect(d.commitCalls).toHaveLength(0)
		expect(String(replies[0]?.content)).toContain("9e8f7a")
	})

	it("refuses to commit when the session is not ready", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "9e8f7a")
		const d = commitDeps(
			{ status: "ok", data: { ...ready, status: "awaiting_new_key", newKeyId: null } },
			committed
		)
		await handleMigrateCommit(interaction, d.deps)
		expect(d.commitCalls).toHaveLength(0)
		expect(replies[0]?.content).toBe(migrateNotReady)
	})

	it("reports a missing session", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-x:old", "9e8f7a")
		const d = commitDeps({ status: "not_found" }, committed)
		await handleMigrateCommit(interaction, d.deps)
		expect(d.commitCalls).toHaveLength(0)
		expect(replies[0]?.content).toBe(migrateSessionNotFound)
	})

	it("forces the old nickname when the new key has none, even if new was requested", async () => {
		const { interaction } = fakeModalSubmit("migrate.commit:sess-1:new", "9e8f7a")
		const d = commitDeps({ status: "ok", data: { ...ready, newNickname: null } }, committed)
		await handleMigrateCommit(interaction, d.deps)
		expect(d.commitCalls[0]?.keepNickname).toBe("old")
	})
})

describe("handleMigrateCommit commit outcomes", () => {
	it("surfaces not_owner", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "9e8f7a")
		const d = commitDeps({ status: "ok", data: ready }, { status: "not_owner" })
		await handleMigrateCommit(interaction, d.deps)
		expect(replies[0]?.content).toBe(migrateNotOwner)
	})

	it("surfaces expired", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "9e8f7a")
		const d = commitDeps({ status: "ok", data: ready }, { status: "expired" })
		await handleMigrateCommit(interaction, d.deps)
		expect(replies[0]?.content).toBe(migrateExpired)
	})

	it("surfaces already_committed", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "9e8f7a")
		const d = commitDeps({ status: "ok", data: ready }, { status: "already_committed" })
		await handleMigrateCommit(interaction, d.deps)
		expect(replies[0]?.content).toBe(migrateAlreadyCommitted)
	})

	it("surfaces a generic error", async () => {
		const { interaction, replies } = fakeModalSubmit("migrate.commit:sess-1:old", "9e8f7a")
		const d = commitDeps({ status: "ok", data: ready }, { status: "error", code: 500 })
		await handleMigrateCommit(interaction, d.deps)
		expect(replies[0]?.content).toBe(migrateGenericError)
	})
})
