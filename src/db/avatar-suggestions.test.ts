import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	createSuggestion,
	getSuggestion,
	markSuggestionDecided,
	pruneDecidedSuggestions,
	setSuggestionCard,
} from "./avatar-suggestions"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function input(overrides: Partial<Parameters<typeof createSuggestion>[1]> = {}) {
	return {
		id: "sug-1",
		guildId: "g1",
		proposedId: "el-gato",
		label: "El Gato",
		imageBase64: "aGVsbG8=",
		mime: "image/png",
		proposerDiscordId: "111111111111111111",
		proposerKeyId: "k".repeat(64),
		...overrides,
	}
}

describe("avatar suggestions store", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	it("creates a pending suggestion and reads it back", async () => {
		const created = await createSuggestion(pool, input(), 1000)
		expect(created).toMatchObject({
			id: "sug-1",
			proposedId: "el-gato",
			label: "El Gato",
			state: "pending",
			createdAt: 1000,
			cardChannelId: null,
			cardMessageId: null,
			decidedAt: null,
			decidedBy: null,
		})
		expect(await getSuggestion(pool, "sug-1")).toEqual(created)
	})

	it("records the posted card message", async () => {
		await createSuggestion(pool, input())
		await setSuggestionCard(pool, "sug-1", "chan-1", "msg-1")
		const row = await getSuggestion(pool, "sug-1")
		expect(row).toMatchObject({ cardChannelId: "chan-1", cardMessageId: "msg-1" })
	})

	it("marks a suggestion decided", async () => {
		await createSuggestion(pool, input())
		await markSuggestionDecided(pool, "sug-1", "approved", "999999999999999999", 5000)
		const row = await getSuggestion(pool, "sug-1")
		expect(row).toMatchObject({
			state: "approved",
			decidedBy: "999999999999999999",
			decidedAt: 5000,
		})
	})

	describe("edge cases", () => {
		it("returns null for a missing suggestion", async () => {
			expect(await getSuggestion(pool, "nope")).toBeNull()
		})
	})

	describe("prune", () => {
		it("removes decided rows older than the window but keeps pending and recent ones", async () => {
			const now = 1_000_000
			await createSuggestion(pool, input({ id: "old-decided" }), now)
			await markSuggestionDecided(pool, "old-decided", "rejected", "a", now)
			await createSuggestion(pool, input({ id: "recent-decided" }), now)
			await markSuggestionDecided(pool, "recent-decided", "approved", "a", now + 9_000)
			await createSuggestion(pool, input({ id: "old-pending" }), now)

			const week = 7 * 24 * 60 * 60 * 1000
			const removed = await pruneDecidedSuggestions(pool, week, now + week + 1)

			expect(removed).toBe(1)
			expect(await getSuggestion(pool, "old-decided")).toBeNull()
			expect(await getSuggestion(pool, "recent-decided")).not.toBeNull()
			expect(await getSuggestion(pool, "old-pending")).not.toBeNull()
		})
	})
})
