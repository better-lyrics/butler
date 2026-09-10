import {
	queueAlreadyRejected,
	queueError,
	queueNotCouncil,
	queueRejectModalTitle,
	queueRejectNoteLabel,
	queueRejectUndone,
	queueRejectedBy,
	queueResendEmpty,
	queueResendFailed,
	queueResendPosted,
	queueSealCancelled,
	queueSealUndone,
	queueSealedBy,
	queueUnknownUser,
	sealAlreadyActive,
	sealError,
	sealNotCouncil,
	sealNotFound,
	sealNotOwner,
	sealOverQuota,
	sealSelf,
	sealTargetCouncil,
} from "@/copy/strings"
import { buildConnectCard } from "@/discord/components/connect-card"
import {
	buildQueueCard,
	buildQueueRejectedCard,
	buildQueueResultCard,
	buildQueueSealConfirmCard,
} from "@/discord/components/queue-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { encodeCustomId } from "@/interactions/custom-id"
import type {
	QueueEntry,
	QuotaResult,
	RejectResult,
	SealResult,
	UnrejectResult,
	UnsealResult,
} from "@/unison/client"
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js"

export const queueCommand = new SlashCommandBuilder()
	.setName("queue")
	.setDescription("Repost the current review board so the council can pick it back up")

const NOTE_INPUT = "note"

export const QUEUE_LIMIT = 10

/** Minimal shape of the /queue chat command interaction. */
export interface QueueCommandInteraction {
	user: { id: string }
	deferReply(options: unknown): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

/** Minimal shape of a button interaction that opens an ephemeral reply. */
export interface QueueReplyInteraction {
	reply(payload: unknown): Promise<unknown>
}

/** Minimal shape of a button interaction that edits its own message. */
export interface QueueUpdateInteraction {
	user: { id: string }
	update(payload: unknown): Promise<unknown>
}

/** A board button that can either edit its card or answer with an ephemeral note. */
export interface QueueBoardInteraction {
	user: { id: string }
	update(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

/** Minimal shape of the reject button interaction (opens the note modal). */
export interface QueueModalOpenInteraction {
	showModal(modal: ModalBuilder): Promise<unknown>
}

/** Minimal shape of the reject note modal submit (edits its card or replies ephemerally). */
export interface QueueModalSubmitInteraction {
	user: { id: string }
	fields: { getTextInputValue(id: string): string }
	update(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

export interface QueueCommandDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	getBoostQuota(keyId: string): Promise<QuotaResult>
	resendBoard(): Promise<"posted" | "empty" | "failed">
	linkPageUrl: string
}

export interface QueueSealDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	boostLyrics(lyricsId: string, keyId: string): Promise<SealResult>
	sealBoardCard(lyricsId: string, actorId: string): Promise<void>
	linkPageUrl: string
}

export interface QueueSealUndoDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	unboostLyrics(lyricsId: string, keyId: string): Promise<UnsealResult>
	getEntry(lyricsId: string): Promise<QueueEntry | null>
	markPending(lyricsId: string): Promise<void>
	linkPageUrl: string
}

export interface QueueRejectDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	rejectLyric(lyricsId: string, keyId: string, note?: string): Promise<RejectResult>
	getEntry(lyricsId: string): Promise<QueueEntry | null>
	markRejected(lyricsId: string, actorId: string, note: string | null): Promise<void>
	linkPageUrl: string
}

export interface QueueRejectUndoDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	unrejectLyric(lyricsId: string, keyId: string): Promise<UnrejectResult>
	getEntry(lyricsId: string): Promise<QueueEntry | null>
	markPending(lyricsId: string): Promise<void>
	linkPageUrl: string
}

export async function handleQueue(
	interaction: QueueCommandInteraction,
	deps: QueueCommandDeps
): Promise<void> {
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}

	const quota = await deps.getBoostQuota(keyId)
	if (quota.status === "not_council") {
		await interaction.reply(ephemeralText(queueNotCouncil))
		return
	}
	if (quota.status === "unknown_user") {
		await interaction.reply(ephemeralText(queueUnknownUser))
		return
	}
	if (quota.status !== "ok") {
		await interaction.reply(ephemeralText(queueError))
		return
	}

	// Reposting the board sends a message per lyric, which can exceed the 3 second reply window.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const result = await deps.resendBoard()
	await interaction.editReply({ content: RESEND_COPY[result] })
}

const RESEND_COPY: Record<"posted" | "empty" | "failed", string> = {
	posted: queueResendPosted,
	empty: queueResendEmpty,
	failed: queueResendFailed,
}

export async function handleQueueSeal(
	interaction: QueueReplyInteraction,
	lyricsId: string
): Promise<void> {
	if (!lyricsId) {
		await interaction.reply(ephemeralText(queueError))
		return
	}
	await interaction.reply(ephemeralCard(buildQueueSealConfirmCard(lyricsId)))
}

