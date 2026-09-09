import {
	queueAlreadyRejected,
	queueEmpty,
	queueError,
	queueNotCouncil,
	queueRejectModalTitle,
	queueRejectNoteLabel,
	queueRejectUndone,
	queueRejectedBy,
	queueSealCancelled,
	queueSealUndone,
	queueSealedBy,
	queueUndoRejectButtonLabel,
	queueUndoSealButtonLabel,
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
	buildQueueResultCard,
	buildQueueSealConfirmCard,
} from "@/discord/components/queue-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { encodeCustomId } from "@/interactions/custom-id"
import type {
	QueueResult,
	QuotaResult,
	RejectResult,
	SealResult,
	UnrejectResult,
	UnsealResult,
} from "@/unison/client"
import {
	ActionRowBuilder,
	ModalBuilder,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js"

export const queueCommand = new SlashCommandBuilder()
	.setName("queue")
	.setDescription("Browse top-voted lyrics waiting to be sealed")

const NOTE_INPUT = "note"

export const QUEUE_LIMIT = 10

/** Minimal shape of the /queue chat command interaction. */
export interface QueueCommandInteraction {
	user: { id: string }
	reply(payload: unknown): Promise<unknown>
	followUp(payload: unknown): Promise<unknown>
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

/** Minimal shape of the reject button interaction (opens the note modal). */
export interface QueueModalOpenInteraction {
	showModal(modal: ModalBuilder): Promise<unknown>
}

/** Minimal shape of the reject note modal submit. */
export interface QueueModalSubmitInteraction {
	user: { id: string }
	fields: { getTextInputValue(id: string): string }
	reply(payload: unknown): Promise<unknown>
}

export interface QueueCommandDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	getBoostQuota(keyId: string): Promise<QuotaResult>
	getQueue(): Promise<QueueResult>
	linkPageUrl: string
}

export interface QueueSealDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	boostLyrics(lyricsId: string, keyId: string): Promise<SealResult>
	linkPageUrl: string
}

export interface QueueSealUndoDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	unboostLyrics(lyricsId: string, keyId: string): Promise<UnsealResult>
	linkPageUrl: string
}

export interface QueueRejectDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	rejectLyric(lyricsId: string, keyId: string, note?: string): Promise<RejectResult>
	linkPageUrl: string
}

export interface QueueRejectUndoDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	unrejectLyric(lyricsId: string, keyId: string): Promise<UnrejectResult>
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

	const result = await deps.getQueue()
	if (result.status !== "ok") {
		await interaction.reply(ephemeralText(queueError))
		return
	}
	const first = result.entries[0]
	if (!first) {
		await interaction.reply(ephemeralText(queueEmpty))
		return
	}

	await interaction.reply(ephemeralCard(buildQueueCard(first)))
	for (const entry of result.entries.slice(1)) {
		await interaction.followUp(ephemeralCard(buildQueueCard(entry)))
	}
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
			await interaction.update(
				buildQueueResultCard(queueSealedBy(interaction.user.id), {
					action: "queue.seal.undo",
					lyricsId,
					label: queueUndoSealButtonLabel,
				})
			)
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
	interaction: QueueUpdateInteraction,
	lyricsId: string,
	deps: QueueSealUndoDeps
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
	const result = await deps.unboostLyrics(lyricsId, keyId)
	switch (result.status) {
		case "unsealed":
			await interaction.update(buildQueueResultCard(queueSealUndone))
			return
		case "not_owner":
			await interaction.update(buildQueueResultCard(sealNotOwner))
			return
		case "not_found":
			await interaction.update(buildQueueResultCard(sealNotFound))
			return
		case "not_council":
			await interaction.update(buildQueueResultCard(sealNotCouncil))
			return
		default:
			await interaction.update(buildQueueResultCard(sealError))
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
		case "rejected":
			await interaction.reply(
				ephemeralCard(
					buildQueueResultCard(queueRejectedBy(interaction.user.id), {
						action: "queue.reject.undo",
						lyricsId,
						label: queueUndoRejectButtonLabel,
					})
				)
			)
			return
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
	interaction: QueueUpdateInteraction,
	lyricsId: string,
	deps: QueueRejectUndoDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.update(buildQueueResultCard(queueError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}
	const result = await deps.unrejectLyric(lyricsId, keyId)
	switch (result.status) {
		case "unrejected":
			await interaction.update(buildQueueResultCard(queueRejectUndone))
			return
		case "not_council":
			await interaction.update(buildQueueResultCard(queueNotCouncil))
			return
		case "not_found":
			await interaction.update(buildQueueResultCard(sealNotFound))
			return
		default:
			await interaction.update(buildQueueResultCard(queueError))
			return
	}
}
