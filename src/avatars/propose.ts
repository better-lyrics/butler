import { labelFrom, slugifyAvatarId } from "@/avatars/slug"

export const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

export type ProposalReason =
	| "wrong_channel"
	| "not_eligible"
	| "no_image"
	| "bad_type"
	| "too_big"
	| "bad_name"

export type ProposalResult =
	| { ok: true; id: string; label: string }
	| { ok: false; reason: ProposalReason }

export interface ProposalAttachment {
	name: string
	contentType: string | null
	size: number
}

export interface ProposalInput {
	channelId: string
	suggestChannelId: string
	memberEligible: boolean
	attachment: ProposalAttachment | null
	name?: string | null
}

function normalizeMime(contentType: string | null): string {
	return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
}

function stripExtension(filename: string): string {
	return filename.replace(/\.[^.]+$/, "")
}

export function buildProposal(input: ProposalInput): ProposalResult {
	if (input.channelId !== input.suggestChannelId) return { ok: false, reason: "wrong_channel" }
	if (!input.memberEligible) return { ok: false, reason: "not_eligible" }
	if (!input.attachment) return { ok: false, reason: "no_image" }
	if (!ACCEPTED_MIME.has(normalizeMime(input.attachment.contentType))) {
		return { ok: false, reason: "bad_type" }
	}
	if (input.attachment.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "too_big" }

	const source =
		input.name && input.name.trim() !== "" ? input.name : stripExtension(input.attachment.name)
	const id = slugifyAvatarId(source)
	if (id === "") return { ok: false, reason: "bad_name" }
	return { ok: true, id, label: labelFrom(source) }
}
