import {
	migrateAlreadyCommitted,
	migrateConfirmInputLabel,
	migrateConfirmModalTitle,
	migrateExpired,
	migrateGenericError,
	migrateNotOwner,
	migrateNotReady,
	migrateSessionNotFound,
	migrateTokenMismatch,
} from "@/copy/strings"
import { buildMigrateSuccessCard } from "@/discord/components/migrate-card"
import { decodeCustomId, encodeCustomId } from "@/interactions/custom-id"
import type { MigrationStatusResult, NicknameChoice } from "@/unison/client"
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js"
import { matchesConfirmToken, migrateShortId } from "./confirm-token"
import { canToggleNickname, parseNicknameChoice } from "./nickname"

const SHORT_ID_INPUT = "shortId"

/** Minimal shape of the confirm button interaction (opens the modal). */
export interface MigrateConfirmInteraction {
	customId: string
	showModal(modal: ModalBuilder): Promise<unknown>
}

/** Minimal shape of the confirm modal submit. */
export interface MigrateModalInteraction {
	customId: string
	user: { id: string }
	fields: { getTextInputValue(id: string): string }
	reply(payload: unknown): Promise<unknown>
}

export interface MigrateCommitDeps {
	getMigrationStatus(sessionId: string): Promise<MigrationStatusResult>
	commitMigration(
		sessionId: string,
		discordId: string,
		keepNickname: NicknameChoice
	): Promise<import("@/unison/client").MigrationCommitResult>
}

function ephemeralText(content: string) {
	return { content, flags: MessageFlags.Ephemeral }
}

export async function handleMigrateConfirm(interaction: MigrateConfirmInteraction): Promise<void> {
	const decoded = decodeCustomId(interaction.customId)
	const sessionId = decoded?.args[0] ?? ""
	const choice = parseNicknameChoice(decoded?.args[1])

	const modal = new ModalBuilder()
		.setCustomId(encodeCustomId("migrate.commit", [sessionId, choice]))
		.setTitle(migrateConfirmModalTitle)
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(SHORT_ID_INPUT)
					.setLabel(migrateConfirmInputLabel)
					.setStyle(TextInputStyle.Short)
					.setMinLength(6)
					.setMaxLength(6)
					.setRequired(true)
			)
		)
	await interaction.showModal(modal)
}

export async function handleMigrateCommit(
	interaction: MigrateModalInteraction,
	deps: MigrateCommitDeps
): Promise<void> {
	const decoded = decodeCustomId(interaction.customId)
	const sessionId = decoded?.args[0]
	if (!sessionId) {
		await interaction.reply(ephemeralText(migrateSessionNotFound))
		return
	}
	const requested = parseNicknameChoice(decoded?.args[1])
	const typed = interaction.fields.getTextInputValue(SHORT_ID_INPUT)

	const status = await deps.getMigrationStatus(sessionId)
	if (status.status === "not_found") {
		await interaction.reply(ephemeralText(migrateSessionNotFound))
		return
	}
	if (status.status !== "ok") {
		await interaction.reply(ephemeralText(migrateGenericError))
		return
	}

	const { data } = status
	if (data.status === "committed") {
		await interaction.reply(ephemeralText(migrateAlreadyCommitted))
		return
	}
	if (data.status === "expired") {
		await interaction.reply(ephemeralText(migrateExpired))
		return
	}
	if (data.status !== "ready" || !data.newKeyId) {
		await interaction.reply(ephemeralText(migrateNotReady))
		return
	}

	if (!matchesConfirmToken(typed, data.newKeyId)) {
		await interaction.reply(ephemeralText(migrateTokenMismatch(migrateShortId(data.newKeyId))))
		return
	}

	const choice: NicknameChoice = canToggleNickname(data) ? requested : "old"
	const result = await deps.commitMigration(sessionId, interaction.user.id, choice)
	switch (result.status) {
		case "committed":
			await interaction.reply({
				...buildMigrateSuccessCard({ moved: result.moved, newKeyId: data.newKeyId }),
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			})
			return
		case "not_owner":
			await interaction.reply(ephemeralText(migrateNotOwner))
			return
		case "expired":
			await interaction.reply(ephemeralText(migrateExpired))
			return
		case "already_committed":
			await interaction.reply(ephemeralText(migrateAlreadyCommitted))
			return
		case "not_ready":
			await interaction.reply(ephemeralText(migrateNotReady))
			return
		default:
			await interaction.reply(ephemeralText(migrateGenericError))
			return
	}
}
