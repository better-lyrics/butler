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
