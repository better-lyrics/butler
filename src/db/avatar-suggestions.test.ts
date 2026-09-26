import { AVATAR_PUBLISH_CLAIM_TTL_MS } from "@/config"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	claimSuggestion,
	createSuggestion,
	deleteSuggestion,
	getSuggestion,
	markSuggestionDecided,
	pruneDecidedSuggestions,
	releaseSuggestion,
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

	it("marks a suggestion decided and clears the stored image", async () => {
		await createSuggestion(pool, input())
		const decided = await markSuggestionDecided(
			pool,
			{ id: "sug-1", from: "pending", to: "rejected", decidedBy: "999999999999999999" },
			5000
		)
		expect(decided).toBe(true)
		const row = await getSuggestion(pool, "sug-1")
		expect(row).toMatchObject({
			state: "rejected",
			decidedBy: "999999999999999999",
			decidedAt: 5000,
			imageBase64: "",
		})
	})

	describe("publish claim", () => {
		it("claims a pending suggestion once and returns it with its image", async () => {
			await createSuggestion(pool, input())
			const claimed = await claimSuggestion(pool, "sug-1", "admin-a", 5000)
			expect(claimed).toMatchObject({
				state: "publishing",
				decidedBy: "admin-a",
				imageBase64: "aGVsbG8=",
			})
			expect(await claimSuggestion(pool, "sug-1", "admin-b", 5001)).toBeNull()
		})

		it("finishes a claim as approved", async () => {
			await createSuggestion(pool, input())
			await claimSuggestion(pool, "sug-1", "admin-a", 5000)
			expect(
				await markSuggestionDecided(
					pool,
					{ id: "sug-1", from: "publishing", to: "approved", decidedBy: "admin-a" },
					6000
				)
			).toBe(true)
			expect(await getSuggestion(pool, "sug-1")).toMatchObject({
				state: "approved",
				decidedAt: 6000,
			})
		})

		it("releases a claim back to pending so it can be retried", async () => {
			await createSuggestion(pool, input())
			await claimSuggestion(pool, "sug-1", "admin-a", 5000)
			await releaseSuggestion(pool, "sug-1")
			expect(await getSuggestion(pool, "sug-1")).toMatchObject({
				state: "pending",
				decidedBy: null,
				decidedAt: null,
			})
			expect(await claimSuggestion(pool, "sug-1", "admin-b", 5001)).not.toBeNull()
		})

		it("returns null when claiming a missing suggestion", async () => {
			expect(await claimSuggestion(pool, "nope", "admin-a")).toBeNull()
		})

		describe("regressions", () => {
			it("regression: a reject cannot overwrite a publish in flight", async () => {
				await createSuggestion(pool, input())
				await claimSuggestion(pool, "sug-1", "admin-a", 5000)
				expect(
					await markSuggestionDecided(pool, {
						id: "sug-1",
						from: "pending",
						to: "rejected",
						decidedBy: "admin-b",
					})
				).toBe(false)
				expect(await getSuggestion(pool, "sug-1")).toMatchObject({ state: "publishing" })
			})

			it("regression: a second decision cannot overwrite an approved suggestion", async () => {
				await createSuggestion(pool, input())
				await claimSuggestion(pool, "sug-1", "admin-a", 5000)
				await markSuggestionDecided(pool, {
					id: "sug-1",
					from: "publishing",
					to: "approved",
					decidedBy: "admin-a",
				})
				expect(
					await markSuggestionDecided(pool, {
						id: "sug-1",
						from: "publishing",
						to: "rejected",
						decidedBy: "admin-b",
					})
				).toBe(false)
				expect(await getSuggestion(pool, "sug-1")).toMatchObject({ state: "approved" })
			})

			it("regression: a release never reopens a decided suggestion", async () => {
				await createSuggestion(pool, input())
				await markSuggestionDecided(pool, {
					id: "sug-1",
					from: "pending",
					to: "rejected",
					decidedBy: "admin-a",
				})
				await releaseSuggestion(pool, "sug-1")
				expect(await getSuggestion(pool, "sug-1")).toMatchObject({ state: "rejected" })
			})

			it("regression: reclaims a claim left behind by a crashed publish", async () => {
				await createSuggestion(pool, input())
				await claimSuggestion(pool, "sug-1", "admin-a", 5000)
				expect(
					await claimSuggestion(pool, "sug-1", "admin-b", 5000 + AVATAR_PUBLISH_CLAIM_TTL_MS - 1)
				).toBeNull()
				expect(
					await claimSuggestion(pool, "sug-1", "admin-b", 5000 + AVATAR_PUBLISH_CLAIM_TTL_MS + 1)
				).toMatchObject({ decidedBy: "admin-b" })
			})
		})
	})

	it("deletes a suggestion", async () => {
		await createSuggestion(pool, input())
		await deleteSuggestion(pool, "sug-1")
		expect(await getSuggestion(pool, "sug-1")).toBeNull()
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
			await markSuggestionDecided(
				pool,
				{ id: "old-decided", from: "pending", to: "rejected", decidedBy: "a" },
				now
			)
			await createSuggestion(pool, input({ id: "recent-decided" }), now)
			await markSuggestionDecided(
				pool,
				{ id: "recent-decided", from: "pending", to: "rejected", decidedBy: "a" },
				now + 9_000
			)
			await createSuggestion(pool, input({ id: "old-pending" }), now)
			await createSuggestion(pool, input({ id: "old-publishing" }), now)
			await claimSuggestion(pool, "old-publishing", "a", now)

			const week = 7 * 24 * 60 * 60 * 1000
			const removed = await pruneDecidedSuggestions(pool, week, now + week + 1)

			expect(removed).toBe(1)
			expect(await getSuggestion(pool, "old-decided")).toBeNull()
			expect(await getSuggestion(pool, "recent-decided")).not.toBeNull()
			expect(await getSuggestion(pool, "old-pending")).not.toBeNull()
			expect(await getSuggestion(pool, "old-publishing")).not.toBeNull()
		})
	})
})
