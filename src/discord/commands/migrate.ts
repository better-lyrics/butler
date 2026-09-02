import { MIGRATE_EXPIRY_EDIT_LEAD_MS, MIGRATE_SESSION_TTL_MS } from "@/config"
import {
	migrateAlreadyActive,
	migrateBlacklisted,
	migrateCooldown,
	migrateGenericError,
	migrateLinkingDisabled,
} from "@/copy/strings"
import {
	buildMigrateExpiredCard,
	buildMigrateNotLinkedCard,
	buildMigrateStartCard,
} from "@/discord/components/migrate-card"
import type { Cooldown } from "@/discord/migrate/cooldown"
import { ephemeralText } from "@/discord/migrate/reply"
import type { MigrationStartResult, MigrationStatusResult } from "@/unison/client"
import { MessageFlags, SlashCommandBuilder } from "discord.js"

export const migrateCommand = new SlashCommandBuilder()
	.setName("migrate")
	.setDescription("Move your Better Lyrics history from a lost key onto a new one")

/** Minimal shape of the /migrate command interaction. */
export interface MigrateCommandInteraction {
	user: { id: string }
	reply(payload: unknown): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export interface MigrateCommandDeps {
	startMigration(discordId: string): Promise<MigrationStartResult>
	getMigrationStatus(sessionId: string): Promise<MigrationStatusResult>
	cooldown: Cooldown
	linkPageUrl: string
	now(): number
	schedule(callback: () => void, delayMs: number): void
}

export async function runMigrateExpirySwap(
	interaction: Pick<MigrateCommandInteraction, "editReply">,
	getMigrationStatus: (sessionId: string) => Promise<MigrationStatusResult>,
	sessionId: string
): Promise<void> {
	const status = await getMigrationStatus(sessionId)
	if (status.status !== "ok" || status.data.status !== "awaiting_new_key") {
		return
	}
	await interaction.editReply(buildMigrateExpiredCard())
}

function ephemeralCard(card: { components: unknown[]; flags: number }) {
	return { components: card.components, flags: card.flags | MessageFlags.Ephemeral }
}

export async function handleMigrate(
	interaction: MigrateCommandInteraction,
	deps: MigrateCommandDeps
): Promise<void> {
	const gate = deps.cooldown.check(interaction.user.id)
	if (!gate.allowed) {
		await interaction.reply(ephemeralText(migrateCooldown(gate.retryAfterMs)))
		return
	}

	const result = await deps.startMigration(interaction.user.id)
	switch (result.status) {
		case "started": {
			const expiresAt = Math.floor((deps.now() + MIGRATE_SESSION_TTL_MS) / 1000)
			await interaction.reply(
				ephemeralCard(
					buildMigrateStartCard({
						sessionId: result.sessionId,
						oldKeyId: result.oldKeyId,
						expiresAt,
					})
				)
			)
			const { sessionId } = result
			deps.schedule(() => {
				runMigrateExpirySwap(interaction, deps.getMigrationStatus, sessionId).catch((err) =>
					console.error("migrate expiry swap failed", err)
				)
			}, MIGRATE_SESSION_TTL_MS - MIGRATE_EXPIRY_EDIT_LEAD_MS)
			return
		}
		case "not_linked":
			await interaction.reply(
				ephemeralCard(buildMigrateNotLinkedCard({ linkPageUrl: deps.linkPageUrl }))
			)
			return
		case "already_active":
			await interaction.reply(ephemeralText(migrateAlreadyActive))
			return
		case "blacklisted":
			await interaction.reply(ephemeralText(migrateBlacklisted))
			return
		case "linking_disabled":
			await interaction.reply(ephemeralText(migrateLinkingDisabled))
			return
		default:
			await interaction.reply(ephemeralText(migrateGenericError))
			return
	}
}
