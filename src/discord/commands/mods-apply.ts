import {
	configGuildOnly,
	modsApplyClosed,
	modsApplyIneligible,
	modsApplyNotPosted,
	modsApplyPosted,
	modsApplyUpdated,
	modsVoteAdded,
	modsVoteClosed,
	modsVoteGone,
	modsVoteIneligible,
	modsVoteRemoved,
	modsVoteSelf,
} from "@/copy/strings"
import { getModsConfig } from "@/db/guild-config"
import {
	getActiveSession,
	getApplication,
	getSession,
	saveApplication,
	setApplicationCard,
	toggleSupport,
} from "@/db/mod-sessions"
import { buildModsApplyModal, readModsAnswers } from "@/discord/components/mods-apply-modal"
import { buildModsApplicationCard } from "@/discord/components/mods-card"
import { ephemeralText } from "@/discord/migrate/reply"
import { isVotingOpen } from "@/discord/mods/ballot"
import type { ModsDeps } from "@/discord/mods/round"
import { encodeCustomId } from "@/interactions/custom-id"
import { MessageFlags, type ModalBuilder, SlashCommandBuilder } from "discord.js"

export const modsApplyCommand = new SlashCommandBuilder()
	.setName("mods-apply")
	.setDescription("Apply to be a mod while applications are open")

export interface ModsApplyInteraction {
	guildId: string | null
	user: { id: string }
	reply(payload: unknown): Promise<unknown>
	showModal(modal: ModalBuilder): Promise<unknown>
}

export interface ModsApplySubmitInteraction {
	user: { id: string; username: string; globalName: string | null }
	fields: { getTextInputValue(id: string): string }
	deferReply(payload: { flags: number }): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export interface ModsSupportInteraction {
	user: { id: string }
	deferReply(payload: { flags: number }): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

async function isEligible(deps: ModsDeps, discordId: string): Promise<boolean> {
	const { minRoleId } = await getModsConfig(deps.pool, deps.guildId)
	return minRoleId !== null && (await deps.discord.meetsMinRole(discordId, minRoleId))
}

export async function handleModsApply(
	interaction: ModsApplyInteraction,
	deps: ModsDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(configGuildOnly))
		return
	}
	const session = await getActiveSession(deps.pool, deps.guildId)
	if (!session || !isVotingOpen(session, deps.now())) {
		await interaction.reply(ephemeralText(modsApplyClosed))
		return
	}
	if (!(await isEligible(deps, interaction.user.id))) {
		await interaction.reply(ephemeralText(modsApplyIneligible))
		return
	}
	const existing = await getApplication(deps.pool, session.id, interaction.user.id)
	await interaction.showModal(
		buildModsApplyModal(
			encodeCustomId("mods.apply.submit", [session.id]),
			existing?.answers ?? null
		)
	)
}

export async function handleModsApplySubmit(
	interaction: ModsApplySubmitInteraction,
	sessionId: string,
	deps: ModsDeps
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const session = await getSession(deps.pool, sessionId)
	if (!session?.boardChannelId || !isVotingOpen(session, deps.now())) {
		await interaction.editReply({ content: modsApplyClosed })
		return
	}

	const application = await saveApplication(deps.pool, {
		sessionId,
		discordId: interaction.user.id,
		displayName: interaction.user.globalName ?? interaction.user.username,
		answers: readModsAnswers(interaction.fields),
		submittedAt: deps.now(),
	})
	const card = buildModsApplicationCard({ application, open: true })

	if (application.channelId && application.messageId) {
		await deps.discord.editCard(application.channelId, application.messageId, card)
		await interaction.editReply({ content: modsApplyUpdated })
		return
	}

	const messageId = await deps.discord.postCard(session.boardChannelId, card)
	if (!messageId) {
		await interaction.editReply({ content: modsApplyNotPosted })
		return
	}
	await setApplicationCard(
		deps.pool,
		sessionId,
		interaction.user.id,
		session.boardChannelId,
		messageId
	)
	deps.refresh.board(sessionId)
	deps.modLog({ kind: "mods_applied", discordId: interaction.user.id })
	await interaction.editReply({ content: modsApplyPosted })
}

export async function handleModsSupport(
	interaction: ModsSupportInteraction,
	sessionId: string,
	applicantId: string,
	deps: ModsDeps
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const voterId = interaction.user.id
	const session = await getSession(deps.pool, sessionId)
	if (!session || !isVotingOpen(session, deps.now())) {
		await interaction.editReply({ content: modsVoteClosed })
		return
	}
	if (voterId === applicantId) {
		await interaction.editReply({ content: modsVoteSelf })
		return
	}
	if (!(await isEligible(deps, voterId))) {
		await interaction.editReply({ content: modsVoteIneligible })
		return
	}
	if (!(await getApplication(deps.pool, sessionId, applicantId))) {
		await interaction.editReply({ content: modsVoteGone })
		return
	}
	const { supported } = await toggleSupport(deps.pool, {
		sessionId,
		applicantId,
		voterId,
		at: deps.now(),
	})
	deps.refresh.card(sessionId, applicantId)
	deps.refresh.board(sessionId)
	await interaction.editReply({ content: supported ? modsVoteAdded : modsVoteRemoved })
}
