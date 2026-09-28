import type { CouncilRoleMember } from "@/roles/council-roles"

export type ManageAccess = boolean | "gone"

// A member missing from `access` had an unreadable permission, so it is left out, never demoted.
export function planCouncilAdmins(
	members: CouncilRoleMember[],
	access: Map<string, ManageAccess>
): { keyId: string; admin: boolean }[] {
	const admin = new Map<string, boolean>()
	for (const m of members) {
		const seen = access.get(m.discordId)
		if (seen === undefined) continue
		admin.set(m.keyId, (admin.get(m.keyId) ?? false) || seen === true)
	}
	return [...admin].map(([keyId, isAdmin]) => ({ keyId, admin: isAdmin }))
}
