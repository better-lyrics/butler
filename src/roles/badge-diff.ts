export interface BadgeEntry {
	key: string
	tier: number | null
}

export interface BadgeDiff {
	newlyEarned: BadgeEntry[]
}

export function diffBadges(input: { earned: BadgeEntry[]; held: BadgeEntry[] }): BadgeDiff {
	const heldKeys = new Set(input.held.map((badge) => badge.key))
	const seen = new Set<string>()
	const newlyEarned: BadgeEntry[] = []

	for (const badge of input.earned) {
		if (heldKeys.has(badge.key) || seen.has(badge.key)) {
			continue
		}
		seen.add(badge.key)
		newlyEarned.push({ key: badge.key, tier: badge.tier })
	}

	return { newlyEarned }
}
