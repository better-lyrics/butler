import { PALETTE } from "@/config"
import {
	avatarApproveButtonLabel,
	avatarApprovedBy,
	avatarConfirmApproveBody,
	avatarConfirmApproveButtonLabel,
	avatarDetails,
	avatarKicker,
	avatarRejectButtonLabel,
	avatarRejectNoteLine,
	avatarRejectedBy,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	FileBuilder,
	MessageFlags,
	type MessageMentionOptions,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"
import { buildConfirmCard } from "./queue-card"

const FLAGS = MessageFlags.IsComponentsV2
const NO_MENTIONS: MessageMentionOptions = { parse: [] }

export type AvatarOutcome =
	| { kind: "approved"; actorId: string }
	| { kind: "rejected"; actorId: string; note: string | null }

export interface AvatarCardInput {
	suggestionId: string
	proposedId: string
	label: string
	proposerId: string
	imageName: string
}

export interface AvatarCardPayload extends CardPayload {
	files: AttachmentBuilder[]
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

function outcomeLine(outcome: AvatarOutcome): string {
	return outcome.kind === "approved"
		? avatarApprovedBy(outcome.actorId)
		: avatarRejectedBy(outcome.actorId)
}

export function buildAvatarCard(
	input: AvatarCardInput,
	image: Buffer | null,
	outcome: AvatarOutcome | null = null
): AvatarCardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(avatarKicker))
		.addTextDisplayComponents(
			text(
				avatarDetails({
					label: input.label,
					proposedId: input.proposedId,
					proposerId: input.proposerId,
				})
			)
		)

	const files: AttachmentBuilder[] = []
	if (image) {
		files.push(new AttachmentBuilder(image, { name: input.imageName }))
		container.addFileComponents(new FileBuilder().setURL(`attachment://${input.imageName}`))
	}

	if (outcome) {
		container.addTextDisplayComponents(text(outcomeLine(outcome)))
		if (outcome.kind === "rejected" && outcome.note) {
			container.addTextDisplayComponents(text(avatarRejectNoteLine(outcome.note)))
		}
	} else {
		container.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Success)
					.setCustomId(encodeCustomId("avatar.approve", [input.suggestionId]))
					.setLabel(avatarApproveButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Danger)
					.setCustomId(encodeCustomId("avatar.reject", [input.suggestionId]))
					.setLabel(avatarRejectButtonLabel)
			)
		)
	}

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS, files }
}

export function buildAvatarApproveConfirmCard(suggestionId: string): CardPayload {
	return buildConfirmCard({
		body: avatarConfirmApproveBody,
		confirmLabel: avatarConfirmApproveButtonLabel,
		confirmId: encodeCustomId("avatar.approve.confirm", [suggestionId]),
		cancelId: encodeCustomId("avatar.approve.cancel", []),
	})
}

export function avatarCardEdit<T extends CardPayload>(payload: T): T & { attachments: never[] } {
	return { ...payload, attachments: [] }
}
