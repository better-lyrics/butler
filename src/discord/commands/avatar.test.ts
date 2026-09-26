import type { AvatarSuggestion } from "@/db/avatar-suggestions"
import type { Cooldown } from "@/discord/migrate/cooldown"
import type { CreateAvatarPresetResult } from "@/unison/client"
import { describe, expect, it, vi } from "vitest"
import {
	type AvatarApproveDeps,
	type AvatarProposeDeps,
	type AvatarRejectDeps,
	handleAvatarApproveConfirm,
	handleAvatarPropose,
	handleAvatarRejectSubmit,
} from "./avatar"

const allowCooldown: Cooldown = { check: () => ({ allowed: true }) }

function proposeDeps(overrides: Partial<AvatarProposeDeps> = {}): AvatarProposeDeps {
	return {
		guildId: "g1",
		suggestChannelId: "pfp",
		cooldown: allowCooldown,
		isEligible: async () => true,
		resolveKeyId: async () => "k".repeat(64),
		fetchBytes: async () => Buffer.from("image-bytes"),
		newId: () => "sug-1",
		createSuggestion: async (input) => ({ id: input.id }),
		deleteSuggestion: async () => {},
		postCard: async () => ({ channelId: "council", messageId: "msg-1" }),
		setCard: async () => {},
		...overrides,
	}
}

function proposeInteraction(opts: {
	channelId?: string
	attachment?: { url: string; name: string; contentType: string | null; size: number } | null
	name?: string | null
}) {
	const edits: unknown[] = []
	return {
		edits,
		interaction: {
			channelId: opts.channelId ?? "pfp",
			user: { id: "222222222222222222" },
			options: {
				getAttachment: () =>
					opts.attachment === undefined
						? { url: "https://x/i.png", name: "El Gato.png", contentType: "image/png", size: 1000 }
						: opts.attachment,
				getString: () => opts.name ?? null,
			},
			deferReply: async () => {},
			editReply: async (payload: unknown) => {
				edits.push(payload)
			},
		},
	}
}

function suggestion(overrides: Partial<AvatarSuggestion> = {}): AvatarSuggestion {
	return {
		id: "sug-1",
		guildId: "g1",
		proposedId: "el-gato",
		label: "El Gato",
		imageBase64: Buffer.from("image-bytes").toString("base64"),
		mime: "image/png",
		proposerDiscordId: "222222222222222222",
		proposerKeyId: "k".repeat(64),
		cardChannelId: "council",
		cardMessageId: "msg-1",
		state: "pending",
		createdAt: 1000,
		decidedBy: null,
		decidedAt: null,
		...overrides,
	}
}

describe("handleAvatarPropose", () => {
	it("stores the suggestion, posts the card, and acks", async () => {
		const { interaction, edits } = proposeInteraction({})
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		const postCard = vi.fn(async () => ({ channelId: "council", messageId: "msg-1" }))
		const setCard = vi.fn(async () => {})
		await handleAvatarPropose(interaction, proposeDeps({ createSuggestion, postCard, setCard }))

		expect(createSuggestion).toHaveBeenCalledOnce()
		expect(createSuggestion.mock.calls[0]?.[0]).toMatchObject({
			id: "sug-1",
			proposedId: "el-gato",
			label: "El Gato",
			proposerKeyId: "k".repeat(64),
		})
		expect(postCard).toHaveBeenCalledOnce()
		expect(setCard).toHaveBeenCalledWith("sug-1", "council", "msg-1")
		expect(edits).toHaveLength(1)
	})

	it("blocks while on cooldown without storing", async () => {
		const { interaction, edits } = proposeInteraction({})
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		await handleAvatarPropose(
			interaction,
			proposeDeps({
				cooldown: { check: () => ({ allowed: false, retryAfterMs: 5000 }) },
				createSuggestion,
			})
		)
		expect(createSuggestion).not.toHaveBeenCalled()
		expect(edits).toHaveLength(1)
	})

	it("rejects the wrong channel without storing", async () => {
		const { interaction } = proposeInteraction({ channelId: "somewhere-else" })
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		await handleAvatarPropose(interaction, proposeDeps({ createSuggestion }))
		expect(createSuggestion).not.toHaveBeenCalled()
	})

	it("rejects an ineligible member", async () => {
		const { interaction } = proposeInteraction({})
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		await handleAvatarPropose(
			interaction,
			proposeDeps({ isEligible: async () => false, createSuggestion })
		)
		expect(createSuggestion).not.toHaveBeenCalled()
	})

	it("reports a failed download without storing", async () => {
		const { interaction } = proposeInteraction({})
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		await handleAvatarPropose(
			interaction,
			proposeDeps({ fetchBytes: async () => null, createSuggestion })
		)
		expect(createSuggestion).not.toHaveBeenCalled()
	})

	it("rolls back the row when the card cannot be posted", async () => {
		const { interaction, edits } = proposeInteraction({})
		const deleteSuggestion = vi.fn(async () => {})
		const setCard = vi.fn(async () => {})
		await handleAvatarPropose(
			interaction,
			proposeDeps({ postCard: async () => null, deleteSuggestion, setCard })
		)
		expect(deleteSuggestion).toHaveBeenCalledWith("sug-1")
		expect(setCard).not.toHaveBeenCalled()
		expect(edits).toHaveLength(1)
	})
})

