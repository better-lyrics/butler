import { PALETTE } from "@/config"
import {
	announceSummaryBadgeLine,
	announceSummaryBadgesLabel,
	announceSummaryHeading,
	announceSummaryPromotionLine,
	announceSummaryPromotionsLabel,
} from "@/copy/strings"
import { ContainerBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder } from "discord.js"
import type { CardPayload } from "./connect-card"
import { MAX_MESSAGE_TEXT } from "./limits"

export interface AnnounceSummaryCardOptions {
	promotions: Array<{ displayName: string; tier: string }>
	badges: Array<{ displayName: string; badgeName: string }>
}

interface Section {
	label: string
	lines: string[]
}

function toPayload(sections: Section[]): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(announceSummaryHeading))
	for (const section of sections) {
		container
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`${section.label}\n${section.lines.join("\n")}`)
			)
	}
	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

export interface AnnounceSummaryMessage {
	card: CardPayload
	entries: number
}

export function buildAnnounceSummaryCards(
	opts: AnnounceSummaryCardOptions
): AnnounceSummaryMessage[] {
	const sections: Section[] = [
		{
			label: announceSummaryPromotionsLabel,
			lines: opts.promotions.map((p) => announceSummaryPromotionLine(p)),
		},
		{
			label: announceSummaryBadgesLabel,
			lines: opts.badges.map((b) => announceSummaryBadgeLine(b)),
		},
	]

	const messages: Section[][] = []
	let current: Section[] = []
	let used = announceSummaryHeading.length
	for (const { label, lines } of sections) {
		let open: Section | null = null
		for (const line of lines) {
			const cost = (open === null ? label.length + 1 : 0) + line.length + 1
			if (current.length > 0 && used + cost > MAX_MESSAGE_TEXT) {
				messages.push(current)
				current = []
				open = null
				used = announceSummaryHeading.length
			}
			if (open === null) {
				open = { label, lines: [] }
				current.push(open)
				used += label.length + 1
			}
			open.lines.push(line)
			used += line.length + 1
		}
	}
	if (current.length > 0) messages.push(current)
	return messages.map((sections) => ({
		card: toPayload(sections),
		entries: sections.reduce((sum, section) => sum + section.lines.length, 0),
	}))
}
