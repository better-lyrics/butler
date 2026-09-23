import { PALETTE } from "@/config"
import {
	queueEntryHeading,
	queueRejectButtonLabel,
	queueRejectNoteLine,
	queueVerifyButtonLabel,
	revisionApproveButtonLabel,
	revisionApprovedBy,
	revisionConfirmApproveBody,
	revisionConfirmApproveButtonLabel,
	revisionDetails,
	revisionKicker,
	revisionPreviewEmpty,
	revisionPreviewTrimmed,
	revisionReasonLine,
	revisionRejectedBy,
	revisionResolved,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { PendingRevisionCard } from "@/unison/client"
import { ytmWatchUrl } from "@/ytm/watch-url"
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	FileBuilder,
	MessageFlags,
	type MessageMentionOptions,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"
import { buildConfirmCard } from "./queue-card"
import { truncate } from "./truncate"

export const REVISION_PREVIEW_MAX_LINES = 12
export const REVISION_PREVIEW_MAX_CHARS = 1500
const MAX_TITLE = 200
const MAX_AUTHOR = 100

const FLAGS = MessageFlags.IsComponentsV2

const NO_MENTIONS: MessageMentionOptions = { parse: [] }

export type RevisionOutcome =
	| { kind: "approved"; actorId: string }
	| { kind: "rejected"; actorId: string; note: string | null }
	| { kind: "resolved" }

export interface RevisionCardPayload extends CardPayload {
	files: AttachmentBuilder[]
}

export interface DiffPreview {
	block: string | null
	trimmed: boolean
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

function defuseFence(line: string): string {
	return line.replace(/`{3,}/g, (run) => run.split("").join("\u200b"))
}

export function formatDiffPreview(diff: string): DiffPreview {
	const normalized = diff.replace(/\r\n?/g, "\n").replace(/\n+$/, "")
	if (normalized.trim() === "") return { block: null, trimmed: false }
	const lines = normalized.split("\n").map(defuseFence)
	const kept: string[] = []
	let used = 0
	let trimmed = lines.length > REVISION_PREVIEW_MAX_LINES
	for (const line of lines.slice(0, REVISION_PREVIEW_MAX_LINES)) {
		const room = REVISION_PREVIEW_MAX_CHARS - used
		if (line.length > room) {
			if (room > 1) kept.push(truncate(line, room))
			trimmed = true
			break
		}
		kept.push(line)
		used += line.length + 1
	}
	return { block: `\`\`\`diff\n${kept.join("\n")}\n\`\`\``, trimmed }
}

function outcomeLine(outcome: RevisionOutcome): string {
	if (outcome.kind === "approved") return revisionApprovedBy(outcome.actorId)
	if (outcome.kind === "rejected") return revisionRejectedBy(outcome.actorId)
	return revisionResolved
}

export function buildRevisionCard(
	card: PendingRevisionCard,
	outcome: RevisionOutcome | null = null
): RevisionCardPayload {
	const ids = [String(card.lyricsId), String(card.revisionId)]
	const author = card.author ? { displayName: truncate(card.author.displayName, MAX_AUTHOR) } : null
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(revisionKicker))
		.addTextDisplayComponents(text(queueEntryHeading(truncate(card.song, MAX_TITLE))))
		.addTextDisplayComponents(
			text(revisionDetails({ ...card, artist: truncate(card.artist, MAX_TITLE), author }))
		)
		.addTextDisplayComponents(text(revisionReasonLine(card)))

	const preview = formatDiffPreview(card.diffPreview)
	container.addTextDisplayComponents(text(preview.block ?? revisionPreviewEmpty))
	if (preview.trimmed) container.addTextDisplayComponents(text(revisionPreviewTrimmed))

	const files: AttachmentBuilder[] = []
	if (card.diffFull.trim() !== "") {
		const name = `lyric-${card.lyricsId}-rev-${card.revNo}.diff`
		files.push(new AttachmentBuilder(Buffer.from(card.diffFull, "utf8"), { name }))
		container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`))
	}

	if (outcome) {
		container.addTextDisplayComponents(text(outcomeLine(outcome)))
		if (outcome.kind === "rejected" && outcome.note) {
			container.addTextDisplayComponents(text(queueRejectNoteLine(outcome.note)))
		}
	}

	const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setStyle(ButtonStyle.Link)
			.setURL(ytmWatchUrl(card.videoId))
			.setLabel(queueVerifyButtonLabel)
	)
	if (!outcome) {
		actions.addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Success)
				.setCustomId(encodeCustomId("revision.approve", ids))
				.setLabel(revisionApproveButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Danger)
				.setCustomId(encodeCustomId("revision.reject", ids))
				.setLabel(queueRejectButtonLabel)
		)
	}
	container.addActionRowComponents(actions)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS, files }
}

export function buildRevisionApproveConfirmCard(lyricsId: string, revisionId: string): CardPayload {
	return buildConfirmCard({
		body: revisionConfirmApproveBody,
		confirmLabel: revisionConfirmApproveButtonLabel,
		confirmId: encodeCustomId("revision.approve.confirm", [lyricsId, revisionId]),
		cancelId: encodeCustomId("revision.approve.cancel", []),
	})
}

export function revisionCardEdit<T extends CardPayload>(payload: T): T & { attachments: never[] } {
	return { ...payload, attachments: [] }
}
