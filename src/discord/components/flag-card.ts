import { PALETTE } from "@/config"
import {
	councilDashboardButtonLabel,
	flagClosedTally,
	flagConfirmKeepBody,
	flagConfirmKeepButtonLabel,
	flagConfirmRemoveBody,
	flagConfirmRemoveButtonLabel,
	flagDetailLine,
	flagHeading,
	flagKeepButtonLabel,
	flagKept,
	flagKicker,
	flagReasonsLine,
	flagRemoveButtonLabel,
	flagRemoved,
	flagResolved,
	flagSubmitterLine,
	flagTally,
	queueVerifyButtonLabel,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { FlagCard } from "@/unison/client"
import { councilItemUrl } from "@/unison/council-links"
import { ytmWatchUrl } from "@/ytm/watch-url"
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
import { buildConfirmCard } from "./queue-card"
import { truncate } from "./truncate"

export const FLAG_MAX_DETAILS = 3
export const FLAG_DETAIL_MAX_CHARS = 300
const MAX_TITLE = 200
const MAX_SUBMITTER = 100

const FLAGS = MessageFlags.IsComponentsV2

const NO_MENTIONS: MessageMentionOptions = { parse: [] }

export type FlagOutcome = { kind: "removed" } | { kind: "kept" } | { kind: "resolved" }

const OUTCOME_LINES: Record<FlagOutcome["kind"], string> = {
	removed: flagRemoved,
	kept: flagKept,
	resolved: flagResolved,
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

export function buildFlagCard(
	card: FlagCard,
	needed: number,
	outcome: FlagOutcome | null = null
): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(flagKicker))
		.addTextDisplayComponents(
			text(flagHeading(truncate(card.song, MAX_TITLE), truncate(card.artist, MAX_TITLE)))
		)
	if (card.submitterName) {
		container.addTextDisplayComponents(
			text(flagSubmitterLine(truncate(card.submitterName, MAX_SUBMITTER)))
		)
	}

	const reasons = flagReasonsLine(card.reports)
	if (reasons) container.addTextDisplayComponents(text(reasons))
	const details = card.reports
		.flatMap((report) => (report.details ? [report.details] : []))
		.slice(0, FLAG_MAX_DETAILS)
		.map((detail) => flagDetailLine(truncate(detail, FLAG_DETAIL_MAX_CHARS)))
	if (details.length > 0) container.addTextDisplayComponents(text(details.join("\n")))

	if (outcome) {
		container.addTextDisplayComponents(text(flagClosedTally(card.removals, card.keeps)))
		container.addTextDisplayComponents(text(OUTCOME_LINES[outcome.kind]))
	} else {
		container.addTextDisplayComponents(text(flagTally(card.removals, needed, card.keeps)))
	}

	const id = String(card.id)
	const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setStyle(ButtonStyle.Link)
			.setURL(ytmWatchUrl(card.videoId))
			.setLabel(queueVerifyButtonLabel)
	)
	if (!outcome) {
		actions.addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Danger)
				.setCustomId(encodeCustomId("flag.remove", [id]))
				.setLabel(flagRemoveButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Secondary)
				.setCustomId(encodeCustomId("flag.keep", [id]))
				.setLabel(flagKeepButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Link)
				.setURL(councilItemUrl("flags", card.id))
				.setLabel(councilDashboardButtonLabel)
		)
	}
	container.addActionRowComponents(actions)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildFlagVoteConfirmCard(caseId: string, remove: boolean): CardPayload {
	return buildConfirmCard({
		body: remove ? flagConfirmRemoveBody : flagConfirmKeepBody,
		confirmLabel: remove ? flagConfirmRemoveButtonLabel : flagConfirmKeepButtonLabel,
		confirmId: encodeCustomId("flag.vote.confirm", [caseId, remove ? "1" : "0"]),
		cancelId: encodeCustomId("flag.vote.cancel", []),
	})
}
