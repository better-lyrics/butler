import { diffHoldings } from "@/roles/diff"
import { type TierConfig, computeTiers } from "@/roles/tiers"
import type { LeaderboardEntry } from "@/unison/client"

export interface SyncDeps {
	getLeaderboard(): Promise<LeaderboardEntry[]>
	getBlacklist(): Promise<Set<string>>
	resolveMember(keyId: string): Promise<{ discordId: string } | null>
	getHoldings(): Promise<Map<string, string>>
	applyMemberRoles(discordId: string, tier: string | null): Promise<void>
	persistHolding(discordId: string, tier: string | null): Promise<void>
	announcePromotion(promo: {
		discordId: string
		entry: LeaderboardEntry
		tier: string
	}): Promise<void>
	tiers: TierConfig
	tierOrder: string[]
}

export interface SyncResult {
	granted: number
	removed: number
	announced: number
	skipped: boolean
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
	const leaderboard = await deps.getLeaderboard()
	const byKey = new Map(leaderboard.map((entry) => [entry.keyId, entry]))

	const blacklist = await deps.getBlacklist()

	const tierByKey = computeTiers(
		leaderboard.map((entry) => ({ keyId: entry.keyId, rank: entry.rank, score: entry.score })),
		blacklist,
		deps.tiers
	)

	const desired = new Map<string, string>()
	const entryByDiscord = new Map<string, LeaderboardEntry>()

	for (const [keyId, tier] of tierByKey) {
		const member = await deps.resolveMember(keyId)
		if (member === null) continue
		const entry = byKey.get(keyId)
		if (entry === undefined) continue
		desired.set(member.discordId, tier)
		entryByDiscord.set(member.discordId, entry)
	}

	const current = await deps.getHoldings()

	// Refuse to strip every member when the desired set is empty but holdings exist.
	// An empty desired set almost always means an upstream blip (a 200 with no curators,
	// or a mass-unlink) rather than a real "remove everyone" intent.
	if (desired.size === 0 && current.size > 0) {
		return { granted: 0, removed: 0, announced: 0, skipped: true }
	}

	const diff = diffHoldings({ desired, current, order: deps.tierOrder })

	const changed = new Set<string>()
	for (const grant of diff.grants) changed.add(grant.discordId)
	for (const removal of diff.removals) changed.add(removal.discordId)

	for (const discordId of changed) {
		const finalTier = desired.get(discordId) ?? null
		await deps.applyMemberRoles(discordId, finalTier)
		await deps.persistHolding(discordId, finalTier)
	}

	let announced = 0
	for (const promo of diff.promotions) {
		const entry = entryByDiscord.get(promo.discordId)
		if (entry === undefined) continue
		await deps.announcePromotion({ discordId: promo.discordId, entry, tier: promo.tier })
		announced++
	}

	return { granted: diff.grants.length, removed: diff.removals.length, announced, skipped: false }
}
