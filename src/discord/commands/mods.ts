import {
	configGuildOnly,
	configNoPermission,
	modsClosed,
	modsFinalizedSummary,
	modsNothingOpen,
	modsOpenAlready,
	modsOpenFailed,
	modsOpenMissing,
	modsOpened,
	modsPickAlreadyDone,
	modsPickNotClosed,
	modsPickNothing,
} from "@/copy/strings"
import { getModsConfig } from "@/db/guild-config"
import {
	discardSession,
	finalizeSession,
	getActiveSession,
	getSession,
	listApplications,
	openSession,
	setPicks,
	setSessionBoard,
} from "@/db/mod-sessions"
import {
	buildModsBoardCard,
	buildModsNoticeCard,
	buildModsPickCard,
	buildModsPickConfirmCard,
	buildModsResultCard,
	buildModsWinnersCard,
} from "@/discord/components/mods-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { isVotingOpen, pickPages } from "@/discord/mods/ballot"
import { type ModsDeps, closeRound } from "@/discord/mods/round"
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

const DAY_MS = 24 * 60 * 60 * 1000

export const modsCommand = new SlashCommandBuilder()
	.setName("mods")
	.setDescription("Run a mod application round")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addSubcommand((s) =>
		s
			.setName("open")
			.setDescription("Open mod applications and voting")
			.addIntegerOption((o) =>
				o
					.setName("days")
					.setDescription("How many days voting stays open")
					.setMinValue(1)
					.setMaxValue(30)
					.setRequired(true)
			)
	)
	.addSubcommand((s) => s.setName("close").setDescription("End voting now"))
	.addSubcommand((s) => s.setName("pick").setDescription("Choose the new mods once voting ends"))

interface Permissioned {
	memberPermissions: { has(flag: bigint): boolean } | null
}

export interface ModsCommandInteraction extends Permissioned {
	guildId: string | null
	user: { id: string }
	options: {
		getSubcommand(): string
		getInteger(name: string, required: true): number
	}
	reply(payload: unknown): Promise<unknown>
	deferReply(payload: { flags: number }): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export interface ModsPickInteraction extends Permissioned {
	user: { id: string }
	values?: string[]
	reply(payload: unknown): Promise<unknown>
	update(payload: unknown): Promise<unknown>
	deferUpdate(): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

function isAdmin(interaction: Permissioned): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
}

export async function handleMods(
	interaction: ModsCommandInteraction,
	deps: ModsDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(configGuildOnly))
		return
	}
	if (!isAdmin(interaction)) {
		await interaction.reply(ephemeralText(configNoPermission))
		return
	}
	const sub = interaction.options.getSubcommand()
	if (sub === "open") return openRound(interaction, deps)
	if (sub === "close") return closeOpenRound(interaction, deps)
	if (sub === "pick") return startPick(interaction, deps)
}

async function openRound(interaction: ModsCommandInteraction, deps: ModsDeps): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const settings = await getModsConfig(deps.pool, deps.guildId)
	const missing = [
		settings.channelId ? null : "mods-channel",
		settings.roleId ? null : "mods-role",
		settings.minRoleId ? null : "mods-min-role",
	].filter((name) => name !== null)
	if (!settings.channelId || missing.length > 0) {
		await interaction.editReply({ content: modsOpenMissing(missing) })
		return
	}

	const now = deps.now()
	const days = interaction.options.getInteger("days", true)
	const session = await openSession(deps.pool, {
		id: deps.newId(),
		guildId: deps.guildId,
		openedBy: interaction.user.id,
		openedAt: now,
		closesAt: now + days * DAY_MS,
	})
	if (!session) {
		await interaction.editReply({ content: modsOpenAlready })
		return
	}

	const messageId = await deps.discord.postCard(
		settings.channelId,
		buildModsBoardCard({ open: true, closesAt: session.closesAt, applicants: [] })
	)
	if (!messageId) {
		await discardSession(deps.pool, session.id)
		await interaction.editReply({ content: modsOpenFailed })
		return
	}
	await setSessionBoard(deps.pool, session.id, settings.channelId, messageId)
	deps.modLog({ kind: "mods_opened", discordId: interaction.user.id, closesAt: session.closesAt })
	await interaction.editReply({ content: modsOpened(new Date(session.closesAt)) })
}

async function closeOpenRound(interaction: ModsCommandInteraction, deps: ModsDeps): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const session = await getActiveSession(deps.pool, deps.guildId)
	const closed = session?.state === "open" && (await closeRound(deps, session))
	await interaction.editReply({ content: closed ? modsClosed : modsNothingOpen })
}

