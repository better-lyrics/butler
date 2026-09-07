import { type BadgeEntry, diffBadges } from "@/roles/badge-diff"
import { type RoleTransition, diffHoldings, roleTransitions } from "@/roles/diff"
import type { BadgeCatalogue, BadgeDef, LeaderboardEntry, UserGamification } from "@/unison/client"

export interface SyncDeps {
	getLeaderboard(): Promise<LeaderboardEntry[]>
	resolveMember(keyId: string): Promise<{ discordId: string } | null>
	getHoldings(): Promise<Map<string, string>>
	applyMemberRoles(discordId: string, tier: string | null): Promise<void>
	persistHolding(discordId: string, tier: string | null): Promise<void>
	announcePromotion(promo: {
		discordId: string
		entry: LeaderboardEntry
		tier: string
	}): Promise<void>
	getUserBadges(keyId: string): Promise<UserGamification | null>
	getBadgeCatalogue(): Promise<BadgeCatalogue | null>
	getBadgeHoldings(discordId: string): Promise<BadgeEntry[]>
	recordBadge(
		discordId: string,
		badge: { badgeKey: string; tier: number | null; awardedAt: number }
	): Promise<void>
	isSeeded(discordId: string): Promise<boolean>
	markSeeded(discordId: string, seededAt: number): Promise<void>
	announceBadge(input: {
		discordId: string
		badgeName: string
		badgeDescription: string
	}): Promise<boolean>
	announceSummary(input: {
		promotions: Array<{ displayName: string; tier: string }>
		badges: Array<{ displayName: string; badgeName: string }>
	}): Promise<boolean>
	now(): number
	tierOrder: string[]
	batchThreshold: number
}

export interface SyncResult {
	granted: number
	removed: number
	announced: number
	skipped: boolean
	transitions: RoleTransition[]
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
	const leaderboard = await deps.getLeaderboard()

	const desired = new Map<string, string>()
	const entryByDiscord = new Map<string, LeaderboardEntry>()

	for (const entry of leaderboard) {
		if (entry.tier === null) continue
		const member = await deps.resolveMember(entry.keyId)
		if (member === null) continue
		desired.set(member.discordId, entry.tier)
		entryByDiscord.set(member.discordId, entry)
	}

	const current = await deps.getHoldings()

	// Refuse to strip every member when the desired set is empty but holdings exist.
	// An empty desired set almost always means an upstream blip (a 200 with no curators,
	// or a mass-unlink) rather than a real "remove everyone" intent.
	if (desired.size === 0 && current.size > 0) {
		return { granted: 0, removed: 0, announced: 0, skipped: true, transitions: [] }
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

	const promotions: Array<{ discordId: string; entry: LeaderboardEntry; tier: string }> = []
	for (const promo of diff.promotions) {
		const entry = entryByDiscord.get(promo.discordId)
		if (entry === undefined) continue
		promotions.push({ discordId: promo.discordId, entry, tier: promo.tier })
	}

	const awards: Array<{
		discordId: string
		displayName: string
		badgeName: string
		badgeDescription: string
		badgeKey: string
		tier: number | null
	}> = []

	const catalogue = await deps.getBadgeCatalogue()
	if (catalogue !== null) {
		const defByKey = new Map<string, BadgeDef>()
		for (const def of catalogue.badges) defByKey.set(def.key, def)

		for (const [discordId, entry] of entryByDiscord) {
			const gamification = await deps.getUserBadges(entry.keyId)
			if (gamification === null) continue
			const earnedMedals: BadgeEntry[] = gamification.badges
				.filter((b) => b.earned && defByKey.get(b.key)?.kind !== "title")
				.map((b) => ({ key: b.key, tier: b.tier ?? null }))

			const held = await deps.getBadgeHoldings(discordId)
			const seeded = await deps.isSeeded(discordId)

			if (!seeded) {
				for (const medal of earnedMedals) {
					await deps.recordBadge(discordId, {
						badgeKey: medal.key,
						tier: medal.tier,
						awardedAt: deps.now(),
					})
				}
				await deps.markSeeded(discordId, deps.now())
				continue
			}

			const { newlyEarned } = diffBadges({ earned: earnedMedals, held })
			for (const badge of newlyEarned) {
				const def = defByKey.get(badge.key)
				if (def === undefined) {
					await deps.recordBadge(discordId, {
						badgeKey: badge.key,
						tier: badge.tier,
						awardedAt: deps.now(),
					})
					continue
				}
				awards.push({
					discordId,
					displayName: entry.displayName,
					badgeName: def.name,
					badgeDescription: def.description,
					badgeKey: badge.key,
					tier: badge.tier,
				})
			}
		}
	}

	async function recordAward(award: (typeof awards)[number]): Promise<void> {
		await deps.recordBadge(award.discordId, {
			badgeKey: award.badgeKey,
			tier: award.tier,
			awardedAt: deps.now(),
		})
	}

	const total = promotions.length + awards.length
	if (total > deps.batchThreshold) {
		const sent = await deps.announceSummary({
			promotions: promotions.map((p) => ({ displayName: p.entry.displayName, tier: p.tier })),
			badges: awards.map((a) => ({ displayName: a.displayName, badgeName: a.badgeName })),
		})
		if (sent) {
			for (const award of awards) await recordAward(award)
		}
	} else {
		for (const promo of promotions) {
			await deps.announcePromotion({
				discordId: promo.discordId,
				entry: promo.entry,
				tier: promo.tier,
			})
		}
		for (const award of awards) {
			const sent = await deps.announceBadge({
				discordId: award.discordId,
				badgeName: award.badgeName,
				badgeDescription: award.badgeDescription,
			})
			if (sent) await recordAward(award)
		}
	}

	return {
		granted: diff.grants.length,
		removed: diff.removals.length,
		announced: total,
		skipped: false,
		transitions: roleTransitions(diff),
	}
}
