export interface Curator {
	keyId: string
	rank: number
	score: number
}

export interface TierConfig {
	podium: string[]
	special: { topPercent: number; tier: string }
	base: { topPercent: number; tier: string }
}

function tierForIndex(index: number, n: number, config: TierConfig): string | undefined {
	const podiumTier = config.podium[index]
	if (podiumTier !== undefined) return podiumTier
	if (index < Math.ceil((n * config.special.topPercent) / 100)) return config.special.tier
	if (index < Math.ceil((n * config.base.topPercent) / 100)) return config.base.tier
	return undefined
}

export function computeTiers(
	leaderboard: Curator[],
	blacklist: Set<string>,
	config: TierConfig
): Map<string, string> {
	const ranked = leaderboard
		.filter((curator) => !blacklist.has(curator.keyId))
		.sort((a, b) => a.rank - b.rank)

	const n = ranked.length
	const result = new Map<string, string>()

	for (let index = 0; index < n; index++) {
		const curator = ranked[index]
		if (curator === undefined) continue
		const tier = tierForIndex(index, n, config)
		if (tier !== undefined) result.set(curator.keyId, tier)
	}

	return result
}
