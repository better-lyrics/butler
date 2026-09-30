import type { CouncilBookmark, QueueEntry } from "@/unison/client"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { applySchema } from "./pool"
import {
	type BoardCard,
	getBoard,
	getBoardCard,
	replaceBoard,
	setBoardBookmark,
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
		ttmlFlags: [{ code: "line-synced", label: "Line-synced, not word-by-word" }],
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
		rejectionId: null,
		entry: entry(),
		bookmark: null,
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

	describe("error paths", () => {
		it("rejects a replaceBoard call that repeats a lyric id (primary key violation)", async () => {
			await expect(
				replaceBoard(pool, "g1", [card({ lyricId: "dup" }), card({ lyricId: "dup", position: 1 })])
			).rejects.toThrow()
		})
	})
})

describe("review-board web bookmarks", () => {
	let pool: Pool
	const bookmark: CouncilBookmark = {
		itemType: "seal",
		itemId: 5001,
		holder: { displayName: "boidu", discordId: "111" },
		expiresAt: 1_790_259_200,
	}

	beforeEach(async () => {
		pool = await freshPool()
	})

	it("stores the bookmark a card shows and clears it", async () => {
		await replaceBoard(pool, "g1", [card()])
		await setBoardBookmark(pool, "g1", "5001", "m1", bookmark)
		expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toEqual(bookmark)
		await setBoardBookmark(pool, "g1", "5001", "m1", null)
		expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toBeNull()
	})

	it("keeps a bookmark through a board replace", async () => {
		await replaceBoard(pool, "g1", [card({ bookmark })])
		expect((await getBoard(pool, "g1"))[0]?.bookmark).toEqual(bookmark)
	})

	describe("invariants", () => {
		it("forgets the shown bookmark when the card changes state, since the redraw has none", async () => {
			await replaceBoard(pool, "g1", [card({ bookmark })])
			await updateBoardCard(pool, "g1", "5001", { state: "sealed", actorId: "777" })
			expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toBeNull()
		})

		it("does not record a bookmark onto a decided card", async () => {
			await replaceBoard(pool, "g1", [card({ state: "sealed" })])
			await setBoardBookmark(pool, "g1", "5001", "m1", bookmark)
			expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toBeNull()
		})

		it("does not record a bookmark onto a card whose message was replaced", async () => {
			await replaceBoard(pool, "g1", [card({ messageId: "m2" })])
			await setBoardBookmark(pool, "g1", "5001", "m1", bookmark)
			expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toBeNull()
		})

		it("keeps the shown bookmark on a patch that does not change state", async () => {
			await replaceBoard(pool, "g1", [card({ bookmark })])
			await updateBoardCard(pool, "g1", "5001", { messageId: "m2" })
			expect((await getBoardCard(pool, "g1", "5001"))?.bookmark).toEqual(bookmark)
		})
	})

	describe("regressions", () => {
		it("reads flags from a card stored before labels existed", async () => {
			const { ttmlFlags: _, ...legacy } = entry()
			await pool.query(
				`INSERT INTO review_board_card
				   (guild_id, lyric_id, message_id, channel_id, position, state, entry)
				 VALUES ('g1', '5001', 'm1', 'chan1', 0, 'pending', $1)`,
				[JSON.stringify({ ...legacy, ttmlSignals: ["line-synced"] })]
			)
			const stored = await getBoardCard(pool, "g1", "5001")
			expect(stored?.entry.ttmlFlags).toEqual([{ code: "line-synced", label: "line-synced" }])
			expect(stored?.bookmark).toBeNull()
		})
	})
})

describe("review-board rejection ids", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("happy paths", () => {
		it("round-trips the rejection a rejected card names", async () => {
			const rejected = card({ state: "rejected", actorId: "111", rejectionId: 318 })
			await replaceBoard(pool, "g1", [rejected])
			expect(await getBoard(pool, "g1")).toEqual([rejected])
		})

		it("records the rejection id alongside the rejected state", async () => {
			await replaceBoard(pool, "g1", [card()])
			await updateBoardCard(pool, "g1", "5001", {
				state: "rejected",
				actorId: "111",
				note: "bad sync",
				rejectionId: 318,
			})
			const stored = await getBoardCard(pool, "g1", "5001")
			expect([stored?.state, stored?.note, stored?.rejectionId]).toEqual([
				"rejected",
				"bad sync",
				318,
			])
		})
	})

	describe("edge cases", () => {
		it("stores a null rejection id when the server named none", async () => {
			await replaceBoard(pool, "g1", [card()])
			await updateBoardCard(pool, "g1", "5001", { state: "rejected", rejectionId: null })
			expect((await getBoardCard(pool, "g1", "5001"))?.rejectionId).toBeNull()
		})

		it("keeps an id past the 32-bit range", async () => {
			await replaceBoard(pool, "g1", [card({ state: "rejected", rejectionId: 3_000_000_000 })])
			expect((await getBoardCard(pool, "g1", "5001"))?.rejectionId).toBe(3_000_000_000)
		})
	})

	describe("invariants", () => {
		it("forgets the rejection id when the card changes state without naming one", async () => {
			await replaceBoard(pool, "g1", [card({ state: "rejected", rejectionId: 318 })])
			await updateBoardCard(pool, "g1", "5001", { state: "pending", actorId: null, note: null })
			expect((await getBoardCard(pool, "g1", "5001"))?.rejectionId).toBeNull()
		})

		it("keeps the rejection id on a patch that does not change state", async () => {
			await replaceBoard(pool, "g1", [card({ state: "rejected", rejectionId: 318 })])
			await updateBoardCard(pool, "g1", "5001", { messageId: "m2" })
			expect((await getBoardCard(pool, "g1", "5001"))?.rejectionId).toBe(318)
		})
	})

	describe("regressions", () => {
		it("regression: a rejected row stored before rejection ids reads back with none", async () => {
			await pool.query(
				`INSERT INTO review_board_card
				   (guild_id, lyric_id, message_id, channel_id, position, state, actor_id, entry)
				 VALUES ('g1', '5001', 'm1', 'chan1', 0, 'rejected', '111', $1)`,
				[JSON.stringify(entry())]
			)
			const stored = await getBoardCard(pool, "g1", "5001")
			expect([stored?.state, stored?.rejectionId]).toEqual(["rejected", null])
		})
	})
})
