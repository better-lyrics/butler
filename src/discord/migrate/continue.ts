import {
	migrateAlreadyCommitted,
	migrateExpired,
	migrateFailed,
	migrateGenericError,
	migrateNotYet,
	migrateSessionNotFound,
} from "@/copy/strings"
import { buildMigratePreviewCard } from "@/discord/components/migrate-card"
import { decodeCustomId } from "@/interactions/custom-id"
import type { MigrationStatusResult, NicknameChoice } from "@/unison/client"
import { canToggleNickname, parseNicknameChoice } from "./nickname"
import { ephemeralText } from "./reply"

/** Minimal shape of a migrate button interaction (continue / nickname toggle). */
export interface MigrateComponentInteraction {
	customId: string
	update(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

export interface MigratePreviewDeps {
	getMigrationStatus(sessionId: string): Promise<MigrationStatusResult>
}

export async function handleMigrateContinue(
	interaction: MigrateComponentInteraction,
	deps: MigratePreviewDeps
): Promise<void> {
	const decoded = decodeCustomId(interaction.customId)
	const sessionId = decoded?.args[0]
	if (!sessionId) {
		await interaction.reply(ephemeralText(migrateSessionNotFound))
		return
	}
	const requested = parseNicknameChoice(decoded?.args[1])

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
	switch (data.status) {
		case "ready": {
			const choice: NicknameChoice = canToggleNickname(data) ? requested : "old"
			await interaction.update(buildMigratePreviewCard({ sessionId, status: data, choice }))
			return
		}
		case "awaiting_new_key":
			await interaction.reply(ephemeralText(migrateNotYet))
			return
		case "committed":
			await interaction.reply(ephemeralText(migrateAlreadyCommitted))
			return
		case "expired":
			await interaction.reply(ephemeralText(migrateExpired))
			return
		case "failed":
			await interaction.reply(ephemeralText(migrateFailed))
			return
		default:
			await interaction.reply(ephemeralText(migrateGenericError))
			return
	}
}
