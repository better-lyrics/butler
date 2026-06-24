import { describe, expect, it } from "vitest"
import { diffHoldings, roleTransitions } from "./diff"

const order = ["lyricist", "special", "rank-3", "rank-2", "rank-1"]

describe("diffHoldings", () => {
	describe("new grant", () => {
		it("grants the desired tier when no current is held", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map(),
				order,
			})
			expect(result.grants).toEqual([{ discordId: "u1", tier: "special" }])
			expect(result.removals).toEqual([])
		})
		it("records the new grant as a promotion with a null previousTier", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map(),
				order,
			})
			expect(result.promotions).toEqual([{ discordId: "u1", tier: "special", previousTier: null }])
		})
	})

	describe("upgrade", () => {
		it("removes the old tier and grants the new tier", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map([["u1", "lyricist"]]),
				order,
			})
			expect(result.removals).toEqual([{ discordId: "u1", tier: "lyricist" }])
			expect(result.grants).toEqual([{ discordId: "u1", tier: "special" }])
		})
		it("records the upgrade as a promotion carrying the previous tier", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map([["u1", "lyricist"]]),
				order,
			})
			expect(result.promotions).toEqual([
				{ discordId: "u1", tier: "special", previousTier: "lyricist" },
			])
		})
	})

	describe("downgrade", () => {
		it("removes the old tier and grants the new tier", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "lyricist"]]),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(result.removals).toEqual([{ discordId: "u1", tier: "special" }])
			expect(result.grants).toEqual([{ discordId: "u1", tier: "lyricist" }])
		})
		it("is not a promotion", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "lyricist"]]),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(result.promotions).toEqual([])
		})
	})

	describe("unchanged", () => {
		it("produces no grant, removal, or promotion when desired equals current", () => {
			const result = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(result.grants).toEqual([])
			expect(result.removals).toEqual([])
			expect(result.promotions).toEqual([])
		})
	})

	describe("dropped", () => {
		it("removes the held tier when no tier is desired", () => {
			const result = diffHoldings({
				desired: new Map(),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(result.removals).toEqual([{ discordId: "u1", tier: "special" }])
			expect(result.grants).toEqual([])
		})
		it("is not a promotion", () => {
			const result = diffHoldings({
				desired: new Map(),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(result.promotions).toEqual([])
		})
	})

	describe("roleTransitions", () => {
		it("reports a fresh grant as from null to the new tier", () => {
			const diff = diffHoldings({
				desired: new Map([["u1", "special"]]),
				current: new Map(),
				order,
			})
			expect(roleTransitions(diff)).toEqual([{ discordId: "u1", from: null, to: "special" }])
		})

		it("reports a drop as from the old tier to null", () => {
			const diff = diffHoldings({
				desired: new Map(),
				current: new Map([["u1", "special"]]),
				order,
			})
			expect(roleTransitions(diff)).toEqual([{ discordId: "u1", from: "special", to: null }])
		})

		it("collapses a tier change into one move with both ends", () => {
			const diff = diffHoldings({
				desired: new Map([["u1", "rank-1"]]),
				current: new Map([["u1", "lyricist"]]),
				order,
			})
			expect(roleTransitions(diff)).toEqual([{ discordId: "u1", from: "lyricist", to: "rank-1" }])
		})

		it("returns nothing when the diff is empty", () => {
			const diff = diffHoldings({ desired: new Map(), current: new Map(), order })
			expect(roleTransitions(diff)).toEqual([])
		})
	})

	describe("invariants", () => {
		it("yields empty arrays for empty input", () => {
			const result = diffHoldings({ desired: new Map(), current: new Map(), order })
			expect(result).toEqual({ grants: [], removals: [], promotions: [] })
		})
		it("treats every promotion as a subset of grants", () => {
			const result = diffHoldings({
				desired: new Map([
					["u1", "special"],
					["u2", "lyricist"],
				]),
				current: new Map([["u2", "special"]]),
				order,
			})
			for (const promotion of result.promotions) {
				expect(result.grants).toContainEqual({
					discordId: promotion.discordId,
					tier: promotion.tier,
				})
			}
		})
	})
})
