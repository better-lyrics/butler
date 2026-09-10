import {
	configGuildOnly,
	digestDisabled,
	digestEmpty,
	digestNoChannel,
	digestNoPermission,
	digestPosted,
	queueError,
} from "@/copy/strings"
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export type DigestResult = "posted" | "empty" | "no_channel" | "disabled" | "skipped"

export const digestCommand = new SlashCommandBuilder()
	.setName("digest")
	.setDescription("Post a fresh review board now instead of waiting for the weekly run")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

/** Minimal shape of the /digest command interaction. */
export interface DigestInteraction {
	guildId: string | null
	memberPermissions: { has(flag: bigint): boolean } | null
	deferReply(options: unknown): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

export interface DigestDeps {
	runDigest(): Promise<DigestResult>
}

const RESULT_COPY: Record<DigestResult, string> = {
	posted: digestPosted,
	empty: digestEmpty,
	no_channel: digestNoChannel,
	disabled: digestDisabled,
	skipped: queueError,
}

export async function handleDigest(
	interaction: DigestInteraction,
	deps: DigestDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply({ content: configGuildOnly, flags: MessageFlags.Ephemeral })
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({ content: digestNoPermission, flags: MessageFlags.Ephemeral })
		return
	}

	// Posting the board sends a message per lyric, which can exceed the 3 second reply window.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })

	const result = await deps.runDigest()
	await interaction.editReply({ content: RESULT_COPY[result] })
}
