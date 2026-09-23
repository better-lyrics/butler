import type { RevisionBoardRow } from "@/db/revision-board"
import { pendingRevision } from "@/unison/__fixtures__/pending-revision"
import { describe, expect, it } from "vitest"
import { planRevisionBoard } from "./revision-board-sync"

function row(revisionId: number, overrides: Partial<RevisionBoardRow> = {}): RevisionBoardRow {
	return {
		revisionId: String(revisionId),
		messageId: `msg-${revisionId}`,
		channelId: "chan-1",
		state: "pending",
		actorId: null,
		note: null,
		card: pendingRevision({ revisionId }),
		...overrides,
	}
}

const pending = (revisionId: number) => pendingRevision({ revisionId })

describe("planRevisionBoard", () => {
	describe("happy paths", () => {
		it("posts a new pending revision", () => {
			expect(planRevisionBoard([], [pending(918)])).toEqual({
				toPost: [pending(918)],
				toResolve: [],
				toForget: [],
			})
		})

		it("leaves a tracked revision that is still pending alone", () => {
			expect(planRevisionBoard([row(918)], [pending(918)])).toEqual({
				toPost: [],
				toResolve: [],
				toForget: [],
			})
		})

		it("resolves and forgets an undecided card whose revision left the list", () => {
			const plan = planRevisionBoard([row(918)], [])
			expect(plan.toResolve.map((r) => r.revisionId)).toEqual(["918"])
			expect(plan.toForget.map((r) => r.revisionId)).toEqual(["918"])
		})

		it("forgets a decided card without resolving it again", () => {
			const plan = planRevisionBoard([row(918, { state: "approved", actorId: "777" })], [])
			expect(plan.toResolve).toEqual([])
			expect(plan.toForget.map((r) => r.revisionId)).toEqual(["918"])
		})
	})

	describe("edge cases", () => {
		it("does nothing when both sides are empty", () => {
			expect(planRevisionBoard([], [])).toEqual({ toPost: [], toResolve: [], toForget: [] })
		})

		it("leaves a card decided in Discord alone while the server still lists it", () => {
			const plan = planRevisionBoard(
				[row(918, { state: "rejected", actorId: "777" })],
				[pending(918)]
			)
			expect(plan).toEqual({ toPost: [], toResolve: [], toForget: [] })
		})

		it("matches a numeric revision id against the stored string id", () => {
			expect(planRevisionBoard([row(918)], [pendingRevision({ revisionId: 918 })]).toPost).toEqual(
				[]
			)
		})
	})

	describe("regressions", () => {
		it("regression: posts a revision listed twice only once", () => {
			expect(planRevisionBoard([], [pending(918), pending(918)]).toPost).toEqual([pending(918)])
		})
	})

	describe("invariants", () => {
		it("keeps the server's oldest-first order for new posts", () => {
			const plan = planRevisionBoard(
				[row(919)],
				[pending(917), pending(919), pending(921), pending(920)]
			)
			expect(plan.toPost.map((c) => c.revisionId)).toEqual([917, 921, 920])
		})

		it("never posts and forgets the same revision", () => {
			const plan = planRevisionBoard(
				[row(1), row(2, { state: "approved" })],
				[pending(2), pending(3)]
			)
			const posted = new Set(plan.toPost.map((c) => String(c.revisionId)))
			for (const r of plan.toForget) expect(posted.has(r.revisionId)).toBe(false)
		})

		it("only resolves rows it also forgets", () => {
			const plan = planRevisionBoard([row(1), row(2, { state: "rejected" }), row(3)], [pending(3)])
			const forgotten = new Set(plan.toForget.map((r) => r.revisionId))
			for (const r of plan.toResolve) expect(forgotten.has(r.revisionId)).toBe(true)
		})

		it("does not mutate its inputs", () => {
			const tracked = [row(1)]
			const list = [pending(2)]
			const before = structuredClone({ tracked, list })
			planRevisionBoard(tracked, list)
			expect({ tracked, list }).toEqual(before)
		})
	})
})
