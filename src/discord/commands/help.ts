import { buildHelpCard } from "@/discord/components/help-card"
import { ephemeralCard } from "@/discord/migrate/reply"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const helpCommand = new SlashCommandBuilder()
	.setName("help")
	.setDescription("Show what butler can do")

/** Minimal shape of the /help command interaction. */
export interface HelpCommandInteraction {
	memberPermissions: { has(flag: bigint): boolean } | null
	reply(payload: unknown): Promise<unknown>
}

export async function handleHelp(interaction: HelpCommandInteraction): Promise<void> {
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
	await interaction.reply(ephemeralCard(buildHelpCard({ isAdmin })))
}
