import { pendingRevision } from "@/unison/__fixtures__/pending-revision"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { applySchema } from "./pool"
import {
	forgetRevisionRow,
	getRevisionBoardRow,
	listRevisionBoard,
	markRevisionDecided,
	recordRevisionPost,
} from "./revision-board"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function post(revisionId = 918) {
	return {
		revisionId: String(revisionId),
		messageId: `m-${revisionId}`,
		channelId: "c1",
		card: pendingRevision({ revisionId }),
	}
}

describe("revision board store", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("happy paths", () => {
		it("records a post as pending and reads it back", async () => {
			await recordRevisionPost(pool, "g1", post())
			expect(await getRevisionBoardRow(pool, "g1", "918")).toEqual({
				revisionId: "918",
				messageId: "m-918",
				channelId: "c1",
				state: "pending",
				actorId: null,
				note: null,
				card: pendingRevision(),
			})
		})

		it("lists every tracked row for the guild", async () => {
			await recordRevisionPost(pool, "g1", post(918))
			await recordRevisionPost(pool, "g1", post(919))
			const ids = (await listRevisionBoard(pool, "g1")).map((r) => r.revisionId).sort()
			expect(ids).toEqual(["918", "919"])
		})

		it("records an approval with its actor", async () => {
			await recordRevisionPost(pool, "g1", post())
			await markRevisionDecided(pool, "g1", "918", {
				state: "approved",
				actorId: "777",
				note: null,
			})
			expect(await getRevisionBoardRow(pool, "g1", "918")).toMatchObject({
				state: "approved",
				actorId: "777",
				note: null,
			})
		})

		it("records a rejection with its note", async () => {
			await recordRevisionPost(pool, "g1", post())
			await markRevisionDecided(pool, "g1", "918", {
				state: "rejected",
				actorId: "777",
				note: "timing is off in the bridge",
			})
			expect(await getRevisionBoardRow(pool, "g1", "918")).toMatchObject({
				state: "rejected",
				note: "timing is off in the bridge",
			})
		})

		it("forgets a row", async () => {
			await recordRevisionPost(pool, "g1", post())
			await forgetRevisionRow(pool, "g1", "918")
			expect(await getRevisionBoardRow(pool, "g1", "918")).toBeNull()
		})
	})

	describe("edge cases", () => {
		it("returns null for an untracked revision", async () => {
			expect(await getRevisionBoardRow(pool, "g1", "404")).toBeNull()
		})

		it("returns an empty list for a guild with no rows", async () => {
			expect(await listRevisionBoard(pool, "g1")).toEqual([])
		})

		it("scopes rows to their guild", async () => {
			await recordRevisionPost(pool, "g1", post(918))
			await recordRevisionPost(pool, "g2", post(919))
			expect((await listRevisionBoard(pool, "g1")).map((r) => r.revisionId)).toEqual(["918"])
			expect(await getRevisionBoardRow(pool, "g2", "918")).toBeNull()
		})

		it("keeps the first message when the same revision is recorded twice", async () => {
			await recordRevisionPost(pool, "g1", post())
			await recordRevisionPost(pool, "g1", { ...post(), messageId: "m-dup" })
			expect((await getRevisionBoardRow(pool, "g1", "918"))?.messageId).toBe("m-918")
		})
	})

	describe("error paths", () => {
		it("treats deciding an untracked revision as a no-op", async () => {
			await expect(
				markRevisionDecided(pool, "g1", "404", { state: "approved", actorId: "777", note: null })
			).resolves.toBeUndefined()
			expect(await listRevisionBoard(pool, "g1")).toEqual([])
		})

		it("treats forgetting an untracked revision as a no-op", async () => {
			await expect(forgetRevisionRow(pool, "g1", "404")).resolves.toBeUndefined()
		})
	})

	describe("invariants", () => {
		it("round-trips the card JSON unchanged, including unicode and a large diff", async () => {
			const card = pendingRevision({
				song: "夜に駆ける",
				artist: "YOASOBI",
				diffFull: `+${"x".repeat(100_000)}`,
			})
			await recordRevisionPost(pool, "g1", { ...post(), card })
			expect((await getRevisionBoardRow(pool, "g1", "918"))?.card).toEqual(card)
		})
	})
})
