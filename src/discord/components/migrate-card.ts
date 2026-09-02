import { PALETTE } from "@/config"
import {
	migrateConfirmButtonLabel,
	migrateContinueButtonLabel,
	migrateKeyLine,
	migrateLinkButtonLabel,
	migrateMovingAccount,
	migrateNicknameChoosing,
	migrateNicknameKept,
	migrateNicknameToggleLabel,
	migrateNotLinkedBody,
	migrateNotLinkedHeading,
	migratePreviewBody,
	migratePreviewCollisions,
	migratePreviewCounts,
	migratePreviewHeading,
	migratePreviewWarning,
	migrateStartBody,
	migrateStartHeading,
	migrateSuccessBody,
	migrateSuccessHeading,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { MigrationMoved, MigrationStatus, NicknameChoice } from "@/unison/client"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	TextDisplayBuilder,
} from "discord.js"
import { migrateShortId } from "../migrate/confirm-token"
import { canToggleNickname } from "../migrate/nickname"

export interface MigrateCardPayload {
	components: ContainerBuilder[]
	flags: number
}

const FLAGS = MessageFlags.IsComponentsV2

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

export function buildMigrateStartCard(opts: {
	sessionId: string
	oldKeyId: string
}): MigrateCardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(migrateStartHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(migrateStartBody))
		.addTextDisplayComponents(text(migrateMovingAccount(migrateShortId(opts.oldKeyId))))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Primary)
					.setCustomId(encodeCustomId("migrate.continue", [opts.sessionId]))
					.setLabel(migrateContinueButtonLabel)
			)
		)
	return { components: [container], flags: FLAGS }
}

export function buildMigratePreviewCard(opts: {
	sessionId: string
	status: MigrationStatus
	choice: NicknameChoice
}): MigrateCardPayload {
	const { sessionId, status, choice } = opts
	const counts = status.counts ?? {
		submissions: 0,
		votes: 0,
		reports: 0,
		fulfillments: 0,
		collisions: 0,
	}
	const oldShort = migrateShortId(status.oldKeyId)
	const newShort = status.newKeyId ? migrateShortId(status.newKeyId) : "?"
	const canToggle = canToggleNickname(status)

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(migratePreviewHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(migratePreviewBody(status.newDisplayName)))
		.addTextDisplayComponents(text(migratePreviewCounts(counts)))

	const collisions = migratePreviewCollisions(counts.collisions)
	if (collisions) {
		container.addTextDisplayComponents(text(collisions))
	}

	container.addTextDisplayComponents(
		text(migrateKeyLine(status.oldDisplayName, oldShort, status.newDisplayName, newShort))
	)

	if (canToggle) {
		const current = choice === "old" ? status.oldNickname : status.newNickname
		container.addTextDisplayComponents(text(migrateNicknameChoosing(current ?? "")))
	} else {
		container.addTextDisplayComponents(
			text(migrateNicknameKept(status.oldNickname ?? status.newNickname))
		)
	}

	container
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(migratePreviewWarning))

	const row = new ActionRowBuilder<ButtonBuilder>()
	if (canToggle) {
		const other: NicknameChoice = choice === "old" ? "new" : "old"
		const otherName = other === "old" ? status.oldNickname : status.newNickname
		row.addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Secondary)
				.setCustomId(encodeCustomId("migrate.nick", [sessionId, other]))
				.setLabel(migrateNicknameToggleLabel(otherName ?? ""))
		)
	}
	row.addComponents(
		new ButtonBuilder()
			.setStyle(ButtonStyle.Danger)
			.setCustomId(encodeCustomId("migrate.confirm", [sessionId, choice]))
			.setLabel(migrateConfirmButtonLabel)
	)
	container.addActionRowComponents(row)

	return { components: [container], flags: FLAGS }
}

export function buildMigrateSuccessCard(opts: {
	moved: MigrationMoved
	newKeyId: string
}): MigrateCardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(migrateSuccessHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(migrateSuccessBody(opts.moved)))
		.addTextDisplayComponents(text(`Now on key \`${migrateShortId(opts.newKeyId)}\`.`))
	return { components: [container], flags: FLAGS }
}

export function buildMigrateNotLinkedCard(opts: { linkPageUrl: string }): MigrateCardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(migrateNotLinkedHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(migrateNotLinkedBody))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Link)
					.setURL(opts.linkPageUrl)
					.setLabel(migrateLinkButtonLabel)
			)
		)
	return { components: [container], flags: FLAGS }
}
