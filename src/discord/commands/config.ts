import { TIER_ORDER } from "@/config"
import {
	configAnnounceSet,
	configConnectFailed,
	configConnectSet,
	configCouncilRoleCleared,
	configCouncilRoleSet,
	configError,
	configGuildOnly,
	configModChannelCleared,
	configModChannelSet,
	configNoPermission,
	configReportSet,
	configTierRoleSet,
	configView,
} from "@/copy/strings"
import type { GuildConfig, GuildTextField } from "@/db/guild-config"
import { ephemeralText } from "@/discord/migrate/reply"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const configCommand = new SlashCommandBuilder()
	.setName("config")
	.setDescription("Change one butler setting at a time")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addSubcommand((s) =>
		s
			.setName("connect-channel")
			.setDescription("Set the channel that hosts the connect card")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Connect card channel").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("report-channel")
			.setDescription("Set the channel watched for lyric reports")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Report channel").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("announce-channel")
			.setDescription("Set the channel where promotions are announced")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Announce channel").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("mod-channel")
			.setDescription("Set the moderator log channel")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Mod log channel").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("council-role")
			.setDescription("Set the role granted to council members")
			.addRoleOption((o) => o.setName("role").setDescription("Council role").setRequired(true))
	)
	.addSubcommand((s) =>
		s
			.setName("tier-role")
			.setDescription("Set the role for one leaderboard tier")
			.addStringOption((o) =>
				o
					.setName("tier")
					.setDescription("Which tier")
					.setRequired(true)
					.addChoices(...TIER_ORDER.map((tier) => ({ name: tier, value: tier })))
			)
			.addRoleOption((o) =>
				o.setName("role").setDescription("Role for this tier").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("clear")
			.setDescription("Unset an optional setting")
			.addStringOption((o) =>
				o
					.setName("field")
					.setDescription("Setting to clear")
					.setRequired(true)
					.addChoices(
						{ name: "mod channel", value: "mod-channel" },
						{ name: "council role", value: "council-role" }
					)
			)
	)
	.addSubcommand((s) => s.setName("view").setDescription("Show the current configuration"))

/** Minimal shape of the /config chat command interaction. */
export interface ConfigCommandInteraction {
	guildId: string | null
	memberPermissions: { has(flag: bigint): boolean } | null
	options: {
		getSubcommand(): string
		getChannel(name: string, required?: boolean): { id: string } | null
		getRole(name: string, required?: boolean): { id: string } | null
		getString(name: string, required?: boolean): string | null
	}
	reply(payload: unknown): Promise<unknown>
}

export interface ConfigCommandDeps {
	setField(field: GuildTextField, value: string | null): Promise<void>
	setTierRole(tier: string, roleId: string): Promise<void>
	getConfig(): Promise<GuildConfig | null>
	postConnectCard(channelId: string): Promise<boolean>
}

export async function handleConfig(
	interaction: ConfigCommandInteraction,
	deps: ConfigCommandDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(configGuildOnly))
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(configNoPermission))
		return
	}

	const sub = interaction.options.getSubcommand()

	if (sub === "connect-channel") {
		const channel = interaction.options.getChannel("channel", true)
		if (!channel) {
			await interaction.reply(ephemeralText(configError))
			return
		}
		await deps.setField("connect", channel.id)
		const posted = await deps.postConnectCard(channel.id)
		await interaction.reply(ephemeralText(posted ? configConnectSet : configConnectFailed))
		return
	}

	if (sub === "report-channel" || sub === "announce-channel" || sub === "mod-channel") {
		const channel = interaction.options.getChannel("channel", true)
		if (!channel) {
			await interaction.reply(ephemeralText(configError))
			return
		}
		if (sub === "report-channel") {
			await deps.setField("report", channel.id)
			await interaction.reply(ephemeralText(configReportSet))
			return
		}
		if (sub === "announce-channel") {
			await deps.setField("announce", channel.id)
			await interaction.reply(ephemeralText(configAnnounceSet))
			return
		}
		await deps.setField("mod", channel.id)
		await interaction.reply(ephemeralText(configModChannelSet))
		return
	}

	if (sub === "council-role") {
		const role = interaction.options.getRole("role", true)
		if (!role) {
			await interaction.reply(ephemeralText(configError))
			return
		}
		await deps.setField("council", role.id)
		await interaction.reply(ephemeralText(configCouncilRoleSet(`<@&${role.id}>`)))
		return
	}

	if (sub === "tier-role") {
		const tier = interaction.options.getString("tier", true)
		const role = interaction.options.getRole("role", true)
		if (!tier || !role) {
			await interaction.reply(ephemeralText(configError))
			return
		}
		await deps.setTierRole(tier, role.id)
		await interaction.reply(ephemeralText(configTierRoleSet(tier, `<@&${role.id}>`)))
		return
	}

	if (sub === "clear") {
		const field = interaction.options.getString("field", true)
		if (field === "mod-channel") {
			await deps.setField("mod", null)
			await interaction.reply(ephemeralText(configModChannelCleared))
			return
		}
		if (field === "council-role") {
			await deps.setField("council", null)
			await interaction.reply(ephemeralText(configCouncilRoleCleared))
			return
		}
		await interaction.reply(ephemeralText(configError))
		return
	}

	if (sub === "view") {
		await interaction.reply(ephemeralText(configView(await deps.getConfig())))
		return
	}

	await interaction.reply(ephemeralText(configError))
}
