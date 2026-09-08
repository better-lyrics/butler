import { PALETTE } from "@/config"
import { badgeAwardTitle } from "@/copy/strings"
import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

export interface BadgeAwardCardOptions {
	discordId: string
	avatarUrl: string | null
	badgeName: string
	badgeDescription: string
}

export function buildBadgeAwardCard(opts: BadgeAwardCardOptions): CardPayload {
	const title = `**${badgeAwardTitle({ discordId: opts.discordId, badgeName: opts.badgeName })}**`

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))

	const description = new TextDisplayBuilder().setContent(opts.badgeDescription)
	if (opts.avatarUrl) {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(description)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl))
		)
	} else {
		container.addTextDisplayComponents(description)
	}

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
