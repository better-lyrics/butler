import { ephemeralText } from "@/discord/migrate/reply"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const COUNCIL_WELCOME_PREVIEW_GUILD_ONLY = "This command can only be used in a server."

export const COUNCIL_WELCOME_PREVIEW_NO_PERMISSION =
	"You need the Manage Server permission to run this."

export const COUNCIL_WELCOME_PREVIEW_SENT = "Sent you the Council welcome DM. Check your messages."

export const COUNCIL_WELCOME_PREVIEW_FAILED =
	"Could not DM you. Turn on 'Allow direct messages from server members' for this server and try again."

export const councilWelcomePreviewCommand = new SlashCommandBuilder()
	.setName("council-welcome-preview")
	.setDescription("DM yourself the Council welcome message to preview it")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

/** Minimal shape of the /council-welcome-preview chat command interaction. */
export interface CouncilWelcomePreviewInteraction {
	guildId: string | null
	user: { id: string }
	memberPermissions: { has(flag: bigint): boolean } | null
	reply(payload: unknown): Promise<unknown>
}

export interface CouncilWelcomePreviewDeps {
	welcomeMember(discordId: string): Promise<boolean>
}

export async function handleCouncilWelcomePreview(
	interaction: CouncilWelcomePreviewInteraction,
	deps: CouncilWelcomePreviewDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(COUNCIL_WELCOME_PREVIEW_GUILD_ONLY))
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_WELCOME_PREVIEW_NO_PERMISSION))
		return
	}
	const sent = await deps.welcomeMember(interaction.user.id)
	await interaction.reply(
		ephemeralText(sent ? COUNCIL_WELCOME_PREVIEW_SENT : COUNCIL_WELCOME_PREVIEW_FAILED)
	)
}
