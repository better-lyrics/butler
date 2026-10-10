import type { FlagBoardRow } from "@/db/flag-board"
import { flagCase } from "@/unison/__fixtures__/flag"
import type { FlagCard } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { planFlagBoard } from "./flag-board-sync"

function row(caseId: number, overrides: Partial<FlagBoardRow> = {}): FlagBoardRow {
	return {
		caseId: String(caseId),
		messageId: `msg-${caseId}`,
		channelId: "chan-1",
		state: "pending",
		actorId: null,
		card: flagCase({ id: caseId }),
		...overrides,
	}
}

const open = (id: number, overrides: Partial<FlagCard> = {}) => flagCase({ id, ...overrides })
const empty = { toPost: [], toUpdate: [], toResolve: [], toForget: [] }

describe("planFlagBoard", () => {
	describe("happy paths", () => {
		it("posts a new open case", () => {
			expect(planFlagBoard([], [open(77)])).toEqual({ ...empty, toPost: [open(77)] })
		})

		it("leaves a tracked open case with the same tallies alone", () => {
			expect(planFlagBoard([row(77)], [open(77)])).toEqual(empty)
		})

		it("updates a tracked pending row when the removals change", () => {
			const card = open(77, { removals: 2 })
			expect(planFlagBoard([row(77)], [card])).toEqual({
				...empty,
				toUpdate: [{ row: row(77), card }],
			})
		})

		it("updates a tracked pending row when the keeps change", () => {
			const card = open(77, { keeps: 1 })
			expect(planFlagBoard([row(77)], [card]).toUpdate).toEqual([{ row: row(77), card }])
		})

		it("resolves a tracked pending row whose case was removed", () => {
			const card = open(77, { status: "removed", removals: 3, decidedAt: 10 })
			expect(planFlagBoard([row(77)], [card])).toEqual({
				...empty,
				toResolve: [{ row: row(77), card }],
			})
		})

		it("resolves a tracked pending row whose case was kept", () => {
			const card = open(77, { status: "kept", keeps: 3, decidedAt: 10 })
			expect(planFlagBoard([row(77)], [card]).toResolve).toEqual([{ row: row(77), card }])
		})

		it("resolves with a null card and forgets a pending row whose case is gone", () => {
			expect(planFlagBoard([row(77)], [])).toEqual({
				...empty,
				toResolve: [{ row: row(77), card: null }],
				toForget: [row(77)],
			})
		})

		it("forgets a decided row whose case is gone without resolving it again", () => {
			const decided = row(77, { state: "removed", actorId: "777" })
			expect(planFlagBoard([decided], [])).toEqual({ ...empty, toForget: [decided] })
		})
	})

	describe("edge cases", () => {
		it("does nothing when both sides are empty", () => {
			expect(planFlagBoard([], [])).toEqual(empty)
		})

		it("does not post a closed case that was never tracked", () => {
			const removed = open(77, { status: "removed" })
			const kept = open(78, { status: "kept" })
			expect(planFlagBoard([], [removed, kept])).toEqual(empty)
		})

		it("leaves a row decided in Discord alone while the server still lists it", () => {
			const decided = row(77, { state: "removed", actorId: "777" })
			expect(planFlagBoard([decided], [open(77, { status: "removed", removals: 9 })])).toEqual(
				empty
			)
			expect(planFlagBoard([decided], [open(77, { removals: 9 })])).toEqual(empty)
		})

		it("posts a duplicated case once", () => {
			expect(planFlagBoard([], [open(77), open(77)]).toPost).toEqual([open(77)])
		})

		it("plans a duplicated case for a tracked row once", () => {
			const card = open(77, { removals: 2 })
			expect(planFlagBoard([row(77)], [card, card]).toUpdate).toHaveLength(1)
			const closed = open(77, { status: "kept" })
			expect(planFlagBoard([row(77)], [closed, closed]).toResolve).toHaveLength(1)
		})

		it("ignores a change outside the tallies", () => {
			const card = open(77, { song: "Renamed", reports: [] })
			expect(planFlagBoard([row(77)], [card])).toEqual(empty)
		})
	})

	describe("invariants", () => {
		it("never puts one case in more than one of post, update and resolve", () => {
			const tracked = [row(1), row(2), row(3), row(4, { state: "kept" })]
			const cards = [
				open(1, { removals: 2 }),
				open(2, { status: "removed" }),
				open(4, { keeps: 5 }),
				open(5),
			]
			const plan = planFlagBoard(tracked, cards)
			const ids = [
				...plan.toPost.map((c) => String(c.id)),
				...plan.toUpdate.map((u) => u.row.caseId),
				...plan.toResolve.map((r) => r.row.caseId),
			]
			expect(ids.sort()).toEqual(["1", "2", "3", "5"])
			expect(new Set(ids).size).toBe(ids.length)
			expect(plan.toForget.map((r) => r.caseId)).toEqual(["3"])
		})

		it("does not mutate its inputs", () => {
			const tracked = [row(77)]
			const cards = [open(77, { removals: 2 }), open(78)]
			const before = JSON.stringify({ tracked, cards })
			planFlagBoard(tracked, cards)
			expect(JSON.stringify({ tracked, cards })).toBe(before)
		})
	})
})
