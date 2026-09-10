import { PALETTE } from "@/config"
import {
	queueCancelButtonLabel,
	queueConfirmSealBody,
	queueConfirmSealButtonLabel,
	queueEntryDetails,
	queueEntryHeading,
	queueRejectButtonLabel,
	queueRejectNoteLine,
	queueRejectedBy,
	queueRejectedGeneric,
	queueSealButtonLabel,
	queueSealedBy,
	queueSealedGeneric,
	queueSignalsLine,
	queueUndoRejectButtonLabel,
	queueUndoSealButtonLabel,
	queueVerifyButtonLabel,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { QueueEntry } from "@/unison/client"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	type MessageMentionOptions,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

const FLAGS = MessageFlags.IsComponentsV2

const NO_MENTIONS: MessageMentionOptions = { parse: [] }

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

function ytmUrl(videoId: string): string {
	return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}

export function buildQueueCard(entry: QueueEntry): CardPayload {
	const id = String(entry.id)
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(queueEntryHeading(entry.song)))
		.addTextDisplayComponents(text(queueEntryDetails(entry)))

	const signals = queueSignalsLine(entry.format, entry.ttmlSignals)
	if (signals) {
		container.addTextDisplayComponents(text(signals))
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Link)
				.setURL(ytmUrl(entry.videoId))
				.setLabel(queueVerifyButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Success)
				.setCustomId(encodeCustomId("queue.seal", [id]))
				.setLabel(queueSealButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Danger)
				.setCustomId(encodeCustomId("queue.reject", [id]))
				.setLabel(queueRejectButtonLabel)
		)
	)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export type BoardCardState = "pending" | "sealed" | "rejected"

interface DecidedInput {
	entry: QueueEntry
	actorId: string | null
	note: string | null
}

function decidedCard(
	input: DecidedInput,
	line: string,
	undo: { action: string; label: string }
): CardPayload {
	const id = String(input.entry.id)
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(queueEntryHeading(input.entry.song)))
		.addTextDisplayComponents(text(queueEntryDetails(input.entry)))
		.addTextDisplayComponents(text(line))

	if (input.note) {
		container.addTextDisplayComponents(text(queueRejectNoteLine(input.note)))
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Link)
				.setURL(ytmUrl(input.entry.videoId))
				.setLabel(queueVerifyButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Secondary)
				.setCustomId(encodeCustomId(undo.action, [id]))
				.setLabel(undo.label)
		)
	)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildQueueSealedCard(entry: QueueEntry, actorId: string | null): CardPayload {
	const line = actorId ? queueSealedBy(actorId) : queueSealedGeneric
	return decidedCard({ entry, actorId, note: null }, line, {
		action: "queue.seal.undo",
		label: queueUndoSealButtonLabel,
	})
}

export function buildQueueRejectedCard(
	entry: QueueEntry,
	actorId: string | null,
	note: string | null
): CardPayload {
	const line = actorId ? queueRejectedBy(actorId) : queueRejectedGeneric
	return decidedCard({ entry, actorId, note }, line, {
		action: "queue.reject.undo",
		label: queueUndoRejectButtonLabel,
	})
}

export function buildBoardCard(card: {
	state: BoardCardState
	entry: QueueEntry
	actorId: string | null
	note: string | null
}): CardPayload {
	if (card.state === "sealed") return buildQueueSealedCard(card.entry, card.actorId)
	if (card.state === "rejected") return buildQueueRejectedCard(card.entry, card.actorId, card.note)
	return buildQueueCard(card.entry)
}

export function buildQueueSealConfirmCard(lyricsId: string): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(queueConfirmSealBody))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Success)
					.setCustomId(encodeCustomId("queue.seal.confirm", [lyricsId]))
					.setLabel(queueConfirmSealButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Secondary)
					.setCustomId(encodeCustomId("queue.seal.cancel", []))
					.setLabel(queueCancelButtonLabel)
			)
		)
	return { components: [container], flags: FLAGS }
}

export function buildQueueResultCard(line: string): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(line))
	return { components: [container], flags: FLAGS }
}
