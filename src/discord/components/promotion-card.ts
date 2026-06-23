import { PALETTE } from "@/config"
import { promotionAnnouncement, tierLabel } from "@/copy/strings"
import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

export interface PromotionCardOptions {
	displayName: string
	avatarUrl: string
	tier: string
	rank: number
	submissionCount: number
	totalUpvotes: number
}

export function buildPromotionCard(opts: PromotionCardOptions): CardPayload {
	const announcement = promotionAnnouncement({
		displayName: opts.displayName,
		tierLabel: tierLabel(opts.tier),
		rank: opts.rank,
		submissionCount: opts.submissionCount,
		totalUpvotes: opts.totalUpvotes,
	})

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(announcement))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl))
		)

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
