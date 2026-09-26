import { normalizeMime } from "@/avatars/download"

export const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
// keep in sync with the id/label maxLength on unison POST /avatars/presets
export const MAX_NAME_LENGTH = 64
const AVATAR_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type ProposalReason =
	| "wrong_channel"
	| "not_eligible"
	| "no_image"
	| "bad_type"
	| "too_big"
	| "bad_name"
	| "bad_id"

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
	name: string | null
	id: string | null
}

function toLabel(name: string): string {
	return name
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, MAX_NAME_LENGTH)
		.replace(/[\uD800-\uDBFF]$/, "")
		.trimEnd()
}

export function buildProposal(input: ProposalInput): ProposalResult {
	if (input.channelId !== input.suggestChannelId) return { ok: false, reason: "wrong_channel" }
	if (!input.memberEligible) return { ok: false, reason: "not_eligible" }
	if (!input.attachment) return { ok: false, reason: "no_image" }
	if (!ACCEPTED_MIME.has(normalizeMime(input.attachment.contentType))) {
		return { ok: false, reason: "bad_type" }
	}
	if (input.attachment.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "too_big" }

	const label = toLabel(input.name ?? "")
	if (label === "") return { ok: false, reason: "bad_name" }
	const id = (input.id ?? "").trim()
	if (id.length > MAX_NAME_LENGTH || !AVATAR_ID.test(id)) return { ok: false, reason: "bad_id" }
	return { ok: true, id, label }
}
