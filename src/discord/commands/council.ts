import { ephemeralText } from "@/discord/migrate/reply"
import type { CouncilAddResult, CouncilListResult, CouncilRemoveResult } from "@/unison/client"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const COUNCIL_GUILD_ONLY = "This command can only be used in a server."
export const COUNCIL_NO_PERMISSION = "You need the Manage Server permission to run this."
export const COUNCIL_ERROR = "Something went wrong. Give it another try in a moment."
export const COUNCIL_LIST_EMPTY = "No one is on the Better Lyrics Council yet."

export function councilNotLinked(mention: string): string {
	return `${mention} has not linked a Better Lyrics account yet, so they cannot join the council. Ask them to link first, then try again.`
}

export function councilNotFound(mention: string): string {
	return `Could not find a Better Lyrics account for ${mention}.`
}

export function councilAdded(mention: string): string {
	return `${mention} is on the Better Lyrics Council now, and I gave them the council role.`
}

export function councilAddedNoRole(mention: string): string {
	return `${mention} is on the council now. No council role is set for this server, so set one with /config council-role or /setup if you want it assigned automatically.`
}

export function councilAddedRoleFailed(mention: string): string {
	return `${mention} is on the council now, but I could not assign the council role. Check that my role sits above it and that I can manage roles.`
}

export function councilRemoved(mention: string): string {
	return `${mention} is off the council, and I removed the council role.`
}

export function councilRemovedNoRole(mention: string): string {
	return `${mention} is off the council.`
}

export function councilRemovedRoleFailed(mention: string): string {
	return `${mention} is off the council, but I could not remove the council role. Check my role permissions.`
}

export function councilListMessage(params: {
	mentions: string[]
	unlinked: number
}): string {
	const total = params.mentions.length + params.unlinked
	const lines = [`**Better Lyrics Council (${total})**`]
	if (params.mentions.length > 0) lines.push(params.mentions.join(" "))
	if (params.unlinked > 0) {
		lines.push(
			`${params.unlinked} member${params.unlinked === 1 ? "" : "s"} not linked to Discord.`
		)
	}
	return lines.join("\n")
}

export const councilCommand = new SlashCommandBuilder()
	.setName("council")
	.setDescription("Manage the Better Lyrics Council")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a member to the council")
			.addUserOption((o) =>
				o.setName("user").setDescription("The linked member to add").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Remove a member from the council")
			.addUserOption((o) =>
				o.setName("user").setDescription("The member to remove").setRequired(true)
			)
	)
	.addSubcommand((s) => s.setName("list").setDescription("List the current council members"))

export type CouncilRoleOutcome = "done" | "not_configured" | "failed"

/** Minimal shape of the /council chat command interaction. */
export interface CouncilCommandInteraction {
	guildId: string | null
	memberPermissions: { has(flag: bigint): boolean } | null
	options: {
		getSubcommand(): string
		getUser(name: string, required?: boolean): { id: string } | null
	}
	reply(payload: unknown): Promise<unknown>
}

export interface CouncilCommandDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	listLinks(): Promise<Array<{ discordId: string; keyId: string }>>
	addCouncilMember(keyId: string): Promise<CouncilAddResult>
	removeCouncilMember(keyId: string): Promise<CouncilRemoveResult>
	getCouncil(): Promise<CouncilListResult>
	grantCouncilRole(discordId: string): Promise<CouncilRoleOutcome>
	revokeCouncilRole(discordId: string): Promise<CouncilRoleOutcome>
}

function addedReply(mention: string, role: CouncilRoleOutcome): string {
	if (role === "not_configured") return councilAddedNoRole(mention)
	if (role === "failed") return councilAddedRoleFailed(mention)
	return councilAdded(mention)
}

function removedReply(mention: string, role: CouncilRoleOutcome): string {
	if (role === "not_configured") return councilRemovedNoRole(mention)
	if (role === "failed") return councilRemovedRoleFailed(mention)
	return councilRemoved(mention)
}

async function runList(
	interaction: CouncilCommandInteraction,
	deps: CouncilCommandDeps
): Promise<void> {
	const council = await deps.getCouncil()
	if (council.status !== "ok") {
		await interaction.reply(ephemeralText(COUNCIL_ERROR))
		return
	}
	if (council.keyIds.length === 0) {
		await interaction.reply(ephemeralText(COUNCIL_LIST_EMPTY))
		return
	}

	const links = await deps.listLinks()
	const byKeyId = new Map(links.map((l) => [l.keyId, l.discordId]))
	const mentions: string[] = []
	let unlinked = 0
	for (const keyId of council.keyIds) {
		const discordId = byKeyId.get(keyId)
		if (discordId) mentions.push(`<@${discordId}>`)
		else unlinked++
	}

	await interaction.reply(ephemeralText(councilListMessage({ mentions, unlinked })))
}

export async function handleCouncil(
	interaction: CouncilCommandInteraction,
	deps: CouncilCommandDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(COUNCIL_GUILD_ONLY))
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_NO_PERMISSION))
		return
	}

	const sub = interaction.options.getSubcommand()
	if (sub === "list") {
		await runList(interaction, deps)
		return
	}
	if (sub !== "add" && sub !== "remove") {
		await interaction.reply(ephemeralText(COUNCIL_ERROR))
		return
	}

	const target = interaction.options.getUser("user", true)
	if (!target) {
		await interaction.reply(ephemeralText(COUNCIL_ERROR))
		return
	}
	const mention = `<@${target.id}>`

	const keyId = await deps.resolveKeyId(target.id)
	if (!keyId) {
		await interaction.reply(ephemeralText(councilNotLinked(mention)))
		return
	}

	if (sub === "add") {
		const result = await deps.addCouncilMember(keyId)
		if (result.status === "not_found") {
			await interaction.reply(ephemeralText(councilNotFound(mention)))
			return
		}
		if (result.status !== "added") {
			await interaction.reply(ephemeralText(COUNCIL_ERROR))
			return
		}
		const role = await deps.grantCouncilRole(target.id)
		await interaction.reply(ephemeralText(addedReply(mention, role)))
		return
	}

	const result = await deps.removeCouncilMember(keyId)
	if (result.status === "not_found") {
		await interaction.reply(ephemeralText(councilNotFound(mention)))
		return
	}
	if (result.status !== "removed") {
		await interaction.reply(ephemeralText(COUNCIL_ERROR))
		return
	}
	const role = await deps.revokeCouncilRole(target.id)
	await interaction.reply(ephemeralText(removedReply(mention, role)))
}
