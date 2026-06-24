import type { TierConfig } from "@/roles/tiers"
import type { LeaderboardEntry } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { type SyncDeps, runSync } from "./sync"

const tiers: TierConfig = {
	podium: ["rank-1", "rank-2", "rank-3"],
	special: { topPercent: 50, tier: "special" },
	base: { topPercent: 100, tier: "lyricist" },
}

const tierOrder = ["lyricist", "special", "rank-3", "rank-2", "rank-1"]

function makeEntry(keyId: string, rank: number): LeaderboardEntry {
	return {
		keyId,
		reputation: 1000 - rank,
		score: 1000 - rank,
		submissionCount: 10,
		totalUpvotes: 5,
		fulfilledCount: 3,
		fulfilledDemand: 2,
		rank,
		displayName: `curator-${keyId}`,
	}
}

function makeLeaderboard(count: number): LeaderboardEntry[] {
	return Array.from({ length: count }, (_, i) => makeEntry(`k${i + 1}`, i + 1))
}

interface Recorders {
	applied: Array<{ discordId: string; tier: string | null }>
	persisted: Array<{ discordId: string; tier: string | null }>
	announced: Array<{ discordId: string; tier: string }>
}

interface Overrides {
	leaderboard?: LeaderboardEntry[]
	blacklist?: Set<string>
	links?: Map<string, string>
	holdings?: Map<string, string>
}

function buildDeps(overrides: Overrides = {}): { deps: SyncDeps; rec: Recorders } {
	const leaderboard = overrides.leaderboard ?? makeLeaderboard(10)
	const blacklist = overrides.blacklist ?? new Set<string>()
	const links = overrides.links ?? new Map<string, string>()
	const holdings = overrides.holdings ?? new Map<string, string>()

	const rec: Recorders = { applied: [], persisted: [], announced: [] }

	const deps: SyncDeps = {
		async getLeaderboard() {
			return leaderboard
		},
		async getBlacklist() {
			return blacklist
		},
		async resolveMember(keyId) {
			const discordId = links.get(keyId)
			return discordId === undefined ? null : { discordId }
		},
		async getHoldings() {
			return new Map(holdings)
		},
		async applyMemberRoles(discordId, tier) {
			rec.applied.push({ discordId, tier })
		},
		async persistHolding(discordId, tier) {
			rec.persisted.push({ discordId, tier })
		},
		async announcePromotion(promo) {
			rec.announced.push({ discordId: promo.discordId, tier: promo.tier })
		},
		tiers,
		tierOrder,
	}

	return { deps, rec }
}

describe("runSync", () => {
	describe("grants", () => {
		it("grants the top-ranked linked member the rank-1 tier", async () => {
			const links = new Map([["k1", "d1"]])
			const { deps, rec } = buildDeps({ links })

			const result = await runSync(deps)

			expect(rec.applied).toContainEqual({ discordId: "d1", tier: "rank-1" })
			expect(rec.persisted).toContainEqual({ discordId: "d1", tier: "rank-1" })
			expect(result.granted).toBeGreaterThan(0)
		})
	})

	describe("blacklist", () => {
		it("never grants a role to a blacklisted key even if it would rank first", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const blacklist = new Set(["k1"])
			const { deps, rec } = buildDeps({ links, blacklist })

			await runSync(deps)

			const touchedD1 = rec.applied.some((c) => c.discordId === "d1")
			expect(touchedD1).toBe(false)
		})
	})

	describe("unlinked or not in guild", () => {
		it("grants nothing to a top-ranker whose member cannot be resolved", async () => {
			const links = new Map<string, string>()
			const { deps, rec } = buildDeps({ links })

			await runSync(deps)

			expect(rec.applied).toEqual([])
			expect(rec.announced).toEqual([])
		})
	})

	describe("announcements", () => {
		it("announces a brand-new grant", async () => {
			const links = new Map([["k1", "d1"]])
			const { deps, rec } = buildDeps({ links })

			await runSync(deps)

			expect(rec.announced).toContainEqual({ discordId: "d1", tier: "rank-1" })
		})

		it("does not announce a demotion", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "rank-1"]])
			const leaderboard = [
				makeEntry("k1", 4),
				makeEntry("k2", 1),
				makeEntry("k3", 2),
				makeEntry("k4", 3),
			]
			const { deps, rec } = buildDeps({ links, holdings, leaderboard })

			await runSync(deps)

			const demoted = rec.applied.find((c) => c.discordId === "d1")
			expect(demoted).toBeDefined()
			expect(demoted?.tier).not.toBe("rank-1")
			expect(rec.announced.some((a) => a.discordId === "d1")).toBe(false)
		})

		it("removes and does not announce a member that no longer qualifies", async () => {
			// d1 drops out (its key is blacklisted) while d2 still qualifies, so the desired set
			// is non-empty and the empty-leaderboard guard does not apply: this exercises a real removal.
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const holdings = new Map([["d1", "special"]])
			const leaderboard = [makeEntry("k1", 1), makeEntry("k2", 2)]
			const blacklist = new Set(["k1"])
			const { deps, rec } = buildDeps({ links, holdings, leaderboard, blacklist })

			await runSync(deps)

			expect(rec.applied).toContainEqual({ discordId: "d1", tier: null })
			expect(rec.persisted).toContainEqual({ discordId: "d1", tier: null })
			expect(rec.announced.some((a) => a.discordId === "d1")).toBe(false)
		})
	})

	describe("idempotence", () => {
		it("makes no changes when holdings already match the desired tiers", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
				["k3", "d3"],
			])
			const leaderboard = makeLeaderboard(3)
			const seed = buildDeps({ links, leaderboard })
			await runSync(seed.deps)

			const holdings = new Map<string, string>()
			for (const change of seed.rec.persisted) {
				if (change.tier !== null) holdings.set(change.discordId, change.tier)
			}

			const { deps, rec } = buildDeps({ links, leaderboard, holdings })
			const result = await runSync(deps)

			expect(rec.applied).toEqual([])
			expect(rec.announced).toEqual([])
			expect(result).toEqual({
				granted: 0,
				removed: 0,
				announced: 0,
				skipped: false,
				transitions: [],
			})
		})
	})

	describe("transitions", () => {
		it("returns a grant transition for a brand-new role", async () => {
			const links = new Map([["k1", "d1"]])
			const { deps } = buildDeps({ links })

			const result = await runSync(deps)

			expect(result.transitions).toContainEqual({ discordId: "d1", from: null, to: "rank-1" })
		})

		it("returns a move transition when a member changes tier", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "rank-1"]])
			const leaderboard = [
				makeEntry("k1", 4),
				makeEntry("k2", 1),
				makeEntry("k3", 2),
				makeEntry("k4", 3),
			]
			const { deps } = buildDeps({ links, holdings, leaderboard })

			const result = await runSync(deps)

			const moved = result.transitions.find((t) => t.discordId === "d1")
			expect(moved?.from).toBe("rank-1")
			expect(moved?.to).not.toBeNull()
			expect(moved?.to).not.toBe("rank-1")
		})
	})

	describe("empty leaderboard guard", () => {
		it("skips and strips nothing when the desired set is empty but holdings exist", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "rank-1"]])
			const leaderboard: LeaderboardEntry[] = []
			const { deps, rec } = buildDeps({ links, holdings, leaderboard })

			const result = await runSync(deps)

			expect(rec.applied).toEqual([])
			expect(rec.persisted).toEqual([])
			expect(rec.announced).toEqual([])
			expect(result).toEqual({
				granted: 0,
				removed: 0,
				announced: 0,
				skipped: true,
				transitions: [],
			})
		})
	})
})
