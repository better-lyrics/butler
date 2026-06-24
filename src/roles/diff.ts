export interface DiffInput {
	desired: Map<string, string>
	current: Map<string, string>
	order: string[]
}

export interface RoleChange {
	discordId: string
	tier: string
}

export interface Promotion {
	discordId: string
	tier: string
	previousTier: string | null
}

export interface HoldingsDiff {
	grants: RoleChange[]
	removals: RoleChange[]
	promotions: Promotion[]
}

/** A per-member role change for logging: a grant (from null), a removal (to null), or a move. */
export interface RoleTransition {
	discordId: string
	from: string | null
	to: string | null
}

/**
 * Collapse the diff into one transition per member. A tier change shows up in the
 * diff as a removal of the old tier plus a grant of the new one; this pairs them
 * back together so the log reads "moved from X to Y" instead of two lines.
 */
export function roleTransitions(diff: HoldingsDiff): RoleTransition[] {
	const byId = new Map<string, { from: string | null; to: string | null }>()
	for (const removal of diff.removals) {
		const entry = byId.get(removal.discordId) ?? { from: null, to: null }
		entry.from = removal.tier
		byId.set(removal.discordId, entry)
	}
	for (const grant of diff.grants) {
		const entry = byId.get(grant.discordId) ?? { from: null, to: null }
		entry.to = grant.tier
		byId.set(grant.discordId, entry)
	}
	return [...byId].map(([discordId, change]) => ({ discordId, from: change.from, to: change.to }))
}

function rankOf(order: string[], tier: string): number {
	return order.indexOf(tier)
}

export function diffHoldings(input: DiffInput): HoldingsDiff {
	const { desired, current, order } = input

	const grants: RoleChange[] = []
	const removals: RoleChange[] = []
	const promotions: Promotion[] = []

	const discordIds = new Set<string>([...desired.keys(), ...current.keys()])

	for (const discordId of discordIds) {
		const desiredTier = desired.get(discordId)
		const currentTier = current.get(discordId)

		if (desiredTier === undefined) {
			if (currentTier !== undefined) {
				removals.push({ discordId, tier: currentTier })
			}
			continue
		}

		if (currentTier === undefined) {
			grants.push({ discordId, tier: desiredTier })
			promotions.push({ discordId, tier: desiredTier, previousTier: null })
			continue
		}

		if (desiredTier === currentTier) {
			continue
		}

		removals.push({ discordId, tier: currentTier })
		grants.push({ discordId, tier: desiredTier })

		if (rankOf(order, desiredTier) > rankOf(order, currentTier)) {
			promotions.push({ discordId, tier: desiredTier, previousTier: currentTier })
		}
	}

	return { grants, removals, promotions }
}
