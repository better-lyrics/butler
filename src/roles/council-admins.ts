import type { CouncilRoleMember } from "@/roles/council-roles"
import { PermissionFlagsBits } from "discord.js"

export type ManageAccess = boolean | "gone"

interface MemberSource {
	members: {
		fetch(options: { user: string; force: boolean }): Promise<{
			permissions: { has(flag: bigint): boolean }
		}>
	}
}

export async function readManageAccess(
	guild: MemberSource,
	discordIds: string[],
	isGone: (err: unknown) => boolean
): Promise<Map<string, ManageAccess>> {
	const access = new Map<string, ManageAccess>()
	for (const discordId of discordIds) {
		try {
			const member = await guild.members.fetch({ user: discordId, force: true })
			access.set(discordId, member.permissions.has(PermissionFlagsBits.ManageGuild))
		} catch (err) {
			if (isGone(err)) access.set(discordId, "gone")
			else console.error("council admin read failed", err)
		}
	}
	return access
}

// A member missing from `access` had an unreadable permission, so it is left out, never demoted.
export function planCouncilAdmins(
	councilKeyIds: string[],
	members: CouncilRoleMember[],
	access: Map<string, ManageAccess>
): { keyId: string; admin: boolean }[] {
	const admin = new Map<string, boolean>()
	const accounted = new Set<string>()
	for (const m of members) {
		accounted.add(m.keyId)
		const seen = access.get(m.discordId)
		if (seen === undefined) continue
		admin.set(m.keyId, (admin.get(m.keyId) ?? false) || seen === true)
	}
	for (const keyId of councilKeyIds) {
		if (!accounted.has(keyId)) admin.set(keyId, false)
	}
	return [...admin].map(([keyId, isAdmin]) => ({ keyId, admin: isAdmin }))
}