async function startPick(interaction: ModsCommandInteraction, deps: ModsDeps): Promise<void> {
	const session = await getActiveSession(deps.pool, deps.guildId)
	if (!session) {
		await interaction.reply(ephemeralText(modsPickNothing))
		return
	}
	if (isVotingOpen(session, deps.now())) {
		await interaction.reply(ephemeralText(modsPickNotClosed))
		return
	}
	const applications = await listApplications(deps.pool, session.id)
	await interaction.reply(ephemeralCard(buildModsPickCard({ sessionId: session.id, applications })))
	if (session.state === "open") await closeRound(deps, session)
}

// Every pick control re-checks the round, since the ephemeral card can outlive it.
async function closedRound(
	interaction: ModsPickInteraction,
	sessionId: string,
	deps: ModsDeps
): Promise<boolean> {
	if (!isAdmin(interaction)) {
		await interaction.reply(ephemeralText(configNoPermission))
		return false
	}
	if ((await getSession(deps.pool, sessionId))?.state !== "closed") {
		await interaction.update(buildModsNoticeCard(modsPickAlreadyDone))
		return false
	}
	return true
}

async function pickCard(deps: ModsDeps, sessionId: string) {
	return buildModsPickCard({
		sessionId,
		applications: await listApplications(deps.pool, sessionId),
	})
}

export async function handleModsPickSelect(
	interaction: ModsPickInteraction,
	sessionId: string,
	page: number,
	deps: ModsDeps
): Promise<void> {
	if (!(await closedRound(interaction, sessionId, deps))) return
	const pages = pickPages(await listApplications(deps.pool, sessionId))
	const among = (pages[page] ?? []).map((a) => a.discordId)
	const saved = await setPicks(deps.pool, sessionId, { among, picked: interaction.values ?? [] })
	if (!saved) {
		await interaction.update(buildModsNoticeCard(modsPickAlreadyDone))
		return
	}
	await interaction.update(await pickCard(deps, sessionId))
}

export async function handleModsPickReview(
	interaction: ModsPickInteraction,
	sessionId: string,
	deps: ModsDeps
): Promise<void> {
	if (!(await closedRound(interaction, sessionId, deps))) return
	const applications = await listApplications(deps.pool, sessionId)
	await interaction.update(
		buildModsPickConfirmCard({
			sessionId,
			picked: applications.filter((a) => a.picked).map((a) => a.discordId),
			applicants: applications.length,
		})
	)
}

export async function handleModsPickBack(
	interaction: ModsPickInteraction,
	sessionId: string,
	deps: ModsDeps
): Promise<void> {
	if (!(await closedRound(interaction, sessionId, deps))) return
	await interaction.update(await pickCard(deps, sessionId))
}

export async function handleModsPickGo(
	interaction: ModsPickInteraction,
	sessionId: string,
	deps: ModsDeps
): Promise<void> {
	if (!isAdmin(interaction)) {
		await interaction.reply(ephemeralText(configNoPermission))
		return
	}
	await interaction.deferUpdate()
	const session = await getSession(deps.pool, sessionId)
	if (!session || !(await finalizeSession(deps.pool, sessionId))) {
		await interaction.editReply(buildModsNoticeCard(modsPickAlreadyDone))
		return
	}

	const applications = await listApplications(deps.pool, sessionId)
	const picked = applications.filter((a) => a.picked).map((a) => a.discordId)
	const { roleId } = await getModsConfig(deps.pool, deps.guildId)
	const grantFailed: string[] = []
	for (const discordId of picked) {
		if (!roleId || !(await deps.discord.grantRole(discordId, roleId))) grantFailed.push(discordId)
	}
	const dmFailed: string[] = []
	for (const application of applications) {
		const sent = await deps.discord.sendDm(
			application.discordId,
			buildModsResultCard(application.picked)
		)
		if (!sent) dmFailed.push(application.discordId)
	}
	if (picked.length > 0 && session.boardChannelId) {
		await deps.discord.postCard(session.boardChannelId, buildModsWinnersCard(picked))
	}

	deps.modLog({
		kind: "mods_finalized",
		discordId: interaction.user.id,
		picked,
		grantFailed: grantFailed.length,
		dmFailed: dmFailed.length,
	})
	await interaction.editReply(
		buildModsNoticeCard(
			modsFinalizedSummary({ granted: picked.length - grantFailed.length, grantFailed, dmFailed })
		)
	)
}
