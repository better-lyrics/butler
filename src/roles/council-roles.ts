export interface CouncilRoleMember {
	keyId: string
	discordId: string
}

export interface CouncilRolePlan {
	grant: string[]
	revoke: string[]
	members: CouncilRoleMember[]
}

// Unison owns council membership. Returns null when either list looks empty, so a failed read
// can never strip the role from the whole council.
export function planCouncilRoles(input: {
	previous: CouncilRoleMember[]
	councilKeyIds: string[]
	links: Map<string, string>
}): CouncilRolePlan | null {
	if (input.councilKeyIds.length === 0 || input.links.size === 0) return null
	const recorded = new Map(input.previous.map((m) => [m.keyId, m.discordId]))
	const council = new Set(input.councilKeyIds)
	const grant: string[] = []
	const members: CouncilRoleMember[] = []
	for (const keyId of council) {
		const linked = input.links.get(keyId)
		if (linked) grant.push(linked)
		const discordId = linked ?? recorded.get(keyId)
		if (discordId) members.push({ keyId, discordId })
	}
	const granted = new Set(grant)
	const revoke = input.previous
		.filter((m) => !council.has(m.keyId) && !granted.has(m.discordId))
		.map((m) => m.discordId)
	return { grant, revoke, members }
}
