import { blockedMetadataFallback, promotionTitle } from "@/copy/strings"
import type { TrackMeta } from "@/ytm/metadata"
import type { ChatInputCommandInteraction, ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	PREVIEW_GUILD_ONLY,
	PREVIEW_NO_PERMISSION,
	PREVIEW_STUB_VIDEO_ID,
	type PreviewDeps,
	type PreviewParams,
	buildPreviewCard,
	handlePreview,
} from "./preview"

interface ComponentNode {
	type: number
	content?: string
	url?: string
	custom_id?: string
	media?: { url: string }
	components?: ComponentNode[]
	accessory?: ComponentNode
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	for (const child of node.components ?? []) walk(child, out)
	if (node.accessory) walk(node.accessory, out)
}

function collect(card: { components: ContainerBuilder[] }): ComponentNode[] {
	const out: ComponentNode[] = []
	walk(card.components[0]?.toJSON() as unknown as ComponentNode, out)
	return out
}

function textBlob(card: { components: ContainerBuilder[] }): string {
	return collect(card)
		.filter((n) => n.type === 10)
		.map((n) => n.content ?? "")
		.join("\n")
}

function buttons(card: { components: ContainerBuilder[] }): ComponentNode[] {
	return collect(card).filter((n) => n.type === 2)
}

const baseParams: PreviewParams = {
	card: "connect",
	tier: "legendary",
	userId: "111222333444555666",
	avatarUrl: "https://avatar.example.com/me.png",
	meta: {
		title: "Around the Fur",
		artist: "Deftones",
		albumArtUrl: "https://i.ytimg.com/vi/x/0.jpg",
	},
	videoId: PREVIEW_STUB_VIDEO_ID,
	linkPageUrl: "https://unison.example.com/link",
	composerUrl: "https://composer.example.com/?videoId=os0y0RmiIKI",
}

describe("buildPreviewCard", () => {
	describe("happy paths", () => {
		it("connect: renders the link button to the link page", () => {
			const card = buildPreviewCard({ ...baseParams, card: "connect" })
			expect(buttons(card).some((b) => b.url === baseParams.linkPageUrl)).toBe(true)
		})

		it("report: shows the track title and an add-to-board button", () => {
			const card = buildPreviewCard({ ...baseParams, card: "report" })
			expect(textBlob(card)).toContain("Around the Fur")
			expect(buttons(card).some((b) => b.custom_id?.startsWith("report.add"))).toBe(true)
		})

		it("report_blocked: shows the blocked copy and no add-to-board button", () => {
			const card = buildPreviewCard({ ...baseParams, card: "report_blocked" })
			expect(textBlob(card)).toContain(blockedMetadataFallback)
			expect(buttons(card).some((b) => b.custom_id?.startsWith("report.add"))).toBe(false)
		})

		it("promotion: pings the curator with the tier headline and stats", () => {
			const card = buildPreviewCard({ ...baseParams, card: "promotion", tier: "elite" })
			const blob = textBlob(card)
			expect(blob).toContain(promotionTitle({ discordId: baseParams.userId, tier: "elite" }))
			expect(blob).toContain("Rank #7")
		})
	})

	describe("invariants", () => {
		it("every preview is ephemeral components v2", () => {
			for (const card of ["connect", "report", "report_blocked", "promotion"]) {
				const payload = buildPreviewCard({ ...baseParams, card })
				expect(payload.flags).toEqual([MessageFlags.IsComponentsV2, MessageFlags.Ephemeral])
			}
		})
	})

	describe("edge cases", () => {
		it("falls back to default stats for an unknown promotion tier", () => {
			const card = buildPreviewCard({ ...baseParams, card: "promotion", tier: "wizard" })
			expect(textBlob(card)).toContain("Rank #1")
		})

		it("report with null meta renders the blocked layout", () => {
			const card = buildPreviewCard({ ...baseParams, card: "report", meta: null })
			expect(textBlob(card)).toContain(blockedMetadataFallback)
		})
	})
})

