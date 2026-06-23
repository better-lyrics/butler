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

export function createRoleApplier(guild: Guild, roleIds: Record<string, string>): RoleApplier {
	const managedRoleIds = new Set(Object.values(roleIds))

	return {
		async applyMemberRoles(discordId, tier) {
			const member = await guild.members.fetch(discordId)
			const next = member.roles.cache
				.filter((role) => !managedRoleIds.has(role.id))
				.map((role) => role.id)

			if (tier !== null) {
				const tierRoleId = roleIds[tier]
				if (tierRoleId !== undefined) next.push(tierRoleId)
			}

			await guild.members.edit(discordId, { roles: next })
		},
	}
}
