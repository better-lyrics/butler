import { tiersHeldBy } from "@/config"
import { unlessGoneFromGuild } from "@/discord/gone-from-guild"
import type { Guild } from "discord.js"

export function assertRoleHierarchy(
	botHighestPosition: number,
	managedRolePositions: number[]
): void {
	const blocking = managedRolePositions.filter((position) => position >= botHighestPosition)
	if (blocking.length > 0) {
		throw new Error(`bot role is not above managed roles: ${blocking.join(", ")}`)
	}
}

export interface RoleApplier {
	applyMemberRoles(discordId: string, tier: string | null): Promise<void>
}

export function nextMemberRoles(
	currentRoleIds: string[],
	roleIds: Record<string, string>,
	tier: string | null
): string[] {
	const managedRoleIds = new Set(Object.values(roleIds))
	const next = currentRoleIds.filter((id) => !managedRoleIds.has(id))
	if (tier === null) return next
	for (const held of tiersHeldBy(tier)) {
		const roleId = roleIds[held]
		if (roleId !== undefined) next.push(roleId)
	}
	return next
}

export function sameRoleSet(a: string[], b: string[]): boolean {
	const setA = new Set(a)
	const setB = new Set(b)
	return setA.size === setB.size && [...setA].every((id) => setB.has(id))
}

export function createRoleApplier(guild: Guild, roleIds: Record<string, string>): RoleApplier {
	return {
		async applyMemberRoles(discordId, tier) {
			const apply = async () => {
				const member = await guild.members.fetch(discordId)
				const current = member.roles.cache.map((role) => role.id)
				const next = nextMemberRoles(current, roleIds, tier)
				if (sameRoleSet(current, next)) return
				await guild.members.edit(discordId, { roles: next })
			}
			if (tier === null) await unlessGoneFromGuild(apply())
			else await apply()
		},
	}
}
