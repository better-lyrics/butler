import { PALETTE } from "@/config"
import {
	sealConfirmButtonLabel,
	sealPickBody,
	sealPickHeading,
	sealPickPlaceholder,
	sealVariantDescription,
	sealVariantLabel,
	unsealConfirmButtonLabel,
	unsealPickBody,
	unsealPickHeading,
	unsealPickPlaceholder,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { LyricVariant } from "@/unison/client"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

const FLAGS = MessageFlags.IsComponentsV2

export type SealMode = "add" | "remove"

/** Discord caps a select menu at 25 options and each label/description at 100 chars. */
const MAX_OPTIONS = 25
const MAX_FIELD = 100

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

function truncate(value: string, max = MAX_FIELD): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const COPY: Record<
	SealMode,
	{
		heading: string
		body: string
		placeholder: string
		action: string
		buttonLabel: string
		buttonStyle: ButtonStyle
	}
> = {
	add: {
		heading: sealPickHeading,
		body: sealPickBody,
		placeholder: sealPickPlaceholder,
		action: "seal.pick",
		buttonLabel: sealConfirmButtonLabel,
		buttonStyle: ButtonStyle.Primary,
	},
	remove: {
		heading: unsealPickHeading,
		body: unsealPickBody,
		placeholder: unsealPickPlaceholder,
		action: "seal.unpick",
		buttonLabel: unsealConfirmButtonLabel,
		buttonStyle: ButtonStyle.Danger,
	},
}

export function buildSealPickerCard(opts: {
	variants: LyricVariant[]
	mode: SealMode
}): CardPayload {
	const copy = COPY[opts.mode]
	const options = opts.variants.slice(0, MAX_OPTIONS).map((v) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(truncate(sealVariantLabel(v.song)))
			.setDescription(
				truncate(
					sealVariantDescription({
						artist: v.artist,
						format: v.format,
						score: v.score,
						submitterName: v.submitterName,
					})
				)
			)
			.setValue(String(v.id))
	)

	const menu = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId(copy.action, []))
		.setPlaceholder(copy.placeholder)
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(options)

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(copy.heading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(copy.body))
		.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu))

	return { components: [container], flags: FLAGS }
}

export function buildSealConfirmCard(opts: {
	variant: LyricVariant
	mode: SealMode
}): CardPayload {
	const copy = COPY[opts.mode]
	const { variant } = opts
	const button = new ButtonBuilder()
		.setStyle(copy.buttonStyle)
		.setCustomId(encodeCustomId(copy.action, [String(variant.id)]))
		.setLabel(copy.buttonLabel)

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(copy.heading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(`**${variant.song}**`))
		.addTextDisplayComponents(
			text(
				sealVariantDescription({
					artist: variant.artist,
					format: variant.format,
					score: variant.score,
					submitterName: variant.submitterName,
				})
			)
		)
		.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button))

	return { components: [container], flags: FLAGS }
}

export function buildSealResultCard(lines: string[]): CardPayload {
	const container = new ContainerBuilder().setAccentColor(PALETTE.betterLyricsRed)
	for (const line of lines) {
		container.addTextDisplayComponents(text(line))
	}
	return { components: [container], flags: FLAGS }
}
