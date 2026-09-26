import { imageFileName, normalizeMime } from "@/avatars/download"
import { MAX_NAME_LENGTH, type ProposalReason, buildProposal } from "@/avatars/propose"
import {
	avatarAlreadyDecided,
	avatarApproveCancelled,
	avatarApprovedBy,
	avatarCooldown,
	avatarError,
	avatarImageInvalid,
	avatarInProgress,
	avatarNameTaken,
	avatarNotFound,
	avatarProposeAck,
	avatarProposeBadId,
	avatarProposeBadName,
	avatarProposeBadType,
	avatarProposeDownloadFailed,
	avatarProposeNoImage,
	avatarProposeNotEligible,
	avatarProposeNotPosted,
	avatarProposeTooBig,
	avatarProposeWrongChannel,
	avatarRejectModalTitle,
} from "@/copy/strings"
import type {
	AvatarSuggestion,
	CreateSuggestionInput,
	SuggestionDecision,
} from "@/db/avatar-suggestions"
import type { Cooldown } from "@/discord/migrate/cooldown"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import { encodeCustomId } from "@/interactions/custom-id"
import type { CreateAvatarPresetInput, CreateAvatarPresetResult } from "@/unison/client"
import { MessageFlags, type ModalBuilder, SlashCommandBuilder } from "discord.js"
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
			.setDescription("The display name, like Sky Cat")
			.setMaxLength(MAX_NAME_LENGTH)
			.setRequired(true)
	)
	.addStringOption((option) =>
		option
			.setName("id")
			.setDescription("Permanent ID: lowercase letters, numbers, and hyphens, like sky-cat")
			.setMaxLength(MAX_NAME_LENGTH)
			.setRequired(true)
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
	deferReply(options: unknown): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export interface AvatarProposeDeps {
	guildId: string
	suggestChannelId: string
	cooldown: Cooldown
	isEligible: (discordId: string) => Promise<boolean>
	resolveKeyId: (discordId: string) => Promise<string | null>
	fetchBytes: (url: string) => Promise<Buffer | null>
	newId: () => string
	createSuggestion: (input: CreateSuggestionInput) => Promise<{ id: string }>
	deleteSuggestion: (id: string) => Promise<void>
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
		case "bad_id":
			return avatarProposeBadId
	}
}

export async function handleAvatarPropose(
	interaction: AvatarProposeInteraction,
	deps: AvatarProposeDeps
): Promise<void> {
	// Defer first: the role fetch, download and store can outlast Discord's 3s ack window.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	try {
		await submitProposal(interaction, deps)
	} catch (err) {
		await interaction
			.editReply({ content: avatarProposeNotPosted })
			.catch((replyErr) => console.error("avatar propose error reply failed", replyErr))
		throw err
	}
}

async function submitProposal(
	interaction: AvatarProposeInteraction,
	deps: AvatarProposeDeps
): Promise<void> {
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
		id: interaction.options.getString("id"),
	})
	if (!proposal.ok) {
		await interaction.editReply({
			content: proposeReasonCopy(proposal.reason, deps.suggestChannelId),
		})
		return
	}

	const cd = deps.cooldown.check(interaction.user.id)
	if (!cd.allowed) {
		await interaction.editReply({ content: avatarCooldown(cd.retryAfterMs) })
		return
	}

	const bytes = attachment ? await deps.fetchBytes(attachment.url) : null
	if (!bytes) {
		await interaction.editReply({ content: avatarProposeDownloadFailed })
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
	if (!posted) {
		// No review card means no admin can act on it: roll back so it does not sit orphaned.
		await deps.deleteSuggestion(suggestionId)
		await interaction.editReply({ content: avatarProposeNotPosted })
		return
	}
	await deps.setCard(suggestionId, posted.channelId, posted.messageId)

	await interaction.editReply({ content: avatarProposeAck(proposal.label) })
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
	claim: (id: string, actorId: string) => Promise<AvatarSuggestion | null>
	release: (id: string) => Promise<void>
	getSuggestion: (id: string) => Promise<AvatarSuggestion | null>
	createAvatarPreset: (input: CreateAvatarPresetInput) => Promise<CreateAvatarPresetResult>
	markDecided: (decision: SuggestionDecision) => Promise<boolean>
	editCard: (row: AvatarSuggestion, outcome: AvatarOutcome) => Promise<void>
	notifyProposer: (row: AvatarSuggestion) => Promise<void>
}

function unclaimedCopy(row: AvatarSuggestion | null): string {
	if (!row) return avatarNotFound
	return row.state === "publishing" ? avatarInProgress : avatarAlreadyDecided
}

export async function handleAvatarApproveConfirm(
	interaction: {
		user: { id: string }
		deferUpdate(): Promise<unknown>
		editReply(payload: unknown): Promise<unknown>
	},
	suggestionId: string,
	deps: AvatarApproveDeps
): Promise<void> {
	// Defer first: the re-encode and CDN upload can outlast Discord's 3s ack window.
	await interaction.deferUpdate()

	const actorId = interaction.user.id
	const row = await deps.claim(suggestionId, actorId)
	if (!row) {
		const current = await deps.getSuggestion(suggestionId)
		await interaction.editReply(buildQueueResultCard(unclaimedCopy(current)))
		return
	}

	let result: CreateAvatarPresetResult
	try {
		result = await deps.createAvatarPreset({
			id: row.proposedId,
			label: row.label,
			createdBy: row.proposerKeyId ?? undefined,
			mime: row.mime,
			bytes: Buffer.from(row.imageBase64, "base64"),
		})
	} catch (err) {
		await deps.release(suggestionId)
		throw err
	}

	if (result.status === "created") {
		await deps.markDecided({
			id: suggestionId,
			from: "publishing",
			to: "approved",
			decidedBy: actorId,
		})
		await deps.editCard(row, { kind: "approved", actorId })
		await interaction.editReply(buildQueueResultCard(avatarApprovedBy(actorId)))
		await deps.notifyProposer(row)
		return
	}

	const rejectNote =
		result.status === "exists"
			? avatarNameTaken(row.proposedId)
			: result.status === "invalid"
				? avatarImageInvalid
				: null
	if (!rejectNote) {
		await deps.release(suggestionId)
		await interaction.editReply(buildQueueResultCard(avatarError))
		return
	}

	// A retry can never succeed here, so settle the row instead of leaving live buttons.
	await deps.markDecided({
		id: suggestionId,
		from: "publishing",
		to: "rejected",
		decidedBy: actorId,
	})
	await deps.editCard(row, { kind: "rejected", actorId, note: rejectNote })
	await interaction.editReply(buildQueueResultCard(rejectNote))
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
	markDecided: (decision: SuggestionDecision) => Promise<boolean>
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
	const note = readRejectNote(interaction.fields)
	const actorId = interaction.user.id
	const decided =
		row.state === "pending" &&
		(await deps.markDecided({
			id: suggestionId,
			from: "pending",
			to: "rejected",
			decidedBy: actorId,
		}))
	if (!decided) {
		await interaction.reply(ephemeralText(unclaimedCopy(row)))
		return
	}
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
