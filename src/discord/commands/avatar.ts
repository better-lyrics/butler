import { imageFileName, normalizeMime } from "@/avatars/download"
import { type ProposalReason, buildProposal } from "@/avatars/propose"
import {
	avatarAlreadyDecided,
	avatarApproveCancelled,
	avatarApprovedBy,
	avatarError,
	avatarNameTaken,
	avatarNotFound,
	avatarProposeAck,
	avatarProposeBadName,
	avatarProposeBadType,
	avatarProposeDownloadFailed,
	avatarProposeNoImage,
	avatarProposeNotConfigured,
	avatarProposeNotEligible,
	avatarProposeTooBig,
	avatarProposeWrongChannel,
	avatarRejectModalTitle,
} from "@/copy/strings"
import type { CreateSuggestionInput } from "@/db/avatar-suggestions"
import type { AvatarSuggestion } from "@/db/avatar-suggestions"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { encodeCustomId } from "@/interactions/custom-id"
import type { CreateAvatarPresetInput, CreateAvatarPresetResult } from "@/unison/client"
import { type ModalBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import {
	type AvatarCardPayload,
	type AvatarOutcome,
	avatarCardEdit,
	buildAvatarApproveConfirmCard,
	buildAvatarCard,
} from "../components/avatar-card"
import { buildQueueResultCard } from "../components/queue-card"
import { buildRejectNoteModal, readRejectNote } from "../components/reject-note-modal"

export const avatarCommand = new SlashCommandBuilder()
	.setName("avatar")
	.setDescription("Suggest a new profile picture for the catalogue")
	.setDefaultMemberPermissions(null)
	.addAttachmentOption((option) =>
		option
			.setName("image")
			.setDescription("The avatar image (JPEG, PNG, GIF, or WebP)")
			.setRequired(true)
	)
	.addStringOption((option) =>
		option
			.setName("name")
			.setDescription("A name for the avatar (defaults to the file name)")
			.setRequired(false)
	)

interface ProposeAttachment {
	url: string
	name: string
	contentType: string | null
	size: number
}

export interface AvatarProposeInteraction {
	channelId: string | null
	user: { id: string }
	options: {
		getAttachment(name: string): ProposeAttachment | null
		getString(name: string): string | null
	}
	reply(payload: unknown): Promise<unknown>
}

export interface AvatarProposeDeps {
	guildId: string
	suggestChannelId: string | null
	isEligible: (discordId: string) => Promise<boolean>
	resolveKeyId: (discordId: string) => Promise<string | null>
	fetchBytes: (url: string) => Promise<Buffer | null>
	newId: () => string
	createSuggestion: (input: CreateSuggestionInput) => Promise<{ id: string }>
	postCard: (payload: AvatarCardPayload) => Promise<{ channelId: string; messageId: string } | null>
	setCard: (suggestionId: string, channelId: string, messageId: string) => Promise<void>
}

function proposeReasonCopy(reason: ProposalReason, suggestChannelId: string): string {
	switch (reason) {
		case "wrong_channel":
			return avatarProposeWrongChannel(suggestChannelId)
		case "not_eligible":
			return avatarProposeNotEligible
		case "no_image":
			return avatarProposeNoImage
		case "bad_type":
			return avatarProposeBadType
		case "too_big":
			return avatarProposeTooBig
		case "bad_name":
			return avatarProposeBadName
	}
}

export async function handleAvatarPropose(
	interaction: AvatarProposeInteraction,
	deps: AvatarProposeDeps
): Promise<void> {
	if (!deps.suggestChannelId) {
		await interaction.reply(ephemeralText(avatarProposeNotConfigured))
		return
	}

	const attachment = interaction.options.getAttachment("image")
	const eligible = await deps.isEligible(interaction.user.id)
	const proposal = buildProposal({
		channelId: interaction.channelId ?? "",
		suggestChannelId: deps.suggestChannelId,
		memberEligible: eligible,
		attachment: attachment
			? { name: attachment.name, contentType: attachment.contentType, size: attachment.size }
			: null,
		name: interaction.options.getString("name"),
	})
	if (!proposal.ok) {
		await interaction.reply(
			ephemeralText(proposeReasonCopy(proposal.reason, deps.suggestChannelId))
		)
		return
	}

	const bytes = attachment ? await deps.fetchBytes(attachment.url) : null
	if (!bytes) {
		await interaction.reply(ephemeralText(avatarProposeDownloadFailed))
		return
	}

	const suggestionId = deps.newId()
	const keyId = await deps.resolveKeyId(interaction.user.id)
	const mime = normalizeMime(attachment?.contentType ?? null)
	await deps.createSuggestion({
		id: suggestionId,
		guildId: deps.guildId,
		proposedId: proposal.id,
		label: proposal.label,
		imageBase64: bytes.toString("base64"),
		mime,
		proposerDiscordId: interaction.user.id,
		proposerKeyId: keyId,
	})

	const card = buildAvatarCard(
		{
			suggestionId,
			proposedId: proposal.id,
			label: proposal.label,
			proposerId: interaction.user.id,
			imageName: imageFileName(proposal.id, attachment?.contentType ?? null),
		},
		bytes
	)
	const posted = await deps.postCard(card)
	if (posted) await deps.setCard(suggestionId, posted.channelId, posted.messageId)

	await interaction.reply(ephemeralText(avatarProposeAck(proposal.label)))
}

export async function handleAvatarApprove(
	interaction: { reply(payload: unknown): Promise<unknown> },
	suggestionId: string
): Promise<void> {
	if (!suggestionId) {
		await interaction.reply(ephemeralText(avatarError))
		return
	}
	await interaction.reply(ephemeralCard(buildAvatarApproveConfirmCard(suggestionId)))
}

export async function handleAvatarApproveCancel(interaction: {
	update(payload: unknown): Promise<unknown>
}): Promise<void> {
	await interaction.update(buildQueueResultCard(avatarApproveCancelled))
}

export interface AvatarApproveDeps {
	getSuggestion: (id: string) => Promise<AvatarSuggestion | null>
	createAvatarPreset: (input: CreateAvatarPresetInput) => Promise<CreateAvatarPresetResult>
	markDecided: (id: string, state: "approved" | "rejected", actorId: string) => Promise<void>
	editCard: (row: AvatarSuggestion, outcome: AvatarOutcome) => Promise<void>
	notifyProposer: (row: AvatarSuggestion) => Promise<void>
}

export async function handleAvatarApproveConfirm(
	interaction: { user: { id: string }; update(payload: unknown): Promise<unknown> },
	suggestionId: string,
	deps: AvatarApproveDeps
): Promise<void> {
	const row = await deps.getSuggestion(suggestionId)
	if (!row) {
		await interaction.update(buildQueueResultCard(avatarNotFound))
		return
	}
	if (row.state !== "pending") {
		await interaction.update(buildQueueResultCard(avatarAlreadyDecided))
		return
	}

	const result = await deps.createAvatarPreset({
		id: row.proposedId,
		label: row.label,
		createdBy: row.proposerKeyId ?? undefined,
		mime: row.mime,
		bytes: Buffer.from(row.imageBase64, "base64"),
	})
	if (result.status === "exists") {
		await interaction.update(buildQueueResultCard(avatarNameTaken(row.proposedId)))
		return
	}
	if (result.status !== "created") {
		await interaction.update(buildQueueResultCard(avatarError))
		return
	}

	const actorId = interaction.user.id
	await interaction.update(buildQueueResultCard(avatarApprovedBy(actorId)))
	await deps.markDecided(suggestionId, "approved", actorId)
	await deps.editCard(row, { kind: "approved", actorId })
	await deps.notifyProposer(row)
}

export async function handleAvatarReject(
	interaction: { showModal(modal: ModalBuilder): Promise<unknown> },
	suggestionId: string
): Promise<void> {
	await interaction.showModal(
		buildRejectNoteModal(
			encodeCustomId("avatar.reject.submit", [suggestionId]),
			avatarRejectModalTitle
		)
	)
}

export interface AvatarRejectDeps {
	getSuggestion: (id: string) => Promise<AvatarSuggestion | null>
	markDecided: (id: string, state: "approved" | "rejected", actorId: string) => Promise<void>
}

export async function handleAvatarRejectSubmit(
	interaction: {
		user: { id: string }
		fields: { getTextInputValue(id: string): string }
		update(payload: unknown): Promise<unknown>
		reply(payload: unknown): Promise<unknown>
	},
	suggestionId: string,
	deps: AvatarRejectDeps
): Promise<void> {
	const row = await deps.getSuggestion(suggestionId)
	if (!row) {
		await interaction.reply(ephemeralText(avatarNotFound))
		return
	}
	if (row.state !== "pending") {
		await interaction.reply(ephemeralText(avatarAlreadyDecided))
		return
	}

	const note = readRejectNote(interaction.fields)
	const actorId = interaction.user.id
	await deps.markDecided(suggestionId, "rejected", actorId)
	await interaction.update(
		avatarCardEdit(
			buildAvatarCard(
				{
					suggestionId,
					proposedId: row.proposedId,
					label: row.label,
					proposerId: row.proposerDiscordId,
					imageName: imageFileName(row.proposedId, row.mime),
				},
				null,
				{ kind: "rejected", actorId, note }
			)
		)
	)
}
