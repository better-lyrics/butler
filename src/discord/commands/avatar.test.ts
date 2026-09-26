import { MAX_NAME_LENGTH } from "@/avatars/propose"
import {
	avatarAlreadyDecided,
	avatarImageInvalid,
	avatarInProgress,
	avatarProposeBadId,
} from "@/copy/strings"
import {
	type AvatarSuggestion,
	claimSuggestion,
	createSuggestion,
	getSuggestion,
	markSuggestionDecided,
	releaseSuggestion,
} from "@/db/avatar-suggestions"
import { applySchema } from "@/db/pool"
import { type Cooldown, createCooldown } from "@/discord/migrate/cooldown"
import type { CreateAvatarPresetResult } from "@/unison/client"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { describe, expect, it, vi } from "vitest"
import {
	type AvatarApproveDeps,
	type AvatarProposeDeps,
	type AvatarRejectDeps,
	avatarCommand,
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
	id?: string | null
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
				getString: (option: string) =>
					option === "id"
						? opts.id === undefined
							? "el-gato"
							: opts.id
						: opts.name === undefined
							? "El Gato"
							: opts.name,
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

describe("avatarCommand", () => {
	it("requires an image, a name, and an id, each capped at the unison limit", () => {
		const options = avatarCommand.toJSON().options ?? []
		expect(options.map((o) => [o.name, o.required])).toEqual([
			["image", true],
			["name", true],
			["id", true],
		])
		for (const o of options.filter((o) => o.name !== "image")) {
			expect(o).toMatchObject({ max_length: MAX_NAME_LENGTH })
		}
	})
})

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

	it("rejects an id with uppercase or symbols and explains the format", async () => {
		const { interaction, edits } = proposeInteraction({ id: "El_Gato!" })
		const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
		await handleAvatarPropose(interaction, proposeDeps({ createSuggestion }))
		expect(createSuggestion).not.toHaveBeenCalled()
		expect(edits).toEqual([{ content: avatarProposeBadId }])
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

	describe("regressions", () => {
		it("regression: a rejected attempt does not start the cooldown", async () => {
			const cooldown = createCooldown({ windowMs: 60_000, now: () => 1000 })
			const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
			const deps = proposeDeps({ cooldown, createSuggestion })

			await handleAvatarPropose(proposeInteraction({ channelId: "wrong" }).interaction, deps)
			await handleAvatarPropose(proposeInteraction({ attachment: null }).interaction, deps)
			await handleAvatarPropose(proposeInteraction({}).interaction, deps)

			expect(createSuggestion).toHaveBeenCalledOnce()
		})

		it("regression: still enforces the cooldown between two valid suggestions", async () => {
			const cooldown = createCooldown({ windowMs: 60_000, now: () => 1000 })
			const createSuggestion = vi.fn(async (input) => ({ id: input.id }))
			const deps = proposeDeps({ cooldown, createSuggestion })

			await handleAvatarPropose(proposeInteraction({}).interaction, deps)
			await handleAvatarPropose(proposeInteraction({}).interaction, deps)

			expect(createSuggestion).toHaveBeenCalledOnce()
		})

		it("regression: a failed store edits the deferred reply instead of leaving it thinking", async () => {
			const { interaction, edits } = proposeInteraction({})
			const postCard = vi.fn(async () => ({ channelId: "council", messageId: "msg-1" }))
			await expect(
				handleAvatarPropose(
					interaction,
					proposeDeps({
						createSuggestion: async () => {
							throw new Error("db down")
						},
						postCard,
					})
				)
			).rejects.toThrow("db down")
			expect(postCard).not.toHaveBeenCalled()
			expect(edits).toHaveLength(1)
		})

		it("regression: a failed key lookup edits the deferred reply", async () => {
			const { interaction, edits } = proposeInteraction({})
			await expect(
				handleAvatarPropose(
					interaction,
					proposeDeps({
						resolveKeyId: async () => {
							throw new Error("unison down")
						},
					})
				)
			).rejects.toThrow("unison down")
			expect(edits).toHaveLength(1)
		})
	})
})

function approveDeps(
	result: CreateAvatarPresetResult,
	row: AvatarSuggestion | null,
	spies: Partial<AvatarApproveDeps> = {}
): AvatarApproveDeps {
	return {
		claim: async () => (row?.state === "pending" ? { ...row, state: "publishing" } : null),
		release: async () => {},
		getSuggestion: async () => row,
		createAvatarPreset: async () => result,
		markDecided: async () => true,
		editCard: async () => {},
		notifyProposer: async () => {},
		...spies,
	}
}

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function storeDeps(
	pool: Pool,
	createAvatarPreset: AvatarApproveDeps["createAvatarPreset"]
): AvatarApproveDeps {
	return {
		claim: (id, actorId) => claimSuggestion(pool, id, actorId),
		release: (id) => releaseSuggestion(pool, id),
		getSuggestion: (id) => getSuggestion(pool, id),
		createAvatarPreset,
		markDecided: (input) => markSuggestionDecided(pool, input),
		editCard: async () => {},
		notifyProposer: async () => {},
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
		const markDecided = vi.fn(async () => true)
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
		expect(markDecided).toHaveBeenCalledWith({
			id: "sug-1",
			from: "publishing",
			to: "approved",
			decidedBy: "999999999999999999",
		})
		expect(editCard).toHaveBeenCalledOnce()
		expect(notifyProposer).toHaveBeenCalledOnce()
	})

	it("settles the row as rejected when the name is taken", async () => {
		const markDecided = vi.fn(async () => true)
		const editCard = vi.fn(async () => {})
		const notifyProposer = vi.fn(async () => {})
		const { i } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps({ status: "exists" }, suggestion(), { markDecided, editCard, notifyProposer })
		)
		expect(markDecided).toHaveBeenCalledWith({
			id: "sug-1",
			from: "publishing",
			to: "rejected",
			decidedBy: "999999999999999999",
		})
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

	it("settles the row as rejected when unison cannot process the image", async () => {
		const markDecided = vi.fn(async () => true)
		const editCard = vi.fn(async () => {})
		const release = vi.fn(async () => {})
		const { i, edits } = approveInteraction()
		await handleAvatarApproveConfirm(
			i,
			"sug-1",
			approveDeps({ status: "invalid" }, suggestion(), { markDecided, editCard, release })
		)
		expect(markDecided).toHaveBeenCalledWith(
			expect.objectContaining({ from: "publishing", to: "rejected" })
		)
		expect(editCard).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ kind: "rejected", note: avatarImageInvalid })
		)
		expect(release).not.toHaveBeenCalled()
		expect(JSON.stringify(edits)).toContain(avatarImageInvalid)
	})

	describe("error paths", () => {
		for (const result of [
			{ status: "cdn_unavailable" },
			{ status: "error", code: 500 },
		] as CreateAvatarPresetResult[]) {
			it(`releases the claim for a retry on ${result.status}`, async () => {
				const markDecided = vi.fn(async () => true)
				const release = vi.fn(async () => {})
				const { i } = approveInteraction()
				await handleAvatarApproveConfirm(
					i,
					"sug-1",
					approveDeps(result, suggestion(), { markDecided, release })
				)
				expect(release).toHaveBeenCalledWith("sug-1")
				expect(markDecided).not.toHaveBeenCalled()
			})
		}

		it("releases the claim when the publish call throws", async () => {
			const release = vi.fn(async () => {})
			const { i } = approveInteraction()
			await expect(
				handleAvatarApproveConfirm(
					i,
					"sug-1",
					approveDeps({ status: "exists" }, suggestion(), {
						release,
						createAvatarPreset: async () => {
							throw new Error("network down")
						},
					})
				)
			).rejects.toThrow("network down")
			expect(release).toHaveBeenCalledWith("sug-1")
		})

		it("tells the admin another decision is in flight without publishing", async () => {
			const createAvatarPreset = vi.fn(async () => ({ status: "exists" as const }))
			const { i, edits } = approveInteraction()
			await handleAvatarApproveConfirm(
				i,
				"sug-1",
				approveDeps({ status: "exists" }, suggestion({ state: "publishing" }), {
					createAvatarPreset,
				})
			)
			expect(createAvatarPreset).not.toHaveBeenCalled()
			expect(JSON.stringify(edits)).toContain(avatarInProgress)
		})
	})

	describe("regressions", () => {
		it("regression: a double confirm publishes once and leaves the row approved", async () => {
			const pool = await freshPool()
			await createSuggestion(pool, {
				id: "sug-1",
				guildId: "g1",
				proposedId: "el-gato",
				label: "El Gato",
				imageBase64: Buffer.from("image-bytes").toString("base64"),
				mime: "image/png",
				proposerDiscordId: "222222222222222222",
				proposerKeyId: null,
			})
			let published = false
			const createAvatarPreset = vi.fn(async (): Promise<CreateAvatarPresetResult> => {
				if (published) return { status: "exists" }
				published = true
				return { status: "created", id: "el-gato", label: "El Gato", url: "u" }
			})
			const deps = storeDeps(pool, createAvatarPreset)
			const first = approveInteraction()
			const second = approveInteraction()

			await Promise.all([
				handleAvatarApproveConfirm(first.i, "sug-1", deps),
				handleAvatarApproveConfirm(second.i, "sug-1", deps),
			])

			expect(createAvatarPreset).toHaveBeenCalledOnce()
			expect(await getSuggestion(pool, "sug-1")).toMatchObject({ state: "approved" })
		})
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
		markDecided: AvatarRejectDeps["markDecided"] = vi.fn(async () => true)
	): AvatarRejectDeps {
		return { getSuggestion: async () => row, markDecided }
	}

	it("marks rejected and edits the card in place", async () => {
		const markDecided = vi.fn(async () => true)
		const { i, updates } = rejectInteraction()
		await handleAvatarRejectSubmit(i, "sug-1", rejectDeps(suggestion(), markDecided))
		expect(markDecided).toHaveBeenCalledWith({
			id: "sug-1",
			from: "pending",
			to: "rejected",
			decidedBy: "999999999999999999",
		})
		expect(updates).toHaveLength(1)
	})

	it("regression: does not overwrite a decision that landed first", async () => {
		const { i, updates, replies } = rejectInteraction()
		await handleAvatarRejectSubmit(
			i,
			"sug-1",
			rejectDeps(
				suggestion(),
				vi.fn(async () => false)
			)
		)
		expect(updates).toHaveLength(0)
		expect(JSON.stringify(replies)).toContain(avatarAlreadyDecided)
	})

	it("does not mark decided when the suggestion is missing", async () => {
		const markDecided = vi.fn(async () => true)
		const { i, replies } = rejectInteraction()
		await handleAvatarRejectSubmit(i, "sug-1", rejectDeps(null, markDecided))
		expect(markDecided).not.toHaveBeenCalled()
		expect(replies).toHaveLength(1)
	})
})
