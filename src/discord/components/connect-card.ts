import { connectButtonLabel, connectPromptBody } from "@/copy/strings"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	TextDisplayBuilder,
} from "discord.js"

export interface CardPayload {
	components: ContainerBuilder[]
	flags: number | number[]
}

export function buildConnectCard(opts: { linkPageUrl: string }): CardPayload {
	const container = new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(connectPromptBody))
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
