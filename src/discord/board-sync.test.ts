import type { BoardCard } from "@/db/review-board"
import type { QueueEntry } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { type PlannedCard, type SyncBoardDeps, carryForwardStates, syncBoard } from "./board-sync"

function entry(id: number): QueueEntry {
	return {
		id,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		format: "ttml",
		score: 87,
		voteCount: 41,
		submitterName: "Alice",
		ttmlSignals: [],
	}
}

function card(overrides: Partial<BoardCard> = {}): BoardCard {
	return {
		lyricId: "4210",
		messageId: "msg-old",
		channelId: "chan-1",
		position: 0,
		state: "pending",
		actorId: null,
		note: null,
		entry: entry(4210),
		...overrides,
	}
}

function recorder() {
	const log: string[] = []
	const deleted: string[][] = []
	const persisted: BoardCard[][] = []
	const deps: SyncBoardDeps = {
		deleteMessages: async (refs) => {
			log.push("delete")
			deleted.push(refs.map((r) => r.messageId))
		},
		persist: async (cards) => {
			log.push("persist")
			persisted.push(cards)
		},
	}
	return { log, deleted, persisted, deps }
}

function plan(cards: BoardCard[], sendResults: (string | null)[], log: string[]): PlannedCard[] {
	return cards.map((c, i) => ({
		send: async () => {
			log.push(`send:${c.lyricId}`)
			return sendResults[i] ?? null
		},
		build: (messageId) => ({ ...c, messageId }),
	}))
}

describe("syncBoard", () => {
	describe("happy paths", () => {
		it("posts every card, then deletes the old board, then persists the new one", async () => {
			const { log, deleted, persisted, deps } = recorder()
			const previous = [card({ lyricId: "1", messageId: "old-1" })]
			const planned = plan(
				[card({ lyricId: "1" }), card({ lyricId: "2" })],
				["new-1", "new-2"],
				log
			)

			const result = await syncBoard(previous, planned, deps)

			expect(result).toBe("posted")
			expect(persisted).toHaveLength(1)
			expect(persisted.flat().map((c) => [c.lyricId, c.messageId, c.position])).toEqual([
				["1", "new-1", 0],
				["2", "new-2", 1],
			])
			expect(deleted).toEqual([["old-1"]])
		})
	})

	describe("edge cases", () => {
		it("clears the board when nothing is planned", async () => {
			const { deleted, persisted, deps } = recorder()
			const previous = [card({ lyricId: "1", messageId: "old-1" })]

			const result = await syncBoard(previous, [], deps)

			expect(result).toBe("posted")
			expect(deleted).toEqual([["old-1"]])
			expect(persisted).toEqual([[]])
		})

		it("handles a single card", async () => {
			const { persisted, deps, log } = recorder()
			const planned = plan([card({ lyricId: "1" })], ["new-1"], log)

			const result = await syncBoard([], planned, deps)

			expect(result).toBe("posted")
			expect(persisted.flat().map((c) => c.messageId)).toEqual(["new-1"])
		})
	})

	describe("error paths", () => {
		it("rolls back partial posts and keeps the old board when a later send fails", async () => {
			const { log, deleted, persisted, deps } = recorder()
			const previous = [card({ lyricId: "1", messageId: "old-1" })]
			const planned = plan(
				[card({ lyricId: "1" }), card({ lyricId: "2" }), card({ lyricId: "3" })],
				["new-1", null, "new-3"],
				log
			)

			const result = await syncBoard(previous, planned, deps)

			expect(result).toBe("failed")
			expect(persisted).toEqual([])
			expect(deleted).toEqual([["new-1"]])
			expect(log).not.toContain("send:3")
		})

		it("deletes nothing and persists nothing when the first send fails", async () => {
			const { deleted, persisted, deps, log } = recorder()
			const previous = [card({ lyricId: "1", messageId: "old-1" })]
			const planned = plan([card({ lyricId: "1" })], [null], log)

			const result = await syncBoard(previous, planned, deps)

			expect(result).toBe("failed")
			expect(persisted).toEqual([])
			expect(deleted).toEqual([[]])
		})
	})

	describe("invariants", () => {
		it("never deletes the old board until every send has succeeded", async () => {
			const { log, deps } = recorder()
			const planned = plan([card({ lyricId: "1" }), card({ lyricId: "2" })], ["a", "b"], log)

			await syncBoard([card({ lyricId: "1", messageId: "old-1" })], planned, deps)

			const firstDelete = log.indexOf("delete")
			const lastSend = log.lastIndexOf("send:2")
			expect(firstDelete).toBeGreaterThan(lastSend)
		})

		it("assigns sequential positions starting at zero", async () => {
			const { persisted, deps, log } = recorder()
			const planned = plan(
				[card({ lyricId: "1" }), card({ lyricId: "2" }), card({ lyricId: "3" })],
				["a", "b", "c"],
				log
			)

			await syncBoard([], planned, deps)

			expect(persisted.flat().map((c) => c.position)).toEqual([0, 1, 2])
		})

		it("does not persist a partial board on failure", async () => {
			const { persisted, deps, log } = recorder()
			const planned = plan([card({ lyricId: "1" }), card({ lyricId: "2" })], ["a", null], log)

			await syncBoard([], planned, deps)

			expect(persisted).toEqual([])
		})
	})
})

describe("carryForwardStates", () => {
	describe("happy paths", () => {
		it("carries a sealed decision forward onto the fresh entry", () => {
			const previous = [card({ lyricId: "4210", state: "sealed", actorId: "777" })]

			const carried = carryForwardStates(previous, [entry(4210)])

			expect(carried).toEqual([{ entry: entry(4210), state: "sealed", actorId: "777", note: null }])
		})

		it("carries a rejected decision forward with its actor and note", () => {
			const previous = [
				card({ lyricId: "4210", state: "rejected", actorId: "777", note: "bad sync" }),
			]

			const carried = carryForwardStates(previous, [entry(4210)])

			expect(carried).toEqual([
				{ entry: entry(4210), state: "rejected", actorId: "777", note: "bad sync" },
			])
		})
	})

	describe("edge cases", () => {
		it("marks a brand-new entry pending with no actor or note", () => {
			const carried = carryForwardStates([], [entry(99)])

			expect(carried).toEqual([{ entry: entry(99), state: "pending", actorId: null, note: null }])
		})

		it("returns nothing when there are no entries", () => {
			expect(carryForwardStates([card({ lyricId: "4210", state: "sealed" })], [])).toEqual([])
		})

		it("marks everything pending when there is no previous board", () => {
			const carried = carryForwardStates([], [entry(1), entry(2)])

			expect(carried.map((c) => c.state)).toEqual(["pending", "pending"])
		})
	})

	describe("invariants", () => {
		it("orders by the fresh entries, not the previous board", () => {
			const previous = [
				card({ lyricId: "2", state: "sealed" }),
				card({ lyricId: "1", state: "rejected" }),
			]

			const carried = carryForwardStates(previous, [entry(1), entry(2)])

			expect(carried.map((c) => [c.entry.id, c.state])).toEqual([
				[1, "rejected"],
				[2, "sealed"],
			])
		})

		it("drops a decided card that is no longer in the queue", () => {
			const previous = [
				card({ lyricId: "1", state: "sealed" }),
				card({ lyricId: "2", state: "rejected" }),
			]

			const carried = carryForwardStates(previous, [entry(1)])

			expect(carried.map((c) => c.entry.id)).toEqual([1])
		})
	})
})
