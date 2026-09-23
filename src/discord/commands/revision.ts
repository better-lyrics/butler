import {
	queueNotCouncil,
	revisionAlreadyDecided,
	revisionApproveCancelled,
	revisionApprovedBy,
	revisionError,
	revisionNotFound,
	revisionRejectModalTitle,
	revisionRejectedBy,
	revisionStale,
} from "@/copy/strings"
import type { RevisionDecisionRecord } from "@/db/revision-board"
import { buildConnectCard } from "@/discord/components/connect-card"
import { buildQueueResultCard } from "@/discord/components/queue-card"
import { buildRejectNoteModal, readRejectNote } from "@/discord/components/reject-note-modal"
import {
	buildRevisionApproveConfirmCard,
	buildRevisionCard,
	revisionCardEdit,
} from "@/discord/components/revision-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { encodeCustomId } from "@/interactions/custom-id"
import type { PendingRevisionCard, RevisionDecisionResult } from "@/unison/client"
import type {
	QueueModalOpenInteraction,
	QueueModalSubmitInteraction,
	QueueReplyInteraction,
	QueueUpdateInteraction,
} from "./queue"

export type RevisionDecisionFailure = Exclude<RevisionDecisionResult, { status: "decided" }>

export interface RevisionApproveDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	approveRevision(
		lyricsId: string,
		revisionId: string,
		keyId: string
	): Promise<RevisionDecisionResult>
	approveBoardCard(revisionId: string, actorId: string): Promise<void>
	linkPageUrl: string
}

export interface RevisionRejectDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	rejectRevision(
		lyricsId: string,
		revisionId: string,
		keyId: string,
		note?: string
	): Promise<RevisionDecisionResult>
	getCard(revisionId: string): Promise<PendingRevisionCard | null>
	markDecided(revisionId: string, decision: RevisionDecisionRecord): Promise<void>
	linkPageUrl: string
}

export function revisionDecisionErrorCopy(result: RevisionDecisionFailure): string {
	switch (result.status) {
		case "not_council":
			return queueNotCouncil
		case "not_found":
			return revisionNotFound
		case "already_decided":
			return revisionAlreadyDecided
		case "stale":
			return revisionStale
		default:
			return revisionError
	}
}

export async function handleRevisionApprove(
	interaction: QueueReplyInteraction,
	lyricsId: string,
	revisionId: string
): Promise<void> {
	if (!lyricsId || !revisionId) {
		await interaction.reply(ephemeralText(revisionError))
		return
	}
	await interaction.reply(ephemeralCard(buildRevisionApproveConfirmCard(lyricsId, revisionId)))
}

export async function handleRevisionApproveCancel(interaction: {
	update(payload: unknown): Promise<unknown>
}): Promise<void> {
	await interaction.update(buildQueueResultCard(revisionApproveCancelled))
}

export async function handleRevisionApproveConfirm(
	interaction: QueueUpdateInteraction,
	lyricsId: string,
	revisionId: string,
	deps: RevisionApproveDeps
): Promise<void> {
	if (!lyricsId || !revisionId) {
		await interaction.update(buildQueueResultCard(revisionError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}
	const result = await deps.approveRevision(lyricsId, revisionId, keyId)
	if (result.status !== "decided") {
		await interaction.update(buildQueueResultCard(revisionDecisionErrorCopy(result)))
		return
	}
	await interaction.update(buildQueueResultCard(revisionApprovedBy(interaction.user.id)))
	await deps.approveBoardCard(revisionId, interaction.user.id)
}

export async function handleRevisionReject(
	interaction: QueueModalOpenInteraction,
	lyricsId: string,
	revisionId: string
): Promise<void> {
	await interaction.showModal(
		buildRejectNoteModal(
			encodeCustomId("revision.reject.submit", [lyricsId, revisionId]),
			revisionRejectModalTitle
		)
	)
}

export async function handleRevisionRejectSubmit(
	interaction: QueueModalSubmitInteraction,
	lyricsId: string,
	revisionId: string,
	deps: RevisionRejectDeps
): Promise<void> {
	if (!lyricsId || !revisionId) {
		await interaction.reply(ephemeralText(revisionError))
		return
	}
	const note = readRejectNote(interaction.fields)
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}
	const result = await deps.rejectRevision(lyricsId, revisionId, keyId, note ?? undefined)
	if (result.status !== "decided") {
		await interaction.reply(ephemeralText(revisionDecisionErrorCopy(result)))
		return
	}
	const actorId = interaction.user.id
	await deps.markDecided(revisionId, { state: "rejected", actorId, note })
	const card = await deps.getCard(revisionId)
	await interaction.update(
		card
			? revisionCardEdit(buildRevisionCard(card, { kind: "rejected", actorId, note }))
			: revisionCardEdit(buildQueueResultCard(revisionRejectedBy(actorId)))
	)
}
