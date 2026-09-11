import {
	examApplicantsEmpty,
	examApplicantsHeading,
	examApplicantsMore,
	examApplicantsSubheading,
} from "@/copy/strings"
import type { CouncilRoleOutcome } from "@/discord/commands/council"
import {
	buildApplicantApproveConfirmCard,
	buildApplicantApprovedCard,
	buildApplicantCard,
	buildApplicantGoneCard,
	buildApplicantRejectConfirmCard,
	buildApplicantRejectedCard,
} from "@/discord/components/exam-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type {
	CouncilAddResult,
	ExamApplicantsResult,
	ExamDecision,
	ExamDecisionResult,
} from "@/unison/client"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export const COUNCIL_APPLICANTS_GUILD_ONLY = "This command can only be used in a server."

export const COUNCIL_APPLICANTS_NO_PERMISSION = "You need the Manage Server permission to run this."

export const COUNCIL_APPLICANTS_ERROR = "Something went wrong. Give it another try in a moment."

export const COUNCIL_APPLICANT_DECISION_ERROR =
	"Could not record that decision. Give it another try in a moment."

/** How many applicant cards one review reply posts before asking the admin to decide and re-run. */
export const APPLICANT_BOARD_LIMIT = 10

export const councilApplicantsCommand = new SlashCommandBuilder()
	.setName("council-applicants")
	.setDescription("Review Council exam applicants")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addBooleanOption((o) =>
		o
			.setName("show-near-misses")
			.setDescription("Also show applicants who scored just below the cutoff")
	)

/** Minimal shape of the /council-applicants chat command interaction. */
export interface CouncilApplicantsInteraction {
	guildId: string | null
	memberPermissions: { has(flag: bigint): boolean } | null
	options: { getBoolean(name: string): boolean | null }
	reply(payload: unknown): Promise<unknown>
	followUp(payload: unknown): Promise<unknown>
}

export interface CouncilApplicantsDeps {
	getExamApplicants(includeBelowCutoff: boolean): Promise<ExamApplicantsResult>
}

export async function handleCouncilApplicants(
	interaction: CouncilApplicantsInteraction,
	deps: CouncilApplicantsDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_GUILD_ONLY))
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}

	const showNearMisses = interaction.options.getBoolean("show-near-misses") ?? false
	const result = await deps.getExamApplicants(showNearMisses)
	if (result.status !== "ok") {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_ERROR))
		return
	}
	if (result.applicants.length === 0) {
		await interaction.reply(ephemeralText(examApplicantsEmpty))
		return
	}

	const shown = result.applicants.slice(0, APPLICANT_BOARD_LIMIT)
	const overflow = result.applicants.length - shown.length
	const header = [examApplicantsHeading, examApplicantsSubheading(result.applicants.length)]
	if (overflow > 0) header.push(examApplicantsMore(overflow))

	await interaction.reply(ephemeralText(header.join("\n")))
	for (const applicant of shown) {
		await interaction.followUp(ephemeralCard(buildApplicantCard(applicant)))
	}
}

/** Minimal shape of an approve/reject button interaction on an applicant card. */
export interface ApplicantDecisionInteraction {
	user: { id: string }
	memberPermissions: { has(flag: bigint): boolean } | null
	update(payload: unknown): Promise<unknown>
	reply(payload: unknown): Promise<unknown>
}

export interface ApplicantDecisionArgs {
	applicantId: string
	discordId: string
}

export interface ApplicantApproveDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	addCouncilMember(keyId: string): Promise<CouncilAddResult>
	grantCouncilRole(discordId: string): Promise<CouncilRoleOutcome>
	decideExamApplicant(
		applicantId: string,
		decision: ExamDecision,
		deciderDiscordId: string
	): Promise<ExamDecisionResult>
	welcomeMember(discordId: string): Promise<void>
}

export interface ApplicantRejectDeps {
	decideExamApplicant(
		applicantId: string,
		decision: ExamDecision,
		deciderDiscordId: string
	): Promise<ExamDecisionResult>
}

export async function handleCouncilApplicantApprove(
	interaction: ApplicantDecisionInteraction,
	args: ApplicantDecisionArgs,
	deps: ApplicantApproveDeps
): Promise<void> {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}

	const keyId = await deps.resolveKeyId(args.discordId)
	if (!keyId) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANT_DECISION_ERROR))
		return
	}

	const decision = await deps.decideExamApplicant(args.applicantId, "approve", interaction.user.id)
	if (decision.status === "error") {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANT_DECISION_ERROR))
		return
	}
	if (decision.status === "not_found") {
		await interaction.update(buildApplicantGoneCard())
		return
	}

	const add = await deps.addCouncilMember(keyId)
	if (add.status !== "added") {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANT_DECISION_ERROR))
		return
	}

	const role = await deps.grantCouncilRole(args.discordId)
	await deps.welcomeMember(args.discordId)

	await interaction.update(
		buildApplicantApprovedCard({ discordId: args.discordId, adminId: interaction.user.id, role })
	)
}

export async function handleCouncilApplicantReject(
	interaction: ApplicantDecisionInteraction,
	args: ApplicantDecisionArgs,
	deps: ApplicantRejectDeps
): Promise<void> {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}

	const decision = await deps.decideExamApplicant(args.applicantId, "reject", interaction.user.id)
	if (decision.status === "error") {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANT_DECISION_ERROR))
		return
	}

	await interaction.update(
		buildApplicantRejectedCard({ discordId: args.discordId, adminId: interaction.user.id })
	)
}

export async function handleCouncilApplicantApprovePrompt(
	interaction: ApplicantDecisionInteraction,
	args: ApplicantDecisionArgs
): Promise<void> {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}
	await interaction.update(
		buildApplicantApproveConfirmCard({ applicantId: args.applicantId, discordId: args.discordId })
	)
}

export async function handleCouncilApplicantRejectPrompt(
	interaction: ApplicantDecisionInteraction,
	args: ApplicantDecisionArgs
): Promise<void> {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}
	await interaction.update(
		buildApplicantRejectConfirmCard({ applicantId: args.applicantId, discordId: args.discordId })
	)
}

export interface ApplicantCancelDeps {
	getExamApplicants(includeBelowCutoff: boolean): Promise<ExamApplicantsResult>
}

export async function handleCouncilApplicantCancel(
	interaction: ApplicantDecisionInteraction,
	args: { applicantId: string },
	deps: ApplicantCancelDeps
): Promise<void> {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}
	const result = await deps.getExamApplicants(true)
	if (result.status === "ok") {
		const applicant = result.applicants.find((a) => a.applicantId === args.applicantId)
		if (applicant) {
			await interaction.update(buildApplicantCard(applicant))
			return
		}
	}
	await interaction.update(buildApplicantGoneCard())
}
