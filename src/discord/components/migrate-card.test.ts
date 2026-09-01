import type { MigrationStatus } from "@/unison/client"
import { describe, expect, it } from "vitest"
import {
	buildMigrateNotLinkedCard,
	buildMigratePreviewCard,
	buildMigrateStartCard,
	buildMigrateSuccessCard,
} from "./migrate-card"

const OLD_KEY = `${"a".repeat(58)}1b2c3d`
const NEW_KEY = `${"b".repeat(58)}9e8f7a`

function json(card: { components: { toJSON(): unknown }[] }): string {
	return JSON.stringify(card.components.map((c) => c.toJSON()))
}

const readyStatus: MigrationStatus = {
	status: "ready",
	oldKeyId: OLD_KEY,
	newKeyId: NEW_KEY,
	oldNickname: "OldName",
	newNickname: "NewName",
	counts: { submissions: 12, votes: 40, reports: 3, fulfillments: 5, collisions: 2 },
}

describe("buildMigrateStartCard", () => {
	it("renders a continue button with the session id and the old key short id, no url", () => {
		const card = buildMigrateStartCard({ sessionId: "sess-1", oldKeyId: OLD_KEY })
		const s = json(card)
		expect(s).toContain("migrate.continue:sess-1")
		expect(s).toContain("1b2c3d")
		expect(s).not.toContain("https://")
	})
})

describe("buildMigratePreviewCard happy path", () => {
	it("renders the counts, both key short ids, and a confirm button carrying the choice", () => {
		const card = buildMigratePreviewCard({
			sessionId: "sess-1",
			status: readyStatus,
			choice: "old",
		})
		const s = json(card)
		expect(s).toContain("12")
		expect(s).toContain("40")
		expect(s).toContain("1b2c3d")
		expect(s).toContain("9e8f7a")
		expect(s).toContain("migrate.confirm:sess-1:old")
	})

	it("shows a nickname toggle to the other choice when both nicknames differ", () => {
		const card = buildMigratePreviewCard({
			sessionId: "sess-1",
			status: readyStatus,
			choice: "old",
		})
		const s = json(card)
		expect(s).toContain("OldName")
		expect(s).toContain("migrate.nick:sess-1:new")
	})

	it("carries the new choice into the confirm button when new is chosen", () => {
		const card = buildMigratePreviewCard({
			sessionId: "sess-1",
			status: readyStatus,
			choice: "new",
		})
		const s = json(card)
		expect(s).toContain("migrate.confirm:sess-1:new")
		expect(s).toContain("migrate.nick:sess-1:old")
	})
})

describe("buildMigratePreviewCard edge cases", () => {
	it("omits the toggle and keeps old when the new key has no nickname", () => {
		const status: MigrationStatus = { ...readyStatus, newNickname: null }
		const card = buildMigratePreviewCard({ sessionId: "sess-1", status, choice: "old" })
		const s = json(card)
		expect(s).not.toContain("migrate.nick:")
		expect(s).toContain("migrate.confirm:sess-1:old")
	})

	it("omits the toggle when both nicknames are identical", () => {
		const status: MigrationStatus = { ...readyStatus, newNickname: "OldName" }
		const card = buildMigratePreviewCard({ sessionId: "sess-1", status, choice: "old" })
		expect(json(card)).not.toContain("migrate.nick:")
	})

	it("renders zero collisions without a drop warning", () => {
		const status: MigrationStatus = {
			...readyStatus,
			counts: { submissions: 1, votes: 0, reports: 0, fulfillments: 0, collisions: 0 },
		}
		const card = buildMigratePreviewCard({ sessionId: "sess-1", status, choice: "old" })
		expect(json(card)).toContain("migrate.confirm:sess-1:old")
	})
})

describe("buildMigrateSuccessCard", () => {
	it("renders the moved counts and the new key short id", () => {
		const card = buildMigrateSuccessCard({
			moved: { submissions: 12, votes: 38, reports: 3, fulfillments: 5, collisionsDropped: 2 },
			newKeyId: NEW_KEY,
		})
		const s = json(card)
		expect(s).toContain("12")
		expect(s).toContain("9e8f7a")
	})
})

describe("buildMigrateNotLinkedCard", () => {
	it("renders a link button to the link page", () => {
		const card = buildMigrateNotLinkedCard({ linkPageUrl: "https://u.test/link" })
		expect(json(card)).toContain("https://u.test/link")
	})
})
