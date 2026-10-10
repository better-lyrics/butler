import { flagCase } from "@/unison/__fixtures__/flag"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	forgetFlagRow,
	getFlagBoardRow,
	listFlagBoard,
	markFlagDecided,
	recordFlagPost,
	updateFlagCard,
} from "./flag-board"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function post(caseId = 77) {
	return {
		caseId: String(caseId),
		messageId: `m-${caseId}`,
		channelId: "c1",
		card: flagCase({ id: caseId }),
	}
}

describe("flag board store", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("happy paths", () => {
		it("records a post as pending and reads it back", async () => {
			await recordFlagPost(pool, "g1", post())
			expect(await getFlagBoardRow(pool, "g1", "77")).toEqual({
				caseId: "77",
				messageId: "m-77",
				channelId: "c1",
				state: "pending",
				card: flagCase(),
			})
		})

		it("lists every tracked row for the guild", async () => {
			await recordFlagPost(pool, "g1", post(77))
			await recordFlagPost(pool, "g1", post(78))
			const ids = (await listFlagBoard(pool, "g1")).map((r) => r.caseId).sort()
			expect(ids).toEqual(["77", "78"])
		})

		it("records a removal", async () => {
			await recordFlagPost(pool, "g1", post())
			await markFlagDecided(pool, "g1", "77", { state: "removed", card: null })
			expect(await getFlagBoardRow(pool, "g1", "77")).toMatchObject({ state: "removed" })
		})

		it("records a keep with the final card", async () => {
			await recordFlagPost(pool, "g1", post())
			const final = flagCase({ status: "kept", keeps: 3, decidedAt: 1_790_000_900 })
			await markFlagDecided(pool, "g1", "77", { state: "kept", card: final })
			expect(await getFlagBoardRow(pool, "g1", "77")).toMatchObject({
				state: "kept",
				card: final,
			})
		})

		it("stores a newer card for a pending row", async () => {
			await recordFlagPost(pool, "g1", post())
			const newer = flagCase({ removals: 2, keeps: 1 })
			expect(await updateFlagCard(pool, "g1", "77", newer)).toBe(true)
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(newer)
		})

		it("forgets a row", async () => {
			await recordFlagPost(pool, "g1", post())
			await forgetFlagRow(pool, "g1", "77")
			expect(await getFlagBoardRow(pool, "g1", "77")).toBeNull()
		})
	})

	describe("edge cases", () => {
		it("returns null for an untracked case", async () => {
			expect(await getFlagBoardRow(pool, "g1", "404")).toBeNull()
		})

		it("returns an empty list for a guild with no rows", async () => {
			expect(await listFlagBoard(pool, "g1")).toEqual([])
		})

		it("scopes rows to their guild", async () => {
			await recordFlagPost(pool, "g1", post(77))
			await recordFlagPost(pool, "g2", post(78))
			expect((await listFlagBoard(pool, "g1")).map((r) => r.caseId)).toEqual(["77"])
			expect(await getFlagBoardRow(pool, "g2", "77")).toBeNull()
		})

		it("keeps the first message when the same case is recorded twice", async () => {
			await recordFlagPost(pool, "g1", post())
			await recordFlagPost(pool, "g1", { ...post(), messageId: "m-dup" })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.messageId).toBe("m-77")
		})

		it("keeps the stored card when a decision carries none", async () => {
			await recordFlagPost(pool, "g1", post())
			await markFlagDecided(pool, "g1", "77", { state: "removed", card: null })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(flagCase())
		})
	})

	describe("error paths", () => {
		it("treats deciding an untracked case as a no-op", async () => {
			await expect(
				markFlagDecided(pool, "g1", "404", { state: "removed", card: null })
			).resolves.toBeUndefined()
			expect(await listFlagBoard(pool, "g1")).toEqual([])
		})

		it("treats updating an untracked case as a no-op", async () => {
			expect(await updateFlagCard(pool, "g1", "404", flagCase())).toBe(false)
			expect(await listFlagBoard(pool, "g1")).toEqual([])
		})

		it("treats forgetting an untracked case as a no-op", async () => {
			await expect(forgetFlagRow(pool, "g1", "404")).resolves.toBeUndefined()
		})
	})

	describe("invariants", () => {
		it("round-trips the card JSON unchanged, including unicode details", async () => {
			const card = flagCase({
				song: "夜に駆ける",
				artist: "YOASOBI",
				reports: [{ reason: "offensive", details: '日本語 "quoted"', createdAt: 5 }],
			})
			await recordFlagPost(pool, "g1", { ...post(), card })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(card)
		})

		it("does not overwrite the card of a decided row", async () => {
			await recordFlagPost(pool, "g1", post())
			await markFlagDecided(pool, "g1", "77", { state: "kept", card: null })
			expect(await updateFlagCard(pool, "g1", "77", flagCase({ keeps: 9 }))).toBe(false)
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(flagCase())
		})

		it("only touches the named case", async () => {
			await recordFlagPost(pool, "g1", post(77))
			await recordFlagPost(pool, "g1", post(78))
			await markFlagDecided(pool, "g1", "77", { state: "removed", card: null })
			expect((await getFlagBoardRow(pool, "g1", "78"))?.state).toBe("pending")
		})
	})
})
