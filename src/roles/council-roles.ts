export interface CouncilRoleMember {
	keyId: string
	discordId: string
}

export interface CouncilRolePlan {
	grant: string[]
	revoke: CouncilRoleMember[]
	members: CouncilRoleMember[]
}

// Null when either list reads empty, so a failed read never strips the whole council.
export function planCouncilRoles(input: {
	previous: CouncilRoleMember[]
	councilKeyIds: string[]
	links: Map<string, string>
}): CouncilRolePlan | null {
	if (input.councilKeyIds.length === 0 || input.links.size === 0) return null
	const council = new Set(input.councilKeyIds)
	const grant: string[] = []
	const members: CouncilRoleMember[] = []
	for (const keyId of council) {
		const linked = input.links.get(keyId)
		if (linked) {
			grant.push(linked)
			members.push({ keyId, discordId: linked })
		} else {
			members.push(...input.previous.filter((m) => m.keyId === keyId))
		}
	}
	const granted = new Set(grant)
	const revoke = input.previous.filter((m) => {
		if (granted.has(m.discordId)) return false
		const linked = input.links.get(m.keyId)
		return !council.has(m.keyId) || (linked !== undefined && linked !== m.discordId)
	})
	return { grant, revoke, members }
}
