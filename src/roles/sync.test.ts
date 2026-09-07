import type { BadgeEntry } from "@/roles/badge-diff"
import type {
	BadgeCatalogue,
	BadgeDef,
	LeaderboardEntry,
	TierName,
	UserBadge,
} from "@/unison/client"
import { describe, expect, it } from "vitest"
import { type SyncDeps, runSync } from "./sync"

const tierOrder = ["lyricist", "elite", "master", "grandmaster", "legendary"]

const NOW = 1_700_000_000_000

function makeBadgeDef(
	key: string,
	kind: BadgeDef["kind"],
	name: string,
	description: string
): BadgeDef {
	return { key, name, description, category: "general", kind, image: { color: "", mono: "" } }
}

function makeCatalogue(badges: BadgeDef[]): BadgeCatalogue {
	return {
		badges,
		display: { inlineGlyphs: 3, featuredMax: 3, rarityThreshold: 0, categoryOrder: [] },
	}
}

function makeUserBadge(key: string, earned: boolean, tier?: number): UserBadge {
	return { key, earned, tier, featured: false }
}

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
	recordedBadges: Array<{
		discordId: string
		badgeKey: string
		tier: number | null
		awardedAt: number
	}>
	markedSeeded: Array<{ discordId: string; seededAt: number }>
	announcedBadges: Array<{ discordId: string; badgeName: string; badgeDescription: string }>
	summaries: Array<{
		promotions: Array<{ displayName: string; tier: string }>
		badges: Array<{ displayName: string; badgeName: string }>
	}>
	badgesFetched: string[]
}

interface Overrides {
	leaderboard?: LeaderboardEntry[]
	links?: Map<string, string>
	holdings?: Map<string, string>
	catalogue?: BadgeCatalogue | null
	userBadges?: Map<string, UserBadge[]>
	badgeHoldings?: Map<string, BadgeEntry[]>
	seeded?: Set<string>
	batchThreshold?: number
	failUserBadges?: Set<string>
	announceBadgeFails?: boolean
	announceSummaryFails?: boolean
}

