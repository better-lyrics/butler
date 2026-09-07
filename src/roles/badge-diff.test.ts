import { describe, expect, it } from "vitest"
import { type BadgeEntry, diffBadges } from "./badge-diff"

describe("diffBadges", () => {
	describe("happy path", () => {
		it("returns only the earned keys that are not already held", () => {
			const result = diffBadges({
				earned: [
					{ key: "first-blood", tier: null },
					{ key: "century", tier: 2 },
					{ key: "polyglot", tier: null },
				],
				held: [{ key: "century", tier: 2 }],
			})
			expect(result.newlyEarned).toEqual([
				{ key: "first-blood", tier: null },
				{ key: "polyglot", tier: null },
			])
		})
	})

	describe("first seed", () => {
		it("returns every earned badge when nothing is held", () => {
			const earned: BadgeEntry[] = [
				{ key: "first-blood", tier: null },
				{ key: "century", tier: 2 },
			]
			const result = diffBadges({ earned, held: [] })
			expect(result.newlyEarned).toEqual(earned)
		})
	})

	describe("no change", () => {
		it("returns empty when every earned key is already held", () => {
			const result = diffBadges({
				earned: [
					{ key: "century", tier: 2 },
					{ key: "polyglot", tier: null },
				],
				held: [
					{ key: "century", tier: 2 },
					{ key: "polyglot", tier: null },
					{ key: "first-blood", tier: null },
				],
			})
			expect(result.newlyEarned).toEqual([])
		})
	})

	describe("invariants", () => {
		it("does not mutate the earned input", () => {
			const earned: BadgeEntry[] = [
				{ key: "first-blood", tier: null },
				{ key: "century", tier: 2 },
			]
			const snapshot = structuredClone(earned)
			diffBadges({ earned, held: [{ key: "century", tier: 2 }] })
			expect(earned).toEqual(snapshot)
		})

		it("does not mutate the held input", () => {
			const held: BadgeEntry[] = [{ key: "century", tier: 2 }]
			const snapshot = structuredClone(held)
			diffBadges({ earned: [{ key: "first-blood", tier: null }], held })
			expect(held).toEqual(snapshot)
		})

		it("treats a held key with a different tier as not newly earned", () => {
			const result = diffBadges({
				earned: [{ key: "century", tier: 3 }],
				held: [{ key: "century", tier: 2 }],
			})
			expect(result.newlyEarned).toEqual([])
		})

		it("collapses duplicate earned keys to a single entry", () => {
			const result = diffBadges({
				earned: [
					{ key: "polyglot", tier: null },
					{ key: "polyglot", tier: null },
				],
				held: [],
			})
			expect(result.newlyEarned).toEqual([{ key: "polyglot", tier: null }])
		})

		it("preserves the order badges appear in earned", () => {
			const result = diffBadges({
				earned: [
					{ key: "zebra", tier: null },
					{ key: "alpha", tier: null },
					{ key: "mike", tier: null },
				],
				held: [],
			})
			expect(result.newlyEarned.map((badge) => badge.key)).toEqual(["zebra", "alpha", "mike"])
		})
	})

	describe("edge cases", () => {
		it("returns empty when nothing is earned", () => {
			const result = diffBadges({ earned: [], held: [{ key: "century", tier: 2 }] })
			expect(result.newlyEarned).toEqual([])
		})

		it("returns empty when both inputs are empty", () => {
			const result = diffBadges({ earned: [], held: [] })
			expect(result.newlyEarned).toEqual([])
		})
	})
})
