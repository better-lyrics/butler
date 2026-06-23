import { PALETTE } from "@/config"
import { tierLabel } from "@/copy/strings"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildPromotionCard } from "./promotion-card"

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
	accent_color?: number
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

function rootJson(container: ContainerBuilder): ComponentNode {
	return container.toJSON() as unknown as ComponentNode
}

function collect(container: ContainerBuilder): ComponentNode[] {
	const out: ComponentNode[] = []
	walk(rootJson(container), out)
	return out
}

function thumbnails(container: ContainerBuilder): ThumbnailNode[] {
	return collect(container).filter((n): n is ThumbnailNode => n.type === 11)
}

function texts(container: ContainerBuilder): TextNode[] {
	return collect(container).filter((n): n is TextNode => n.type === 10)
}

const opts = {
	displayName: "Sofia",
	avatarUrl: "https://avatar.example.com/sofia.png",
	tier: "rank-1",
	rank: 3,
	submissionCount: 42,
	totalUpvotes: 1234,
}

describe("promotion card", () => {
	const payload = buildPromotionCard(opts)
	const container = payload.components[0] as ContainerBuilder

	it("text content names the curator", () => {
		const content = texts(container)
			.map((t) => t.content)
			.join("\n")
		expect(content).toContain(opts.displayName)
	})
	it("text content shows the tier label", () => {
		const content = texts(container)
			.map((t) => t.content)
			.join("\n")
		expect(content).toContain(tierLabel(opts.tier))
	})
	it("text content shows the rank", () => {
		const content = texts(container)
			.map((t) => t.content)
			.join("\n")
		expect(content).toContain(String(opts.rank))
	})
	it("renders the avatar as a thumbnail", () => {
		const thumbs = thumbnails(container)
		expect(thumbs).toHaveLength(1)
		expect(thumbs[0]?.media.url).toBe(opts.avatarUrl)
	})
	it("sets the accent color", () => {
		expect(rootJson(container).accent_color).toBe(PALETTE.betterLyricsRed)
	})
	it("flags are non-ephemeral components v2", () => {
		expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
	})
})
