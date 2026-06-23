import { PALETTE } from "@/config"
import { promotionHeadline, promotionStats } from "@/copy/strings"
import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

export interface PromotionCardOptions {
	discordId: string
	avatarUrl: string
	tier: string
	rank: number
	submissionCount: number
	totalUpvotes: number
}

export function buildPromotionCard(opts: PromotionCardOptions): CardPayload {
	const headline = promotionHeadline({ discordId: opts.discordId, tier: opts.tier })
	const stats = promotionStats({
		rank: opts.rank,
		submissionCount: opts.submissionCount,
		totalUpvotes: opts.totalUpvotes,
	})

	const container = new ContainerBuilder().setAccentColor(PALETTE.betterLyricsRed)

	if (opts.avatarUrl !== "") {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(headline))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl))
		)
	} else {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headline))
	}

	container
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(stats))

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
