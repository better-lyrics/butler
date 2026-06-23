import { describe, expect, it } from "vitest"
import { type Curator, type TierConfig, computeTiers } from "./tiers"

const TIERS: TierConfig = {
	podium: ["rank-1", "rank-2", "rank-3"],
	special: { topPercent: 5, tier: "special" },
	base: { topPercent: 20, tier: "lyricist" },
}

function ladder(n: number): Curator[] {
	return Array.from({ length: n }, (_, i) => ({ keyId: `k${i}`, rank: i + 1, score: n - i }))
}

const TIER_STRINGS = new Set([...TIERS.podium, TIERS.special.tier, TIERS.base.tier])

describe("computeTiers", () => {
	it("assigns podium, special, and base tiers by percentile", () => {
		const tiers = computeTiers(ladder(100), new Set(), TIERS)
		expect(tiers.get("k0")).toBe("rank-1")
		expect(tiers.get("k1")).toBe("rank-2")
		expect(tiers.get("k2")).toBe("rank-3")
		expect(tiers.get("k4")).toBe("special")
		expect(tiers.get("k10")).toBe("lyricist")
		expect(tiers.get("k50")).toBeUndefined()
	})

	it("places a key below the base percentile as absent", () => {
		const tiers = computeTiers(ladder(100), new Set(), TIERS)
		expect(tiers.get("k20")).toBeUndefined()
		expect(tiers.has("k20")).toBe(false)
	})

	describe("blacklist", () => {
		it("excludes blacklisted keys before ranking and shifts the rest up", () => {
			const tiers = computeTiers(ladder(100), new Set(["k0"]), TIERS)
			expect(tiers.has("k0")).toBe(false)
			expect(tiers.get("k1")).toBe("rank-1")
		})
	})

	describe("tiny populations", () => {
		it("does not crash with a single curator and assigns podium", () => {
			const tiers = computeTiers(ladder(1), new Set(), TIERS)
			expect(tiers.size).toBe(1)
			expect(tiers.get("k0")).toBe("rank-1")
		})

		it("does not crash with two curators and assigns the top two podium slots", () => {
			const tiers = computeTiers(ladder(2), new Set(), TIERS)
			expect(tiers.get("k0")).toBe("rank-1")
			expect(tiers.get("k1")).toBe("rank-2")
		})

		it("does not crash with three curators and assigns the full podium", () => {
			const tiers = computeTiers(ladder(3), new Set(), TIERS)
			expect(tiers.get("k0")).toBe("rank-1")
			expect(tiers.get("k1")).toBe("rank-2")
			expect(tiers.get("k2")).toBe("rank-3")
		})
	})

	describe("edges and invariants", () => {
		it("handles an empty leaderboard", () => {
			expect(computeTiers([], new Set(), TIERS).size).toBe(0)
		})

		it("never puts a key in two tiers and only emits assigned keys", () => {
			const tiers = computeTiers(ladder(50), new Set(), TIERS)
			for (const [, tier] of tiers) expect(typeof tier).toBe("string")
		})

		it("only emits configured tier strings", () => {
			const tiers = computeTiers(ladder(200), new Set(), TIERS)
			for (const [, tier] of tiers) expect(TIER_STRINGS.has(tier)).toBe(true)
		})

		it("emits a key set that is a subset of the non-blacklisted input keys", () => {
			const blacklist = new Set(["k0", "k7", "k13"])
			const input = ladder(80)
			const allowed = new Set(input.map((c) => c.keyId).filter((id) => !blacklist.has(id)))
			const tiers = computeTiers(input, blacklist, TIERS)
			for (const key of tiers.keys()) expect(allowed.has(key)).toBe(true)
		})
	})
})
