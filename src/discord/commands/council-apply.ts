import { buildConnectCard } from "@/discord/components/connect-card"
import { buildExamIntroCard } from "@/discord/components/exam-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type { ExamAttemptState, ExamStartResult } from "@/unison/client"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const COUNCIL_APPLY_GUILD_ONLY = "This command can only be used in a server."

export const COUNCIL_APPLY_INELIGIBLE =
	"Council applications open once you've climbed high enough. Keep climbing and come back."

export const COUNCIL_APPLY_ALREADY_COUNCIL = "You are already on the Better Lyrics Council."

export const COUNCIL_APPLY_ERROR = "Something went wrong. Give it another try in a moment."

export const COUNCIL_APPLY_ALREADY = "You have already sat the Council exam."

// Intentionally vague: never reveal pass, fail, or pending. Same line for every state.
export function councilApplyAlreadyAttempted(_state: ExamAttemptState): string {
	return COUNCIL_APPLY_ALREADY
}

export const councilApplyCommand = new SlashCommandBuilder()
	.setName("council-apply")
	.setDescription("Apply to join the Better Lyrics Council")

/** Minimal shape of the /council-apply chat command interaction. */
export interface CouncilApplyInteraction {
	guildId: string | null
	user: { id: string }
	memberPermissions: { has(flag: bigint): boolean } | null
	reply(payload: unknown): Promise<unknown>
}

export interface CouncilApplyDeps {
	isEligible(discordId: string): Promise<boolean>
	isCouncilMember(discordId: string): Promise<boolean>
	resolveKeyId(discordId: string): Promise<string | null>
	startExam(keyId: string, discordId: string): Promise<ExamStartResult>
	linkPageUrl: string
	guideUrl: string
}

export async function handleCouncilApply(
	interaction: CouncilApplyInteraction,
	deps: CouncilApplyDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(COUNCIL_APPLY_GUILD_ONLY))
		return
	}

	const discordId = interaction.user.id
	// Admins bypass the gates so they can always walk the flow to test it.
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false

	if (!isAdmin) {
		if (await deps.isCouncilMember(discordId)) {
			await interaction.reply(ephemeralText(COUNCIL_APPLY_ALREADY_COUNCIL))
			return
		}
		if (!(await deps.isEligible(discordId))) {
			await interaction.reply(ephemeralText(COUNCIL_APPLY_INELIGIBLE))
			return
		}
	}

	const keyId = await deps.resolveKeyId(discordId)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}

	const result = await deps.startExam(keyId, discordId)
	if (result.status === "eligible") {
		await interaction.reply(
			ephemeralCard(
				buildExamIntroCard({
					examUrl: result.examUrl,
					guideUrl: deps.guideUrl,
					expiresAt: result.expiresAt,
				})
			)
		)
		return
	}
	if (result.status === "already_attempted") {
		await interaction.reply(ephemeralText(councilApplyAlreadyAttempted(result.attempt.state)))
		return
	}

	await interaction.reply(ephemeralText(COUNCIL_APPLY_ERROR))
}
