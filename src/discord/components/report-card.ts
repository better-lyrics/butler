import {
	blockedMetadataFallback,
	reportAddToBoardButtonLabel,
	reportFixItMyselfButtonLabel,
	selfFixInstructions,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

export interface ReportMeta {
	title: string
	artist: string
	albumArtUrl: string | null
}

export interface ReportCardOptions {
	videoId: string
	posterId: string
	meta: ReportMeta | null
	composerUrl: string
}

function addMetaContent(container: ContainerBuilder, meta: ReportMeta): void {
	const summary = `${meta.title}\n${meta.artist}`
	if (meta.albumArtUrl !== null && meta.albumArtUrl !== "") {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(summary))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(meta.albumArtUrl))
		)
		return
	}
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(summary))
}

function addBlockedContent(container: ContainerBuilder): void {
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(blockedMetadataFallback),
		new TextDisplayBuilder().setContent(selfFixInstructions)
	)
}

export function buildReportCard(opts: ReportCardOptions): CardPayload {
	const container = new ContainerBuilder()

	if (opts.meta !== null) {
		addMetaContent(container, opts.meta)
	} else {
		addBlockedContent(container)
	}

	const row = new ActionRowBuilder<ButtonBuilder>()

	row.addComponents(
		new ButtonBuilder()
			.setStyle(ButtonStyle.Link)
			.setURL(opts.composerUrl)
			.setLabel(reportFixItMyselfButtonLabel)
	)

	if (opts.meta !== null) {
		row.addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Primary)
				.setCustomId(encodeCustomId("report.add", [opts.videoId, opts.posterId]))
				.setLabel(reportAddToBoardButtonLabel)
		)
	}

	container.addActionRowComponents(row)

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
