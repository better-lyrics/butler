import { PALETTE } from "@/config"
import {
	blockedMetadataFallback,
	reportAddToBoardButtonLabel,
	reportFixItMyselfButtonLabel,
	reportHeading,
	reportHelp,
} from "@/copy/strings"
import { decodeCustomId } from "@/interactions/custom-id"
import type { ContainerBuilder } from "discord.js"
import { ButtonStyle, MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildReportCard } from "./report-card"

interface ButtonNode {
	type: 2
	style: number
	custom_id?: string
	url?: string
	label?: string
}

interface ThumbnailNode {
	type: 11
	media: { url: string }
}

interface TextNode {
	type: 10
	content: string
}

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
	if (node.components) {
		for (const child of node.components) {
			walk(child, out)
		}
	}
	if (node.accessory) {
		walk(node.accessory, out)
	}
}

function collect(container: ContainerBuilder): ComponentNode[] {
	const json = container.toJSON() as unknown as ComponentNode
	const out: ComponentNode[] = []
	walk(json, out)
	return out
}

function buttons(container: ContainerBuilder): ButtonNode[] {
	return collect(container).filter((n): n is ButtonNode => n.type === 2)
}

function thumbnails(container: ContainerBuilder): ThumbnailNode[] {
	return collect(container).filter((n): n is ThumbnailNode => n.type === 11)
}

function texts(container: ContainerBuilder): TextNode[] {
	return collect(container).filter((n): n is TextNode => n.type === 10)
}

function separators(container: ContainerBuilder): ComponentNode[] {
	return collect(container).filter((n) => n.type === 14)
}

const composerUrl = "https://composer.example.com/v/dQw4w9WgXcQ"
const videoId = "dQw4w9WgXcQ"
const posterId = "disc-poster-1"
const addCustomId = `report.add:${videoId}:${posterId}`

const meta = {
	title: "Never Gonna Give You Up",
	artist: "Rick Astley",
	albumArtUrl: "https://art.example.com/cover.png",
}

describe("report card", () => {
	describe("meta present", () => {
		const payload = buildReportCard({ videoId, posterId, meta, composerUrl })
		const container = payload.components[0] as ContainerBuilder

		it("has an add-to-board custom-id button keyed by video id and poster id", () => {
			const addBtn = buttons(container).find((b) => b.custom_id === addCustomId)
			expect(addBtn).toBeDefined()
			expect(addBtn?.label).toBe(reportAddToBoardButtonLabel)
		})
		it("uses the brand red accent", () => {
			const json = container.toJSON() as { accent_color?: number }
			expect(json.accent_color).toBe(PALETTE.betterLyricsRed)
		})
		it("decodes the add-to-board custom-id into action and args", () => {
			const addBtn = buttons(container).find((b) => b.custom_id === addCustomId)
			const decoded = addBtn?.custom_id ? decodeCustomId(addBtn.custom_id) : null
			expect(decoded).toEqual({ action: "report.add", args: [videoId, posterId] })
		})
		it("has a fix-it-myself link button to the composer url", () => {
			const fix = buttons(container).find((b) => b.style === ButtonStyle.Link)
			expect(fix?.url).toBe(composerUrl)
			expect(fix?.label).toBe(reportFixItMyselfButtonLabel)
		})
		it("renders the album art as a thumbnail", () => {
			const thumbs = thumbnails(container)
			expect(thumbs).toHaveLength(1)
			expect(thumbs[0]?.media.url).toBe(meta.albumArtUrl)
		})
		it("shows the song title and artist", () => {
			const content = texts(container)
				.map((t) => t.content)
				.join("\n")
			expect(content).toContain(meta.title)
			expect(content).toContain(meta.artist)
		})
		it("leads with the heading and includes the help line", () => {
			const content = texts(container)
				.map((t) => t.content)
				.join("\n")
			expect(content).toContain(reportHeading)
			expect(content).toContain(reportHelp)
		})
		it("has dividers structuring the card", () => {
			expect(separators(container).length).toBeGreaterThanOrEqual(1)
		})
		it("flags are non-ephemeral components v2", () => {
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("meta present with no album art", () => {
		const payload = buildReportCard({
			videoId,
			posterId,
			meta: { title: meta.title, artist: meta.artist, albumArtUrl: null },
			composerUrl,
		})
		const container = payload.components[0] as ContainerBuilder

		it("has no thumbnail", () => {
			expect(thumbnails(container)).toHaveLength(0)
		})
		it("still shows the title and artist", () => {
			const content = texts(container)
				.map((t) => t.content)
				.join("\n")
			expect(content).toContain(meta.title)
			expect(content).toContain(meta.artist)
		})
		it("still has the add-to-board button", () => {
			expect(buttons(container).some((b) => b.custom_id === addCustomId)).toBe(true)
		})
	})

	describe("meta null", () => {
		const payload = buildReportCard({ videoId, posterId, meta: null, composerUrl })
		const container = payload.components[0] as ContainerBuilder

		it("has no add-to-board button", () => {
			expect(buttons(container).some((b) => b.custom_id?.startsWith("report.add"))).toBe(false)
		})
		it("has the fix-it link button to the composer url", () => {
			const fix = buttons(container).find((b) => b.style === ButtonStyle.Link)
			expect(fix?.url).toBe(composerUrl)
			expect(fix?.label).toBe(reportFixItMyselfButtonLabel)
		})
		it("shows the heading and the blocked-metadata fallback copy", () => {
			const content = texts(container)
				.map((t) => t.content)
				.join("\n")
			expect(content).toContain(reportHeading)
			expect(content).toContain(blockedMetadataFallback)
		})
		it("has no thumbnail", () => {
			expect(thumbnails(container)).toHaveLength(0)
		})
	})
})
