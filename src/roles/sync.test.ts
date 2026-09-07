import type { LeaderboardEntry, TierName } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { type SyncDeps, runSync } from "./sync"

const tierOrder = ["lyricist", "elite", "master", "grandmaster", "legendary"]

function makeEntry(keyId: string, rank: number, tier: TierName | null = null): LeaderboardEntry {
	return {
		keyId,
		reputation: 1000 - rank,
		score: 1000 - rank,
		submissionCount: 10,
		totalUpvotes: 5,
		fulfilledCount: 3,
		fulfilledDemand: 2,
		rank,
		community: false,
		discordLinked: false,
		tier,
		level: 0,
		xp: 0,
		xpForNext: null,
		badgeCount: 0,
		topBadge: null,
		featured: [],
		displayName: `curator-${keyId}`,
	}
}

function makeLeaderboard(): LeaderboardEntry[] {
	return [
		makeEntry("k1", 1, "legendary"),
		makeEntry("k2", 2, "grandmaster"),
		makeEntry("k3", 3, "master"),
	]
}

interface Recorders {
	applied: Array<{ discordId: string; tier: string | null }>
	persisted: Array<{ discordId: string; tier: string | null }>
	announced: Array<{ discordId: string; tier: string }>
}

interface Overrides {
	leaderboard?: LeaderboardEntry[]
	links?: Map<string, string>
	holdings?: Map<string, string>
}

function buildDeps(overrides: Overrides = {}): { deps: SyncDeps; rec: Recorders } {
	const leaderboard = overrides.leaderboard ?? makeLeaderboard()
	const links = overrides.links ?? new Map<string, string>()
	const holdings = overrides.holdings ?? new Map<string, string>()

	const rec: Recorders = { applied: [], persisted: [], announced: [] }

	const deps: SyncDeps = {
		async getLeaderboard() {
			return leaderboard
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
		tierOrder,
	}

	return { deps, rec }
}

describe("runSync", () => {
	describe("grants", () => {
		it("grants a linked member the tier from their leaderboard row", async () => {
			const links = new Map([["k1", "d1"]])
			const { deps, rec } = buildDeps({ links })

			const result = await runSync(deps)

			expect(rec.applied).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(rec.persisted).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(result.granted).toBeGreaterThan(0)
		})
	})

	describe("server-owned tiers", () => {
		it("takes each member's tier straight from the row", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const leaderboard = [makeEntry("k1", 1, "elite"), makeEntry("k2", 2, "lyricist")]
			const { deps, rec } = buildDeps({ links, leaderboard })

			await runSync(deps)

			expect(rec.applied).toContainEqual({ discordId: "d1", tier: "elite" })
			expect(rec.applied).toContainEqual({ discordId: "d2", tier: "lyricist" })
		})

		it("skips rows with a null tier (the community account and unranked rows)", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const leaderboard = [makeEntry("k1", 0, null), makeEntry("k2", 1, "legendary")]
			const { deps, rec } = buildDeps({ links, leaderboard })

			await runSync(deps)

			expect(rec.applied.some((c) => c.discordId === "d1")).toBe(false)
			expect(rec.applied).toContainEqual({ discordId: "d2", tier: "legendary" })
		})

		it("has no blacklist dependency to consult", () => {
			const { deps } = buildDeps()
			expect("getBlacklist" in deps).toBe(false)
		})
	})

	describe("unlinked or not in guild", () => {
		it("grants nothing to a tiered row whose member cannot be resolved", async () => {
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

			expect(rec.announced).toContainEqual({ discordId: "d1", tier: "legendary" })
		})

		it("does not announce a demotion", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 4, "lyricist"), makeEntry("k2", 1, "legendary")]
			const { deps, rec } = buildDeps({ links, holdings, leaderboard })

			await runSync(deps)

			const demoted = rec.applied.find((c) => c.discordId === "d1")
			expect(demoted).toBeDefined()
			expect(demoted?.tier).not.toBe("legendary")
			expect(rec.announced.some((a) => a.discordId === "d1")).toBe(false)
		})

		it("removes and does not announce a member that no longer qualifies", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const holdings = new Map([["d1", "elite"]])
			const leaderboard = [makeEntry("k1", 1, null), makeEntry("k2", 2, "legendary")]
			const { deps, rec } = buildDeps({ links, holdings, leaderboard })

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
			const seed = buildDeps({ links })
			await runSync(seed.deps)

			const holdings = new Map<string, string>()
			for (const change of seed.rec.persisted) {
				if (change.tier !== null) holdings.set(change.discordId, change.tier)
			}

			const { deps, rec } = buildDeps({ links, holdings })
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

			expect(result.transitions).toContainEqual({ discordId: "d1", from: null, to: "legendary" })
		})

		it("returns a move transition when a member changes tier", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 4, "lyricist"), makeEntry("k2", 1, "legendary")]
			const { deps } = buildDeps({ links, holdings, leaderboard })

			const result = await runSync(deps)

			const moved = result.transitions.find((t) => t.discordId === "d1")
			expect(moved?.from).toBe("legendary")
			expect(moved?.to).not.toBeNull()
			expect(moved?.to).not.toBe("legendary")
		})
	})

	describe("empty leaderboard guard", () => {
		it("skips and strips nothing when the desired set is empty but holdings exist", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
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
