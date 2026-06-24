import { PALETTE } from "@/config"
import { promotionStats, promotionSubtitle, promotionTitle } from "@/copy/strings"
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

function separators(container: ContainerBuilder): ComponentNode[] {
	return collect(container).filter((n) => n.type === 14)
}

function textBlob(container: ContainerBuilder): string {
	return texts(container)
		.map((t) => t.content)
		.join("\n")
}

const opts = {
	discordId: "111222333444555666",
	avatarUrl: "https://avatar.example.com/sofia.png",
	tier: "legendary",
	rank: 1,
	submissionCount: 248,
	totalUpvotes: 1234,
}

describe("promotion card", () => {
	describe("happy paths", () => {
		const payload = buildPromotionCard(opts)
		const container = payload.components[0] as ContainerBuilder

		it("pings the curator with a discord mention", () => {
			expect(textBlob(container)).toContain(`<@${opts.discordId}>`)
		})
		it("renders the title in bold and the subtitle as plain text", () => {
			const blob = textBlob(container)
			expect(blob).toContain(
				`**${promotionTitle({ discordId: opts.discordId, tier: opts.tier })}**`
			)
			expect(blob).toContain(promotionSubtitle(opts.tier))
			expect(blob).not.toContain("## ")
		})
		it("keeps the rank line as a subtext footer", () => {
			const blob = textBlob(container)
			expect(blob).toContain(
				`-# ${promotionStats({ rank: 1, submissionCount: 248, totalUpvotes: 1234 })}`
			)
			expect(blob).toContain("Rank #1")
			expect(blob).toContain("248 submissions")
			expect(blob).toContain("1,234 upvotes")
		})
		it("puts the avatar next to the subtitle, not the title", () => {
			const thumbs = thumbnails(container)
			expect(thumbs).toHaveLength(1)
			expect(thumbs[0]?.media.url).toBe(opts.avatarUrl)
			const section = collect(container).find((n) => n.type === 9)
			const sectionText = (section?.components ?? []).map((c) => c.content ?? "").join("\n")
			expect(sectionText).toContain(promotionSubtitle(opts.tier))
			expect(sectionText).not.toContain(
				promotionTitle({ discordId: opts.discordId, tier: opts.tier })
			)
		})
		it("uses two dividers, around the subtitle", () => {
			expect(separators(container).length).toBe(2)
		})
		it("sets the accent color", () => {
			expect(rootJson(container).accent_color).toBe(PALETTE.betterLyricsRed)
		})
		it("flags are non-ephemeral components v2", () => {
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("per-tier headlines", () => {
		for (const tier of ["legendary", "grandmaster", "master", "elite", "lyricist"]) {
			it(`renders the ${tier} title and subtitle`, () => {
				const container = buildPromotionCard({ ...opts, tier }).components[0] as ContainerBuilder
				const blob = textBlob(container)
				expect(blob).toContain(promotionTitle({ discordId: opts.discordId, tier }))
				expect(blob).toContain(promotionSubtitle(tier))
			})
		}
	})

	describe("edge cases", () => {
		it("falls back to a plain headline when no avatar is available", () => {
			const container = buildPromotionCard({ ...opts, avatarUrl: "" })
				.components[0] as ContainerBuilder
			expect(thumbnails(container)).toHaveLength(0)
			expect(textBlob(container)).toContain(`<@${opts.discordId}>`)
		})
	})
})
