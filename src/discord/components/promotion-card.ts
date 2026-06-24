import { PALETTE } from "@/config"
import { promotionStats, promotionSubtitle, promotionTitle } from "@/copy/strings"
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
	const title = `**${promotionTitle({ discordId: opts.discordId, tier: opts.tier })}**`
	const subtitle = promotionSubtitle(opts.tier)
	const stats = promotionStats({
		rank: opts.rank,
		submissionCount: opts.submissionCount,
		totalUpvotes: opts.totalUpvotes,
	})

	const container = new ContainerBuilder().setAccentColor(PALETTE.betterLyricsRed)

	const titleText = new TextDisplayBuilder().setContent(title)
	if (opts.avatarUrl !== "") {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(titleText)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl))
		)
	} else {
		container.addTextDisplayComponents(titleText)
	}

	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))

	const body: TextDisplayBuilder[] = []
	if (subtitle !== "") body.push(new TextDisplayBuilder().setContent(subtitle))
	body.push(new TextDisplayBuilder().setContent(stats))
	container.addTextDisplayComponents(...body)

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
