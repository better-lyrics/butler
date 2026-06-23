import {
	alreadyAvailable,
	alreadyRequested,
	blockedMetadataFallback,
	notYourReport,
	requestAdded,
} from "@/copy/strings"
import { encodeCustomId } from "@/interactions/custom-id"
import type { BotRequestBody } from "@/requests/payload"
import type { BotRequestResult } from "@/unison/client"
import type { TrackMeta } from "@/ytm/metadata"
import type { ContainerBuilder } from "discord.js"
import { describe, expect, it } from "vitest"
import type { AddToBoardDeps, AddToBoardInteraction, ReportDeps, ReportMessage } from "./report"
import { handleAddToBoard, handleReportMessage } from "./report"

interface ButtonNode {
	type: 2
	custom_id?: string
	url?: string
	label?: string
}

interface ComponentNode {
	type: number
	custom_id?: string
	url?: string
	components?: ComponentNode[]
	accessory?: ComponentNode
}

interface CardPayload {
	components: ContainerBuilder[]
	flags: number | number[]
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	if (node.components) {
		for (const child of node.components) {
			walk(child, out)
		}
	}
	if (node.accessory) {
		walk(node.accessory, out)
	}
}

function buttonsOf(payload: CardPayload): ButtonNode[] {
	const container = payload.components[0]
	if (!container) return []
	const out: ComponentNode[] = []
	walk(container.toJSON() as unknown as ComponentNode, out)
	return out.filter((n): n is ButtonNode => n.type === 2)
}

const reportChannelId = "report-channel-1"
const composerBaseUrl = "https://composer.example.com"
const videoId = "dQw4w9WgXcQ"

const sampleMeta: TrackMeta = {
	videoId,
	title: "Never Gonna Give You Up",
	artist: "Rick Astley",
	album: "Whenever You Need Somebody",
	durationSec: 213,
	albumArtUrl: "https://art.example.com/cover.png",
}

function ytmLink(id: string): string {
	return `check this https://music.youtube.com/watch?v=${id} please`
}

interface MessageRecorder {
	message: ReportMessage
	replies: unknown[]
}

function makeMessage(opts: {
	authorId: string
	bot: boolean
	channelId: string
	content: string
}): MessageRecorder {
	const replies: unknown[] = []
	const message: ReportMessage = {
		author: { id: opts.authorId, bot: opts.bot },
		channelId: opts.channelId,
		content: opts.content,
		reply: async (payload: unknown) => {
			replies.push(payload)
		},
	}
	return { message, replies }
}

function makeReportDeps(opts: { meta: TrackMeta | null }): {
	deps: ReportDeps
	fetchMetaCalls: string[]
} {
	const fetchMetaCalls: string[] = []
	const deps: ReportDeps = {
		reportChannelId,
		composerBaseUrl,
		fetchMeta: async (id: string) => {
			fetchMetaCalls.push(id)
			return opts.meta
		},
	}
	return { deps, fetchMetaCalls }
}

describe("handleReportMessage", () => {
	describe("ignored messages", () => {
		it("does not reply to a bot author", async () => {
			const { message, replies } = makeMessage({
				authorId: "bot-1",
				bot: true,
				channelId: reportChannelId,
				content: ytmLink(videoId),
			})
			const { deps } = makeReportDeps({ meta: sampleMeta })

			await handleReportMessage(message, deps)

			expect(replies).toHaveLength(0)
		})

		it("does not reply when the channel is wrong", async () => {
			const { message, replies } = makeMessage({
				authorId: "user-1",
				bot: false,
				channelId: "some-other-channel",
				content: ytmLink(videoId),
			})
			const { deps } = makeReportDeps({ meta: sampleMeta })

			await handleReportMessage(message, deps)

			expect(replies).toHaveLength(0)
		})
	})

	describe("ytm link with metadata", () => {
		it("replies with an add-to-board button keyed by video and poster, no connect button", async () => {
			const posterId = "user-poster"
			const { message, replies } = makeMessage({
				authorId: posterId,
				bot: false,
				channelId: reportChannelId,
				content: ytmLink(videoId),
			})
			const { deps } = makeReportDeps({ meta: sampleMeta })

			await handleReportMessage(message, deps)

			expect(replies).toHaveLength(1)
			const payload = replies[0] as CardPayload
			const btns = buttonsOf(payload)
			const addBtn = btns.find((b) => b.custom_id === `report.add:${videoId}:${posterId}`)
			expect(addBtn).toBeDefined()
			expect(btns.some((b) => b.custom_id === "connect")).toBe(false)
		})
	})

	describe("non-ytm message", () => {
		it("replies with the degraded card and never fetches metadata", async () => {
			const { message, replies } = makeMessage({
				authorId: "user-1",
				bot: false,
				channelId: reportChannelId,
				content: "just chatting",
			})
			const { deps, fetchMetaCalls } = makeReportDeps({ meta: sampleMeta })

			await handleReportMessage(message, deps)

			expect(fetchMetaCalls).toEqual([])
			expect(replies).toHaveLength(1)
			const payload = replies[0] as CardPayload
			const btns = buttonsOf(payload)
			expect(btns.some((b) => b.custom_id?.startsWith("report.add"))).toBe(false)
		})
	})
})

