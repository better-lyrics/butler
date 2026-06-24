import { type GuildConfig, getGuildConfig } from "@/db/guild-config"
import type { SyncResult } from "@/roles/sync"
import {
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js"
import type { Pool } from "pg"

export const SYNC_GUILD_ONLY = "This command can only be used in a server."
export const SYNC_NO_PERMISSION = "You need the Manage Server permission to run this."
export const SYNC_NO_CONFIG = "This server is not set up yet. Run /setup first."
export const SYNC_FAILED =
	"Could not run the sync. Check that my role sits above the tier roles, and the logs."
export const SYNC_SKIPPED =
	"Sync skipped: the leaderboard came back empty, so no roles were changed."

export const syncCommand = new SlashCommandBuilder()
	.setName("sync")
	.setDescription("Run a curator role sync now")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

export type SyncTrigger = { kind: "scheduled" } | { kind: "manual"; byDiscordId: string }

export interface SyncCommandDeps {
	pool: Pool
	runSyncForGuild(config: GuildConfig, trigger?: SyncTrigger): Promise<SyncResult | null>
}

export async function handleSync(
	interaction: ChatInputCommandInteraction,
	deps: SyncCommandDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply({ content: SYNC_GUILD_ONLY, flags: MessageFlags.Ephemeral })
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({ content: SYNC_NO_PERMISSION, flags: MessageFlags.Ephemeral })
		return
	}

	const gc = await getGuildConfig(deps.pool, interaction.guildId)
	if (!gc) {
		await interaction.reply({ content: SYNC_NO_CONFIG, flags: MessageFlags.Ephemeral })
		return
	}

	// A sync fetches members one by one, which can exceed the 3 second reply window.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })

	const result = await deps.runSyncForGuild(gc, {
		kind: "manual",
		byDiscordId: interaction.user.id,
	})
	if (!result) {
		await interaction.editReply({ content: SYNC_FAILED })
		return
	}
	if (result.skipped) {
		await interaction.editReply({ content: SYNC_SKIPPED })
		return
	}
	await interaction.editReply({
		content: `Synced. Granted ${result.granted}, removed ${result.removed}, announced ${result.announced}.`,
	})
}
