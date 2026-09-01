import {
	migrateAlreadyActive,
	migrateBlacklisted,
	migrateCooldown,
	migrateGenericError,
	migrateLinkingDisabled,
} from "@/copy/strings"
import { buildMigrateNotLinkedCard, buildMigrateStartCard } from "@/discord/components/migrate-card"
import type { Cooldown } from "@/discord/migrate/cooldown"
import type { MigrationStartResult } from "@/unison/client"
import { MessageFlags, SlashCommandBuilder } from "discord.js"

export const migrateCommand = new SlashCommandBuilder()
	.setName("migrate")
	.setDescription("Move your Better Lyrics history from a lost key onto a new one")

/** Minimal shape of the /migrate command interaction. */
export interface MigrateCommandInteraction {
	user: { id: string }
	reply(payload: unknown): Promise<unknown>
}

export interface MigrateCommandDeps {
	startMigration(discordId: string): Promise<MigrationStartResult>
	cooldown: Cooldown
	linkPageUrl: string
}

function ephemeralText(content: string) {
	return { content, flags: MessageFlags.Ephemeral }
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
		case "started":
			await interaction.reply(
				ephemeralCard(
					buildMigrateStartCard({
						sessionId: result.sessionId,
						oldKeyId: result.oldKeyId,
					})
				)
			)
			return
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