function buildDeps(overrides: Overrides = {}): { deps: SyncDeps; rec: Recorders } {
	const leaderboard = overrides.leaderboard ?? makeLeaderboard()
	const links = overrides.links ?? new Map<string, string>()
	const holdings = overrides.holdings ?? new Map<string, string>()
	const catalogue: BadgeCatalogue | null =
		"catalogue" in overrides ? (overrides.catalogue ?? null) : makeCatalogue([])
	const userBadges = overrides.userBadges ?? new Map<string, UserBadge[]>()
	const badgeHoldings = overrides.badgeHoldings ?? new Map<string, BadgeEntry[]>()
	const seeded = overrides.seeded ?? new Set<string>()
	const failUserBadges = overrides.failUserBadges ?? new Set<string>()

	const rec: Recorders = {
		applied: [],
		persisted: [],
		announced: [],
		recordedBadges: [],
		markedSeeded: [],
		announcedBadges: [],
		summaries: [],
		badgesFetched: [],
	}

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
		async getUserBadges(keyId) {
			rec.badgesFetched.push(keyId)
			if (failUserBadges.has(keyId)) return null
			const badges = userBadges.get(keyId) ?? []
			return {
				keyId,
				level: 0,
				xp: 0,
				xpForNext: null,
				tier: null,
				tierRank: null,
				badges,
				featured: [],
				counts: { earned: badges.filter((b) => b.earned).length, total: badges.length },
			}
		},
		async getBadgeCatalogue() {
			return catalogue
		},
		async getBadgeHoldings(discordId) {
			return [...(badgeHoldings.get(discordId) ?? [])]
		},
		async recordBadge(discordId, badge) {
			rec.recordedBadges.push({ discordId, ...badge })
			const list = badgeHoldings.get(discordId) ?? []
			const existing = list.find((h) => h.key === badge.badgeKey)
			if (existing) existing.tier = badge.tier
			else list.push({ key: badge.badgeKey, tier: badge.tier })
			badgeHoldings.set(discordId, list)
		},
		async isSeeded(discordId) {
			return seeded.has(discordId)
		},
		async markSeeded(discordId, seededAt) {
			rec.markedSeeded.push({ discordId, seededAt })
			seeded.add(discordId)
		},
		async announceBadge(input) {
			if (overrides.announceBadgeFails) return false
			rec.announcedBadges.push(input)
			return true
		},
		async announceSummary(input) {
			if (overrides.announceSummaryFails) return false
			rec.summaries.push(input)
			return true
		},
		now() {
			return NOW
		},
		tierOrder,
		batchThreshold: overrides.batchThreshold ?? 5,
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

	describe("badge awards", () => {
		const nightOwl = makeBadgeDef("night-owl", "medal", "Night Owl", "Fixed lyrics after midnight.")

		it("seeds a first-sight member's medals silently and announces nothing", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k1", [makeUserBadge("night-owl", true)]]])
			const { deps, rec } = buildDeps({ links, holdings, leaderboard, catalogue, userBadges })

			await runSync(deps)

			expect(rec.recordedBadges).toContainEqual({
				discordId: "d1",
				badgeKey: "night-owl",
				tier: null,
				awardedAt: NOW,
			})
			expect(rec.markedSeeded).toContainEqual({ discordId: "d1", seededAt: NOW })
			expect(rec.announcedBadges).toEqual([])
			expect(rec.announced).toEqual([])
			expect(rec.summaries).toEqual([])
		})

		it("announces a newly earned medal once and stays idempotent on the next sync", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k1", [makeUserBadge("night-owl", true)]]])
			const seeded = new Set(["d1"])
			const { deps, rec } = buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
			})

			await runSync(deps)

			expect(rec.announcedBadges).toEqual([
				{
					discordId: "d1",
					badgeName: "Night Owl",
					badgeDescription: "Fixed lyrics after midnight.",
				},
			])
			expect(rec.recordedBadges).toContainEqual({
				discordId: "d1",
				badgeKey: "night-owl",
				tier: null,
				awardedAt: NOW,
			})

			await runSync(deps)

			expect(rec.announcedBadges).toHaveLength(1)
		})

		it("never records or announces a title-kind badge as a medal", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const catalogue = makeCatalogue([
				makeBadgeDef("top-curator", "title", "Top Curator", "Holds the top rank."),
			])
			const userBadges = new Map([["k1", [makeUserBadge("top-curator", true, 1)]]])
			const seeded = new Set(["d1"])
			const { deps, rec } = buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
			})

			await runSync(deps)

			expect(rec.recordedBadges).toEqual([])
			expect(rec.announcedBadges).toEqual([])
		})

		it("does not fetch or process badges for null-tier rows", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const holdings = new Map([["d2", "legendary"]])
			const leaderboard = [makeEntry("k1", 0, null), makeEntry("k2", 1, "legendary")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([
				["k1", [makeUserBadge("night-owl", true)]],
				["k2", []],
			])
			const seeded = new Set(["d1", "d2"])
			const { deps, rec } = buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
			})

			await runSync(deps)

			expect(rec.badgesFetched).not.toContain("k1")
			expect(rec.recordedBadges.some((r) => r.discordId === "d1")).toBe(false)
			expect(rec.announcedBadges).toEqual([])
		})
	})

	describe("resilience", () => {
		const nightOwl = makeBadgeDef("night-owl", "medal", "Night Owl", "Fixed lyrics after midnight.")

		it("regression: a failing badge fetch for one member does not abort the sync", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const leaderboard = [makeEntry("k1", 1, "legendary"), makeEntry("k2", 2, "grandmaster")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k2", [makeUserBadge("night-owl", true)]]])
			const seeded = new Set(["d2"])
			const { deps, rec } = buildDeps({
				links,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
				failUserBadges: new Set(["k1"]),
			})

			await runSync(deps)

			expect(rec.announced).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(rec.announced).toContainEqual({ discordId: "d2", tier: "grandmaster" })
			expect(rec.announcedBadges).toContainEqual({
				discordId: "d2",
				badgeName: "Night Owl",
				badgeDescription: "Fixed lyrics after midnight.",
			})
			expect(rec.recordedBadges.some((r) => r.discordId === "d1")).toBe(false)
		})

		it("regression: a null badge catalogue still lets promotions announce", async () => {
			const links = new Map([["k1", "d1"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const { deps, rec } = buildDeps({ links, leaderboard, catalogue: null })

			await runSync(deps)

			expect(rec.announced).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(rec.badgesFetched).toEqual([])
			expect(rec.recordedBadges).toEqual([])
		})

		it("regression: does not record a badge whose announcement fails, and announces it next sync", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k1", [makeUserBadge("night-owl", true)]]])
			const badgeHoldings = new Map<string, BadgeEntry[]>()
			const seeded = new Set(["d1"])
			const overrides: Overrides = {
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				badgeHoldings,
				seeded,
				announceBadgeFails: true,
			}
			const { deps, rec } = buildDeps(overrides)

			await runSync(deps)

			expect(rec.announcedBadges).toEqual([])
			expect(rec.recordedBadges.some((r) => r.badgeKey === "night-owl")).toBe(false)

			overrides.announceBadgeFails = false
			await runSync(deps)

			expect(rec.announcedBadges).toContainEqual({
				discordId: "d1",
				badgeName: "Night Owl",
				badgeDescription: "Fixed lyrics after midnight.",
			})
			expect(rec.recordedBadges).toContainEqual({
				discordId: "d1",
				badgeKey: "night-owl",
				tier: null,
				awardedAt: NOW,
			})
		})

		it("regression: records no badge when the batched summary fails, then records it next sync", async () => {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const holdings = new Map([["d2", "grandmaster"]])
			const leaderboard = [makeEntry("k1", 1, "legendary"), makeEntry("k2", 2, "grandmaster")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k2", [makeUserBadge("night-owl", true)]]])
			const badgeHoldings = new Map<string, BadgeEntry[]>()
			const seeded = new Set(["d2"])
			const overrides: Overrides = {
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				badgeHoldings,
				seeded,
				batchThreshold: 1,
				announceSummaryFails: true,
			}
			const { deps, rec } = buildDeps(overrides)

			await runSync(deps)

			expect(rec.summaries).toEqual([])
			expect(rec.recordedBadges.some((r) => r.badgeKey === "night-owl")).toBe(false)

			overrides.announceSummaryFails = false
			await runSync(deps)

			expect(rec.summaries).toHaveLength(1)
			expect(rec.recordedBadges).toContainEqual({
				discordId: "d2",
				badgeKey: "night-owl",
				tier: null,
				awardedAt: NOW,
			})
		})
	})

	describe("batching", () => {
		const nightOwl = makeBadgeDef("night-owl", "medal", "Night Owl", "Fixed lyrics after midnight.")

		function batchingDeps(batchThreshold?: number) {
			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
			])
			const holdings = new Map([["d2", "grandmaster"]])
			const leaderboard = [makeEntry("k1", 1, "legendary"), makeEntry("k2", 2, "grandmaster")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k2", [makeUserBadge("night-owl", true)]]])
			const seeded = new Set(["d2"])
			return buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
				batchThreshold,
			})
		}

		it("posts individual cards when the combined count is at or below the threshold", async () => {
			const { deps, rec } = batchingDeps()

			const result = await runSync(deps)

			expect(rec.announced).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(rec.announcedBadges).toEqual([
				{
					discordId: "d2",
					badgeName: "Night Owl",
					badgeDescription: "Fixed lyrics after midnight.",
				},
			])
			expect(rec.summaries).toEqual([])
			expect(result.announced).toBe(2)
		})

		it("posts one summary card when the combined count exceeds the threshold", async () => {
			const { deps, rec } = batchingDeps(1)

			await runSync(deps)

			expect(rec.summaries).toHaveLength(1)
			expect(rec.summaries[0]).toEqual({
				promotions: [{ displayName: "curator-k1", tier: "legendary" }],
				badges: [{ displayName: "curator-k2", badgeName: "Night Owl" }],
			})
			expect(rec.announced).toEqual([])
			expect(rec.announcedBadges).toEqual([])
		})

		it("announces nothing when there are no promotions and no new badges", async () => {
			const links = new Map([["k1", "d1"]])
			const holdings = new Map([["d1", "legendary"]])
			const leaderboard = [makeEntry("k1", 1, "legendary")]
			const catalogue = makeCatalogue([nightOwl])
			const userBadges = new Map([["k1", [makeUserBadge("night-owl", true)]]])
			const badgeHoldings = new Map([["d1", [{ key: "night-owl", tier: null }]]])
			const seeded = new Set(["d1"])
			const { deps, rec } = buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				badgeHoldings,
				seeded,
			})

			const result = await runSync(deps)

			expect(rec.announced).toEqual([])
			expect(rec.announcedBadges).toEqual([])
			expect(rec.summaries).toEqual([])
			expect(result.announced).toBe(0)
		})
	})

	describe("end-to-end", () => {
		it("folds promotions, new medals, silent seeds, and skips into one summary card", async () => {
			const nightOwl = makeBadgeDef(
				"night-owl",
				"medal",
				"Night Owl",
				"Fixed lyrics after midnight."
			)
			const polyglot = makeBadgeDef(
				"polyglot",
				"medal",
				"Polyglot",
				"Fixed lyrics in five languages."
			)
			const firstFix = makeBadgeDef("first-fix", "medal", "First Fix", "Landed a first correction.")

			const links = new Map([
				["k1", "d1"],
				["k2", "d2"],
				["k3", "d3"],
				["k4", "d4"],
			])
			const holdings = new Map([
				["d2", "grandmaster"],
				["d3", "master"],
			])
			const leaderboard = [
				makeEntry("k1", 1, "legendary"),
				makeEntry("k2", 2, "grandmaster"),
				makeEntry("k3", 3, "master"),
				makeEntry("k4", 0, null),
			]
			const catalogue = makeCatalogue([nightOwl, polyglot, firstFix])
			const userBadges = new Map([
				["k1", []],
				["k2", [makeUserBadge("night-owl", true)]],
				["k3", [makeUserBadge("polyglot", true), makeUserBadge("first-fix", true)]],
				["k4", [makeUserBadge("night-owl", true)]],
			])
			const seeded = new Set(["d1", "d2"])
			const { deps, rec } = buildDeps({
				links,
				holdings,
				leaderboard,
				catalogue,
				userBadges,
				seeded,
				batchThreshold: 1,
			})

			const result = await runSync(deps)

			expect(rec.applied).toContainEqual({ discordId: "d1", tier: "legendary" })
			expect(rec.applied.some((c) => c.discordId === "d3")).toBe(false)
			expect(rec.applied.some((c) => c.discordId === "d4")).toBe(false)

			expect(rec.markedSeeded).toContainEqual({ discordId: "d3", seededAt: NOW })
			expect(rec.recordedBadges).toContainEqual({
				discordId: "d3",
				badgeKey: "polyglot",
				tier: null,
				awardedAt: NOW,
			})
			expect(rec.recordedBadges).toContainEqual({
				discordId: "d3",
				badgeKey: "first-fix",
				tier: null,
				awardedAt: NOW,
			})

			expect(rec.badgesFetched).not.toContain("k4")

			expect(rec.summaries).toHaveLength(1)
			expect(rec.summaries[0]).toEqual({
				promotions: [{ displayName: "curator-k1", tier: "legendary" }],
				badges: [{ displayName: "curator-k2", badgeName: "Night Owl" }],
			})
			expect(rec.announced).toEqual([])
			expect(rec.announcedBadges).toEqual([])
			expect(result.announced).toBe(2)
		})
	})
})
