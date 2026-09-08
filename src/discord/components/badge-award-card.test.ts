import { PALETTE } from "@/config"
import { badgeAwardTitle } from "@/copy/strings"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildBadgeAwardCard } from "./badge-award-card"

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

function sections(container: ContainerBuilder): ComponentNode[] {
	return collect(container).filter((n) => n.type === 9)
}

function textBlob(container: ContainerBuilder): string {
	return texts(container)
		.map((t) => t.content)
		.join("\n")
}

const opts = {
	discordId: "111222333444555666",
	avatarUrl: "https://avatar.example.com/sofia.png",
	badgeName: "Nightingale Streak",
	badgeDescription: "Synced lyrics seven days running without a miss.",
}

describe("badge award card", () => {
	describe("happy paths", () => {
		const payload = buildBadgeAwardCard(opts)
		const container = payload.components[0] as ContainerBuilder

		it("pings the member with a discord mention", () => {
			expect(textBlob(container)).toContain(`<@${opts.discordId}>`)
		})
		it("renders the headline in bold from the copy helper", () => {
			expect(textBlob(container)).toContain(
				`**${badgeAwardTitle({ discordId: opts.discordId, badgeName: opts.badgeName })}**`
			)
		})
		it("shows the badge name and description from the inputs", () => {
			const blob = textBlob(container)
			expect(blob).toContain(opts.badgeName)
			expect(blob).toContain(opts.badgeDescription)
		})
		it("puts the avatar next to the description", () => {
			const thumbs = thumbnails(container)
			expect(thumbs).toHaveLength(1)
			expect(thumbs[0]?.media.url).toBe(opts.avatarUrl)
			expect(sections(container)).toHaveLength(1)
			const sectionText = (sections(container)[0]?.components ?? [])
				.map((c) => c.content ?? "")
				.join("\n")
			expect(sectionText).toContain(opts.badgeDescription)
		})
		it("sets the accent color", () => {
			expect(rootJson(container).accent_color).toBe(PALETTE.betterLyricsRed)
		})
		it("flags are non-ephemeral components v2", () => {
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("generic rendering", () => {
		it("renders whatever name and description the catalogue supplies", () => {
			const container = buildBadgeAwardCard({
				discordId: "999888777666555444",
				avatarUrl: null,
				badgeName: "Zephyr Cartographer",
				badgeDescription: "Charted lyrics across twelve languages.",
			}).components[0] as ContainerBuilder
			const blob = textBlob(container)
			expect(blob).toContain("Zephyr Cartographer")
			expect(blob).toContain("Charted lyrics across twelve languages.")
			expect(blob).not.toContain(opts.badgeName)
			expect(blob).not.toContain(opts.badgeDescription)
		})
	})

	describe("edge cases", () => {
		for (const avatarUrl of [null, ""] as const) {
			it(`drops the avatar section when avatarUrl is ${JSON.stringify(avatarUrl)}`, () => {
				const container = buildBadgeAwardCard({ ...opts, avatarUrl })
					.components[0] as ContainerBuilder
				expect(thumbnails(container)).toHaveLength(0)
				expect(sections(container)).toHaveLength(0)
				const blob = textBlob(container)
				expect(blob).toContain(`<@${opts.discordId}>`)
				expect(blob).toContain(opts.badgeName)
				expect(blob).toContain(opts.badgeDescription)
			})
		}
	})
})
