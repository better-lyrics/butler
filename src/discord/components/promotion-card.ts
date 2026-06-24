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

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))

	if (subtitle !== "") {
		const subtitleText = new TextDisplayBuilder().setContent(subtitle)
		if (opts.avatarUrl !== "") {
			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(subtitleText)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl))
			)
		} else {
			container.addTextDisplayComponents(subtitleText)
		}
		container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
	}

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${stats}`))

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
