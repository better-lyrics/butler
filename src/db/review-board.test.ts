import type { QueueEntry } from "@/unison/client"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { applySchema } from "./pool"
import {
	type BoardCard,
	getBoard,
	getBoardCard,
	replaceBoard,
	updateBoardCard,
} from "./review-board"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function entry(over: Partial<QueueEntry> = {}): QueueEntry {
	return {
		id: 5001,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		format: "ttml",
		score: 42,
		voteCount: 7,
		submitterName: "mukeenanyafiq",
		ttmlSignals: ["line-synced"],
		...over,
	}
}

function card(over: Partial<BoardCard> = {}): BoardCard {
	return {
		lyricId: "5001",
		messageId: "m1",
		channelId: "chan1",
		position: 0,
		state: "pending",
		actorId: null,
		note: null,
		entry: entry(),
		...over,
	}
}

describe("review-board", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("happy paths", () => {
		it("round-trips a board and preserves the entry snapshot", async () => {
			const cards = [card()]
			await replaceBoard(pool, "g1", cards)

			const board = await getBoard(pool, "g1")
			expect(board).toHaveLength(1)
			expect(board[0]).toEqual(cards[0])
			expect(board[0]?.entry).toEqual(entry())
		})

		it("orders cards by position regardless of insert order", async () => {
			await replaceBoard(pool, "g1", [
				card({ lyricId: "b", position: 2 }),
				card({ lyricId: "a", position: 0 }),
				card({ lyricId: "c", position: 1 }),
			])

			const board = await getBoard(pool, "g1")
			expect(board.map((c) => c.lyricId)).toEqual(["a", "c", "b"])
		})

		it("fetches a single card by lyric id", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "x" }), card({ lyricId: "y", position: 1 })])
			const one = await getBoardCard(pool, "g1", "y")
			expect(one?.lyricId).toBe("y")
		})

		it("updates a card's state, actor, and note", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "x" })])
			await updateBoardCard(pool, "g1", "x", {
				state: "rejected",
				actorId: "111",
				note: "line-synced only",
			})
			const one = await getBoardCard(pool, "g1", "x")
			expect(one?.state).toBe("rejected")
			expect(one?.actorId).toBe("111")
			expect(one?.note).toBe("line-synced only")
		})

		it("updates a card's message id on a resend", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "x", messageId: "old" })])
			await updateBoardCard(pool, "g1", "x", { messageId: "new" })
			const one = await getBoardCard(pool, "g1", "x")
			expect(one?.messageId).toBe("new")
		})

		it("replaces the whole board, dropping cards that are gone", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "old" })])
			await replaceBoard(pool, "g1", [card({ lyricId: "fresh" })])

			const board = await getBoard(pool, "g1")
			expect(board.map((c) => c.lyricId)).toEqual(["fresh"])
			expect(await getBoardCard(pool, "g1", "old")).toBeNull()
		})
	})

	describe("edge cases", () => {
		it("returns an empty board when nothing is stored", async () => {
			expect(await getBoard(pool, "g1")).toEqual([])
		})

		it("returns null for a missing card", async () => {
			expect(await getBoardCard(pool, "g1", "nope")).toBeNull()
		})

		it("clears the board when replaced with no cards", async () => {
			await replaceBoard(pool, "g1", [card()])
			await replaceBoard(pool, "g1", [])
			expect(await getBoard(pool, "g1")).toEqual([])
		})

		it("keeps boards for different guilds isolated", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "a" })])
			await replaceBoard(pool, "g2", [card({ lyricId: "b" })])
			expect((await getBoard(pool, "g1")).map((c) => c.lyricId)).toEqual(["a"])
			expect((await getBoard(pool, "g2")).map((c) => c.lyricId)).toEqual(["b"])
		})

		it("no-ops updating a card that is not on the board", async () => {
			await replaceBoard(pool, "g1", [card({ lyricId: "x" })])
			await updateBoardCard(pool, "g1", "missing", { state: "sealed" })
			expect((await getBoardCard(pool, "g1", "x"))?.state).toBe("pending")
		})
	})

	describe("invariants", () => {
		it("a card is exactly one of the three states", async () => {
			await replaceBoard(pool, "g1", [
				card({ lyricId: "p", state: "pending" }),
				card({ lyricId: "s", state: "sealed", position: 1 }),
				card({ lyricId: "r", state: "rejected", position: 2 }),
			])
			const states = (await getBoard(pool, "g1")).map((c) => c.state)
			expect(states).toEqual(["pending", "sealed", "rejected"])
		})
	})
})
