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

export interface AnnounceSummaryCardOptions {
	promotions: Array<{ displayName: string; tier: string }>
	badges: Array<{ displayName: string; badgeName: string }>
}

function block(label: string, lines: string[]): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(`${label}\n${lines.join("\n")}`)
}

export function buildAnnounceSummaryCard(opts: AnnounceSummaryCardOptions): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(announceSummaryHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))

	if (opts.promotions.length > 0) {
		const lines = opts.promotions.map((p) => announceSummaryPromotionLine(p))
		container.addTextDisplayComponents(block(announceSummaryPromotionsLabel, lines))
	}

	if (opts.badges.length > 0) {
		if (opts.promotions.length > 0) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		}
		const lines = opts.badges.map((b) => announceSummaryBadgeLine(b))
		container.addTextDisplayComponents(block(announceSummaryBadgesLabel, lines))
	}

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
