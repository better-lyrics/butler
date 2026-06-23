import { PALETTE } from "@/config"
import { connectButtonLabel, connectHeading, connectPerk, connectPromptBody } from "@/copy/strings"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	TextDisplayBuilder,
} from "discord.js"

export interface CardPayload {
	components: ContainerBuilder[]
	flags: number | number[]
}

export function buildConnectCard(opts: { linkPageUrl: string }): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(connectHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(connectPromptBody),
			new TextDisplayBuilder().setContent(connectPerk)
		)
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Link)
					.setURL(opts.linkPageUrl)
					.setLabel(connectButtonLabel)
			)
		)

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
