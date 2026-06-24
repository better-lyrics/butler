import { type GuildConfig, getGuildConfig, setGuildEnabled } from "@/db/guild-config"
import type { SyncResult } from "@/roles/sync"
import {
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js"
import type { Pool } from "pg"
import type { SyncTrigger } from "./sync"

export const POWER_GUILD_ONLY = "This command can only be used in a server."
export const POWER_NO_PERMISSION = "You need the Manage Server permission to run this."
export const POWER_NO_CONFIG = "This server is not set up yet. Run /setup first, then /activate."
export const ALREADY_ON = "butler is already on."
export const ALREADY_OFF = "butler is already off."
export const DEACTIVATE_DONE =
	"butler is off. It will not sync, announce, or watch the report channel until you run /activate."
export const ACTIVATE_FAILED =
	"Turned on, but the first sync could not run. Check that my role sits above the tier roles, and the logs."
export const ACTIVATE_SKIPPED =
	"butler is on. The leaderboard came back empty, so no roles were assigned yet."

export const activateCommand = new SlashCommandBuilder()
	.setName("activate")
	.setDescription(
		"Turn butler on: start syncing roles, announcing, and watching the report channel"
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

export const deactivateCommand = new SlashCommandBuilder()
	.setName("deactivate")
	.setDescription("Turn butler off: it goes dormant until you activate it again")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

export interface PowerCommandDeps {
	pool: Pool
	runSyncForGuild(config: GuildConfig, trigger?: SyncTrigger): Promise<SyncResult | null>
}

/** Returned so the caller can mod-log the toggle. `changed` is false when it was already in that state. */
export interface PowerOutcome {
	changed: boolean
	enabled: boolean
	modChannelId: string | null
}

function guard(interaction: ChatInputCommandInteraction): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
}

export async function handleActivate(
	interaction: ChatInputCommandInteraction,
	deps: PowerCommandDeps
): Promise<PowerOutcome> {
	const none: PowerOutcome = { changed: false, enabled: false, modChannelId: null }
	if (!interaction.guildId) {
		await interaction.reply({ content: POWER_GUILD_ONLY, flags: MessageFlags.Ephemeral })
		return none
	}
	if (!guard(interaction)) {
		await interaction.reply({ content: POWER_NO_PERMISSION, flags: MessageFlags.Ephemeral })
		return none
	}

	const gc = await getGuildConfig(deps.pool, interaction.guildId)
	if (!gc) {
		await interaction.reply({ content: POWER_NO_CONFIG, flags: MessageFlags.Ephemeral })
		return none
	}
	if (gc.enabled) {
		await interaction.reply({ content: ALREADY_ON, flags: MessageFlags.Ephemeral })
		return { changed: false, enabled: true, modChannelId: gc.modChannelId }
	}

	await setGuildEnabled(deps.pool, interaction.guildId, true)

	// The first sync seeds every current curator, so it can take a while and is announced live.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })

	const result = await deps.runSyncForGuild(
		{ ...gc, enabled: true },
		{ kind: "manual", byDiscordId: interaction.user.id }
	)

	if (!result) {
		await interaction.editReply({ content: ACTIVATE_FAILED })
	} else if (result.skipped) {
		await interaction.editReply({ content: ACTIVATE_SKIPPED })
	} else {
		await interaction.editReply({
			content: `butler is on. Synced: granted ${result.granted}, removed ${result.removed}, announced ${result.announced}.`,
		})
	}

	return { changed: true, enabled: true, modChannelId: gc.modChannelId }
}

export async function handleDeactivate(
	interaction: ChatInputCommandInteraction,
	deps: PowerCommandDeps
): Promise<PowerOutcome> {
	const none: PowerOutcome = { changed: false, enabled: false, modChannelId: null }
	if (!interaction.guildId) {
		await interaction.reply({ content: POWER_GUILD_ONLY, flags: MessageFlags.Ephemeral })
		return none
	}
	if (!guard(interaction)) {
		await interaction.reply({ content: POWER_NO_PERMISSION, flags: MessageFlags.Ephemeral })
		return none
	}

	const gc = await getGuildConfig(deps.pool, interaction.guildId)
	if (!gc) {
		await interaction.reply({ content: POWER_NO_CONFIG, flags: MessageFlags.Ephemeral })
		return none
	}
	if (!gc.enabled) {
		await interaction.reply({ content: ALREADY_OFF, flags: MessageFlags.Ephemeral })
		return { changed: false, enabled: false, modChannelId: gc.modChannelId }
	}

	await setGuildEnabled(deps.pool, interaction.guildId, false)
	await interaction.reply({ content: DEACTIVATE_DONE, flags: MessageFlags.Ephemeral })

	return { changed: true, enabled: false, modChannelId: gc.modChannelId }
}
