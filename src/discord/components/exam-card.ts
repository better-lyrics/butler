import { PALETTE } from "@/config"
import {
	councilWelcomeMessage,
	examApplicantFullMarks,
	examApplicantGone,
	examApplicantHeading,
	examApplicantMisses,
	examApplicantScore,
	examApplicantVerdict,
	examApproveButtonLabel,
	examApproveConfirm,
	examApprovedLine,
	examApprovedNoRole,
	examApprovedRoleFailed,
	examApprovedRoleGranted,
	examBeginButtonLabel,
	examCancelButtonLabel,
	examConfirmApproveButtonLabel,
	examConfirmRejectButtonLabel,
	examGuideButtonLabel,
	examIntroCatch,
	examIntroExam,
	examIntroExpiry,
	examIntroHeading,
	examIntroWarning,
	examIntroWhat,
	examRejectButtonLabel,
	examRejectConfirm,
	examRejectedLine,
} from "@/copy/strings"
import type { CouncilRoleOutcome } from "@/discord/commands/council"
import { encodeCustomId } from "@/interactions/custom-id"
import type { ExamApplicant } from "@/unison/client"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	type MessageMentionOptions,
	SeparatorBuilder,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"

const FLAGS = MessageFlags.IsComponentsV2

const NO_MENTIONS: MessageMentionOptions = { parse: [] }

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

export function buildExamIntroCard(opts: {
	examUrl: string
	guideUrl: string
	expiresAt: number
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(examIntroHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(
			text(examIntroWhat),
			text(examIntroCatch),
			text(examIntroExam),
			text(examIntroWarning),
			text(examIntroExpiry(opts.expiresAt))
		)
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Link)
					.setURL(opts.guideUrl)
					.setLabel(examGuideButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Link)
					.setURL(opts.examUrl)
					.setLabel(examBeginButtonLabel)
			)
		)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildApplicantCard(applicant: ExamApplicant): CardPayload {
	const belowCutoff = applicant.score < applicant.cutoff
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(examApplicantHeading(applicant.displayName)))
		.addTextDisplayComponents(
			text(
				examApplicantScore({
					score: applicant.score,
					maxScore: applicant.maxScore,
					cutoff: applicant.cutoff,
					belowCutoff,
				})
			)
		)
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(
			text(
				examApplicantVerdict({
					score: applicant.score,
					maxScore: applicant.maxScore,
					cutoff: applicant.cutoff,
					breakdown: applicant.breakdown,
				})
			)
		)

	const misses = examApplicantMisses(applicant.breakdown)
	if (misses) {
		container.addTextDisplayComponents(text(misses))
	}
	const fullMarks = examApplicantFullMarks(applicant.breakdown)
	if (fullMarks) {
		container.addTextDisplayComponents(text(fullMarks))
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Success)
				.setCustomId(encodeCustomId("exam.approve", [applicant.applicantId, applicant.discordId]))
				.setLabel(examApproveButtonLabel),
			new ButtonBuilder()
				.setStyle(ButtonStyle.Danger)
				.setCustomId(encodeCustomId("exam.reject", [applicant.applicantId, applicant.discordId]))
				.setLabel(examRejectButtonLabel)
		)
	)

	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

function roleLine(role: CouncilRoleOutcome): string {
	if (role === "not_configured") return examApprovedNoRole
	if (role === "failed") return examApprovedRoleFailed
	return examApprovedRoleGranted
}

export function buildApplicantApprovedCard(opts: {
	discordId: string
	adminId: string
	role: CouncilRoleOutcome
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(
			text(examApprovedLine({ discordId: opts.discordId, adminId: opts.adminId }))
		)
		.addTextDisplayComponents(text(roleLine(opts.role)))
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildApplicantRejectedCard(opts: {
	discordId: string
	adminId: string
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(
			text(examRejectedLine({ discordId: opts.discordId, adminId: opts.adminId }))
		)
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildApplicantApproveConfirmCard(opts: {
	applicantId: string
	discordId: string
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(examApproveConfirm(opts.discordId)))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Success)
					.setCustomId(encodeCustomId("exam.approve.go", [opts.applicantId, opts.discordId]))
					.setLabel(examConfirmApproveButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Secondary)
					.setCustomId(encodeCustomId("exam.cancel", [opts.applicantId]))
					.setLabel(examCancelButtonLabel)
			)
		)
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildApplicantRejectConfirmCard(opts: {
	applicantId: string
	discordId: string
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(examRejectConfirm(opts.discordId)))
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Danger)
					.setCustomId(encodeCustomId("exam.reject.go", [opts.applicantId, opts.discordId]))
					.setLabel(examConfirmRejectButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Secondary)
					.setCustomId(encodeCustomId("exam.cancel", [opts.applicantId]))
					.setLabel(examCancelButtonLabel)
			)
		)
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildApplicantGoneCard(): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(examApplicantGone))
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}

export function buildCouncilWelcomeCard(opts: {
	gettingStartedUrl: string
	gifUrl: string
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(councilWelcomeMessage(opts.gettingStartedUrl)))
		.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(
				new MediaGalleryItemBuilder().setURL(opts.gifUrl).setDescription("Breaking Bad, hell yeah")
			)
		)
	return { components: [container], flags: FLAGS, allowedMentions: NO_MENTIONS }
}
