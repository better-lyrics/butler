import { PALETTE } from "@/config"
import {
	queueCancelButtonLabel,
	queueConfirmSealBody,
	queueConfirmSealButtonLabel,
	queueEntryDetails,
	queueEntryHeading,
	queueRejectButtonLabel,
	queueSealButtonLabel,
	queueSignalsLine,
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
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

const FLAGS = MessageFlags.IsComponentsV2

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

	return { components: [container], flags: FLAGS }
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

export function buildQueueResultCard(
	line: string,
	undo?: { action: string; lyricsId: string; label: string }
): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(line))
	if (undo) {
		container.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Secondary)
					.setCustomId(encodeCustomId(undo.action, [undo.lyricsId]))
					.setLabel(undo.label)
			)
		)
	}
	return { components: [container], flags: FLAGS }
}