interface Recorder {
	replies: Array<{ content?: string; flags?: number | number[] }>
	fetched: string[]
}

function makeInteraction(opts: {
	guildId: string | null
	manage: boolean
	card?: string
	tier?: string | null
	link?: string | null
}) {
	const rec: Recorder = { replies: [], fetched: [] }
	const interaction = {
		guildId: opts.guildId,
		memberPermissions: { has: () => opts.manage },
		user: {
			id: "777888999000111222",
			displayAvatarURL: () => "https://avatar.example.com/invoker.png",
		},
		options: {
			getString(name: string, _required?: boolean) {
				if (name === "card") return opts.card ?? "connect"
				if (name === "tier") return opts.tier ?? null
				if (name === "link") return opts.link ?? null
				return null
			},
		},
		async reply(payload: { content?: string; flags?: number | number[] }) {
			rec.replies.push(payload)
		},
	}
	return { interaction: interaction as unknown as ChatInputCommandInteraction, rec }
}

const track: TrackMeta = {
	videoId: PREVIEW_STUB_VIDEO_ID,
	title: "Around the Fur",
	artist: "Deftones",
	album: "Around the Fur",
	durationSec: 232,
	albumArtUrl: "https://i.ytimg.com/vi/os0y0RmiIKI/0.jpg",
}

function makeDeps(meta: TrackMeta | null, rec: Recorder): PreviewDeps {
	return {
		linkPageUrl: "https://unison.example.com/link",
		composerBaseUrl: "https://composer.example.com",
		async fetchMeta(videoId) {
			rec.fetched.push(videoId)
			return meta
		},
	}
}

describe("handlePreview", () => {
	describe("permission gates", () => {
		it("refuses outside a guild", async () => {
			const { interaction, rec } = makeInteraction({ guildId: null, manage: true })
			await handlePreview(interaction, makeDeps(track, rec))
			expect(rec.replies[0]?.content).toBe(PREVIEW_GUILD_ONLY)
		})

		it("refuses a member without Manage Server", async () => {
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: false })
			await handlePreview(interaction, makeDeps(track, rec))
			expect(rec.replies[0]?.content).toBe(PREVIEW_NO_PERMISSION)
		})
	})

	describe("happy paths", () => {
		it("report: fetches the stub track and replies with an ephemeral card", async () => {
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true, card: "report" })
			await handlePreview(interaction, makeDeps(track, rec))
			expect(rec.fetched).toEqual([PREVIEW_STUB_VIDEO_ID])
			expect(rec.replies[0]?.flags).toEqual([MessageFlags.IsComponentsV2, MessageFlags.Ephemeral])
		})

		it("report: fetches the video id parsed from a provided link", async () => {
			const link = "https://music.youtube.com/watch?v=dQw4w9WgXcQ"
			const { interaction, rec } = makeInteraction({
				guildId: "g1",
				manage: true,
				card: "report",
				link,
			})
			await handlePreview(interaction, makeDeps(track, rec))
			expect(rec.fetched).toEqual(["dQw4w9WgXcQ"])
		})

		it("promotion: replies without hitting the metadata fetch", async () => {
			const { interaction, rec } = makeInteraction({
				guildId: "g1",
				manage: true,
				card: "promotion",
				tier: "master",
			})
			await handlePreview(interaction, makeDeps(track, rec))
			expect(rec.fetched).toEqual([])
			expect(rec.replies).toHaveLength(1)
		})
	})

	describe("error paths", () => {
		it("report falls back to the blocked layout when metadata cannot be fetched", async () => {
			const { interaction, rec } = makeInteraction({ guildId: "g1", manage: true, card: "report" })
			await handlePreview(interaction, makeDeps(null, rec))
			expect(rec.fetched).toEqual([PREVIEW_STUB_VIDEO_ID])
			expect(rec.replies).toHaveLength(1)
		})
	})
})