interface AddRecorder {
	interaction: AddToBoardInteraction
	replies: Array<{ content?: string; flags?: number | number[] }>
}

function makeAddInteraction(opts: { userId: string; customId: string }): AddRecorder {
	const replies: Array<{ content?: string; flags?: number | number[] }> = []
	const interaction: AddToBoardInteraction = {
		user: { id: opts.userId },
		customId: opts.customId,
		reply: async (payload: unknown) => {
			replies.push(payload as { content?: string; flags?: number | number[] })
		},
	}
	return { interaction, replies }
}

function makeAddDeps(opts: {
	isMod: boolean
	meta: TrackMeta | null
	result: BotRequestResult
}): { deps: AddToBoardDeps; submitted: BotRequestBody[] } {
	const submitted: BotRequestBody[] = []
	const deps: AddToBoardDeps = {
		isMod: () => opts.isMod,
		fetchMeta: async () => opts.meta,
		submitRequest: async (body: BotRequestBody) => {
			submitted.push(body)
			return opts.result
		},
	}
	return { deps, submitted }
}

const posterId = "user-poster"
const addCustomId = encodeCustomId("report.add", [videoId, posterId])

describe("handleAddToBoard", () => {
	describe("scope", () => {
		it("refuses a non-poster non-mod and does not submit", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: "intruder",
				customId: addCustomId,
			})
			const { deps, submitted } = makeAddDeps({
				isMod: false,
				meta: sampleMeta,
				result: { status: "created", demand: 3, requestCount: 2 },
			})

			await handleAddToBoard(interaction, deps)

			expect(submitted).toHaveLength(0)
			expect(replies).toHaveLength(1)
			expect(replies[0]?.content).toBe(notYourReport)
		})

		it("allows a mod acting on someone else's report and attributes to the poster", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: "a-mod",
				customId: addCustomId,
			})
			const { deps, submitted } = makeAddDeps({
				isMod: true,
				meta: sampleMeta,
				result: { status: "created", demand: 1, requestCount: 1 },
			})

			await handleAddToBoard(interaction, deps)

			expect(submitted).toHaveLength(1)
			expect(submitted[0]?.discordId).toBe(posterId)
			expect(replies[0]?.content).toBe(requestAdded({ demand: 1, requestCount: 1 }))
		})
	})

	describe("missing metadata", () => {
		it("replies with the blocked fallback and does not submit", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: posterId,
				customId: addCustomId,
			})
			const { deps, submitted } = makeAddDeps({
				isMod: false,
				meta: null,
				result: { status: "error", code: 500 },
			})

			await handleAddToBoard(interaction, deps)

			expect(submitted).toHaveLength(0)
			expect(replies[0]?.content).toBe(blockedMetadataFallback)
		})
	})

	describe("submitting a request", () => {
		it("submits with the poster's discordId and the added copy", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: posterId,
				customId: addCustomId,
			})
			const { deps, submitted } = makeAddDeps({
				isMod: false,
				meta: sampleMeta,
				result: { status: "created", demand: 5, requestCount: 4 },
			})

			await handleAddToBoard(interaction, deps)

			expect(submitted).toHaveLength(1)
			expect(submitted[0]?.discordId).toBe(posterId)
			expect(replies[0]?.content).toBe(requestAdded({ demand: 5, requestCount: 4 }))
		})

		it("reports already-available", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: posterId,
				customId: addCustomId,
			})
			const { deps } = makeAddDeps({
				isMod: false,
				meta: sampleMeta,
				result: { status: "already_available" },
			})

			await handleAddToBoard(interaction, deps)

			expect(replies[0]?.content).toBe(alreadyAvailable)
		})

		it("reports already-requested with demand and count", async () => {
			const { interaction, replies } = makeAddInteraction({
				userId: posterId,
				customId: addCustomId,
			})
			const { deps } = makeAddDeps({
				isMod: false,
				meta: sampleMeta,
				result: { status: "already_requested", demand: 7, requestCount: 6 },
			})

			await handleAddToBoard(interaction, deps)

			expect(replies[0]?.content).toBe(alreadyRequested({ demand: 7, requestCount: 6 }))
		})
	})
})