function approveDeps(
	result: CreateAvatarPresetResult,
	row: AvatarSuggestion | null,
	spies: Partial<AvatarApproveDeps> = {}
): AvatarApproveDeps {
	return {
		getSuggestion: async () => row,
		createAvatarPreset: async () => result,
		markDecided: async () => {},
		editCard: async () => {},
		notifyProposer: async () => {},
		...spies,
	}
}

function approveInteraction() {
	const edits: unknown[] = []
	return {
		edits,
		i: {
			user: { id: "999999999999999999" },
			deferUpdate: async () => {},
			editReply: async (p: unknown) => void edits.push(p),
		},
	}
}

describe("handleAvatarApproveConfirm", () => {
	it("publishes, marks decided, edits the card, and notifies on created", async () => {
		const markDecided = vi.fn(async () => {})
		const editCard = vi.fn(async () => {})
		const notifyProposer = vi.fn(async () => {})
		const { i } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps({ status: "created", id: "el-gato", label: "El Gato", url: "u" }, suggestion(), {
				markDecided,
				editCard,
				notifyProposer,
			})
		)
		expect(markDecided).toHaveBeenCalledWith("sug-1", "approved", "999999999999999999")
		expect(editCard).toHaveBeenCalledOnce()
		expect(notifyProposer).toHaveBeenCalledOnce()
	})

	it("settles the row as rejected when the name is taken", async () => {
		const markDecided = vi.fn(async () => {})
		const editCard = vi.fn(async () => {})
		const notifyProposer = vi.fn(async () => {})
		const { i } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps({ status: "exists" }, suggestion(), { markDecided, editCard, notifyProposer })
		)
		expect(markDecided).toHaveBeenCalledWith("sug-1", "rejected", "999999999999999999")
		expect(editCard).toHaveBeenCalledOnce()
		expect(notifyProposer).not.toHaveBeenCalled()
	})

	it("does nothing destructive when the suggestion is missing", async () => {
		const createAvatarPreset = vi.fn(async () => ({
			status: "created" as const,
			id: "a",
			label: "b",
			url: "c",
		}))
		const { i, edits } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps({ status: "created", id: "a", label: "b", url: "c" }, null, {
				createAvatarPreset,
			})
		)
		expect(createAvatarPreset).not.toHaveBeenCalled()
		expect(edits).toHaveLength(1)
	})

	it("refuses an already decided suggestion", async () => {
		const createAvatarPreset = vi.fn(async () => ({
			status: "created" as const,
			id: "a",
			label: "b",
			url: "c",
		}))
		const { i } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps(
				{ status: "created", id: "a", label: "b", url: "c" },
				suggestion({ state: "approved" }),
				{
					createAvatarPreset,
				}
			)
		)
		expect(createAvatarPreset).not.toHaveBeenCalled()
	})
})

describe("handleAvatarRejectSubmit", () => {
	function rejectInteraction() {
		const updates: unknown[] = []
		const replies: unknown[] = []
		return {
			updates,
			replies,
			i: {
				user: { id: "999999999999999999" },
				fields: { getTextInputValue: () => "too blurry" },
				update: async (p: unknown) => void updates.push(p),
				reply: async (p: unknown) => void replies.push(p),
			},
		}
	}

	function rejectDeps(
		row: AvatarSuggestion | null,
		markDecided = vi.fn(async () => {})
	): AvatarRejectDeps {
		return { getSuggestion: async () => row, markDecided }
	}

	it("marks rejected and edits the card in place", async () => {
		const markDecided = vi.fn(async () => {})
		const { i, updates } = rejectInteraction()
		await handleAvatarRejectSubmit(i, "sug-1", rejectDeps(suggestion(), markDecided))
		expect(markDecided).toHaveBeenCalledWith("sug-1", "rejected", "999999999999999999")
		expect(updates).toHaveLength(1)
	})

	it("does not mark decided when the suggestion is missing", async () => {
		const markDecided = vi.fn(async () => {})
		const { i, replies } = rejectInteraction()
		await handleAvatarRejectSubmit(i, "sug-1", rejectDeps(null, markDecided))
		expect(markDecided).not.toHaveBeenCalled()
		expect(replies).toHaveLength(1)
	})
})
