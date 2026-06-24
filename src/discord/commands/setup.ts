import type { GuildConfig } from "@/db/guild-config"
import { upsertGuildConfig } from "@/db/guild-config"
import { buildConnectCard } from "@/discord/components/connect-card"
import {
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js"
import type { Pool } from "pg"

const SETUP_GUILD_ONLY = "This command can only be used in a server."
const SETUP_NO_PERMISSION = "You need the Manage Server permission to run this."
const SETUP_DONE = "Setup complete. Posted the connect card to the configured channel."
const SETUP_CONNECT_FAILED =
	"Setup saved, but I could not post the connect card. Check that I can send messages there."

export const setupCommand = new SlashCommandBuilder()
	.setName("setup")
	.setDescription("Configure butler for this server")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addChannelOption((option) =>
		option
			.setName("connect_channel")
			.setDescription("Channel that hosts the persistent connect card")
			.setRequired(true)
	)
	.addChannelOption((option) =>
		option
			.setName("report_channel")
			.setDescription("Channel watched for incorrect-lyrics reports")
			.setRequired(true)
	)
	.addChannelOption((option) =>
		option
			.setName("announce_channel")
			.setDescription("Channel where promotions are announced")
			.setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("legendary_role")
			.setDescription("Role for the Legendary Lyricist (leaderboard rank 1)")
			.setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("grandmaster_role")
			.setDescription("Role for the Grandmaster Lyricist (leaderboard rank 2)")
			.setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("master_role")
			.setDescription("Role for the Master Lyricist (leaderboard rank 3)")
			.setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("elite_role")
			.setDescription("Role for the Elite Lyricist (top 5 percent)")
			.setRequired(true)
	)
	.addRoleOption((option) =>
		option
			.setName("lyricist_role")
			.setDescription("Role for the Lyricist (top 20 percent)")
			.setRequired(true)
	)
	.addChannelOption((option) =>
		option
			.setName("mod_channel")
			.setDescription("Channel for moderator log messages")
			.setRequired(false)
	)

export interface SetupDeps {
	pool: Pool
	linkPageUrl: string
}

export async function handleSetup(
	interaction: ChatInputCommandInteraction,
	deps: SetupDeps
): Promise<GuildConfig | null> {
	if (!interaction.guildId) {
		await interaction.reply({ content: SETUP_GUILD_ONLY, flags: MessageFlags.Ephemeral })
		return null
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({ content: SETUP_NO_PERMISSION, flags: MessageFlags.Ephemeral })
		return null
	}

	const connectChannel = interaction.options.getChannel("connect_channel", true)
	const reportChannel = interaction.options.getChannel("report_channel", true)
	const announceChannel = interaction.options.getChannel("announce_channel", true)
	const modChannel = interaction.options.getChannel("mod_channel", false)

	const config: GuildConfig = {
		guildId: interaction.guildId,
		connectChannelId: connectChannel.id,
		reportChannelId: reportChannel.id,
		announceChannelId: announceChannel.id,
		modChannelId: modChannel?.id ?? null,
		roleIds: {
			legendary: interaction.options.getRole("legendary_role", true).id,
			grandmaster: interaction.options.getRole("grandmaster_role", true).id,
			master: interaction.options.getRole("master_role", true).id,
			elite: interaction.options.getRole("elite_role", true).id,
			lyricist: interaction.options.getRole("lyricist_role", true).id,
		},
		tierOverrides: null,
		// The switch is owned by /activate and /deactivate; upsertGuildConfig leaves it untouched.
		enabled: false,
	}

	await upsertGuildConfig(deps.pool, config)

	const channel = await interaction.client.channels.fetch(connectChannel.id).catch(() => null)
	if (channel?.isTextBased() && channel.isSendable()) {
		await channel.send(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		await interaction.reply({ content: SETUP_DONE, flags: MessageFlags.Ephemeral })
		return config
	}

	await interaction.reply({ content: SETUP_CONNECT_FAILED, flags: MessageFlags.Ephemeral })
	return config
}