export async function handleQueueSealCancel(interaction: {
	update(payload: unknown): Promise<unknown>
}): Promise<void> {
	await interaction.update(buildQueueResultCard(queueSealCancelled))
}

export async function handleQueueSealConfirm(
	interaction: QueueUpdateInteraction,
	lyricsId: string,
	deps: QueueSealDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.update(buildQueueResultCard(sealError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}
	const result = await deps.boostLyrics(lyricsId, keyId)
	switch (result.status) {
		case "sealed":
			await interaction.update(buildQueueResultCard(queueSealedBy(interaction.user.id)))
			await deps.sealBoardCard(lyricsId, interaction.user.id)
			return
		case "not_council":
			await interaction.update(buildQueueResultCard(sealNotCouncil))
			return
		case "not_found":
			await interaction.update(buildQueueResultCard(sealNotFound))
			return
		case "self":
			await interaction.update(buildQueueResultCard(sealSelf))
			return
		case "target_council":
			await interaction.update(buildQueueResultCard(sealTargetCouncil))
			return
		case "over_quota":
			await interaction.update(buildQueueResultCard(sealOverQuota))
			return
		case "already_sealed":
			await interaction.update(buildQueueResultCard(sealAlreadyActive))
			return
		default:
			await interaction.update(buildQueueResultCard(sealError))
			return
	}
}

export async function handleQueueSealUndo(
	interaction: QueueBoardInteraction,
	lyricsId: string,
	deps: QueueSealUndoDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.reply(ephemeralText(sealError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}
	const result = await deps.unboostLyrics(lyricsId, keyId)
	switch (result.status) {
		case "unsealed": {
			const entry = await deps.getEntry(lyricsId)
			await deps.markPending(lyricsId)
			await interaction.update(
				entry ? buildQueueCard(entry) : buildQueueResultCard(queueSealUndone)
			)
			return
		}
		case "not_owner":
			await interaction.reply(ephemeralText(sealNotOwner))
			return
		case "not_found":
			await interaction.reply(ephemeralText(sealNotFound))
			return
		case "not_council":
			await interaction.reply(ephemeralText(sealNotCouncil))
			return
		default:
			await interaction.reply(ephemeralText(sealError))
			return
	}
}

export async function handleQueueReject(
	interaction: QueueModalOpenInteraction,
	lyricsId: string
): Promise<void> {
	const modal = new ModalBuilder()
		.setCustomId(encodeCustomId("queue.reject.submit", [lyricsId]))
		.setTitle(queueRejectModalTitle)
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(NOTE_INPUT)
					.setLabel(queueRejectNoteLabel)
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(false)
					.setMaxLength(300)
			)
		)
	await interaction.showModal(modal)
}

export async function handleQueueRejectSubmit(
	interaction: QueueModalSubmitInteraction,
	lyricsId: string,
	deps: QueueRejectDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.reply(ephemeralText(queueError))
		return
	}
	const note = interaction.fields.getTextInputValue(NOTE_INPUT).trim()
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}
	const result = await deps.rejectLyric(lyricsId, keyId, note || undefined)
	switch (result.status) {
		case "rejected": {
			const entry = await deps.getEntry(lyricsId)
			await deps.markRejected(lyricsId, interaction.user.id, note || null)
			await interaction.update(
				entry
					? buildQueueRejectedCard(entry, interaction.user.id, note || null)
					: buildQueueResultCard(queueRejectedBy(interaction.user.id))
			)
			return
		}
		case "not_council":
			await interaction.reply(ephemeralText(queueNotCouncil))
			return
		case "not_found":
			await interaction.reply(ephemeralText(sealNotFound))
			return
		case "already_rejected":
			await interaction.reply(ephemeralText(queueAlreadyRejected))
			return
		default:
			await interaction.reply(ephemeralText(queueError))
			return
	}
}

export async function handleQueueRejectUndo(
	interaction: QueueBoardInteraction,
	lyricsId: string,
	deps: QueueRejectUndoDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.reply(ephemeralText(queueError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}
	const result = await deps.unrejectLyric(lyricsId, keyId)
	switch (result.status) {
		case "unrejected": {
			const entry = await deps.getEntry(lyricsId)
			await deps.markPending(lyricsId)
			await interaction.update(
				entry ? buildQueueCard(entry) : buildQueueResultCard(queueRejectUndone)
			)
			return
		}
		case "not_council":
			await interaction.reply(ephemeralText(queueNotCouncil))
			return
		case "not_found":
			await interaction.reply(ephemeralText(sealNotFound))
			return
		default:
			await interaction.reply(ephemeralText(queueError))
			return
	}
}
