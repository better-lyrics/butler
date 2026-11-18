import { PALETTE } from "@/config"
import {
	announceSummaryBadgeLine,
	announceSummaryBadgesLabel,
	announceSummaryPromotionLine,
	announceSummaryPromotionsLabel,
	tierLabel,
} from "@/copy/strings"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildAnnounceSummaryCards } from "./announce-summary-card"
import { MAX_MESSAGE_TEXT } from "./limits"

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

function entryLines(container: ContainerBuilder): string[] {
	return textBlob(container)
		.split("\n")
		.filter((line) => line.startsWith("- "))
}

function single(opts: Parameters<typeof buildAnnounceSummaryCards>[0]) {
	const [payload, ...rest] = buildAnnounceSummaryCards(opts)
	if (!payload || rest.length > 0) throw new Error("expected exactly one summary message")
	return payload
}

const promotions = [
	{ displayName: "Sofia", tier: "legendary" },
	{ displayName: "Milo", tier: "elite" },
]

const badges = [
	{ displayName: "Priya", badgeName: "First Sync" },
	{ displayName: "Theo", badgeName: "Century" },
]

describe("announce summary card", () => {
	describe("both sections", () => {
		const payload = single({ promotions, badges })
		const container = payload.components[0] as ContainerBuilder

		it("renders both section labels", () => {
			const blob = textBlob(container)
			expect(blob).toContain(announceSummaryPromotionsLabel)
			expect(blob).toContain(announceSummaryBadgesLabel)
		})
		it("lists one entry per promotion using display names and tier labels", () => {
			const blob = textBlob(container)
			for (const p of promotions) {
				expect(blob).toContain(announceSummaryPromotionLine(p))
				expect(blob).toContain(p.displayName)
				expect(blob).toContain(tierLabel(p.tier))
			}
		})
		it("lists one entry per badge using display names and badge names", () => {
			const blob = textBlob(container)
			for (const b of badges) {
				expect(blob).toContain(announceSummaryBadgeLine(b))
				expect(blob).toContain(b.displayName)
				expect(blob).toContain(b.badgeName)
			}
		})
		it("renders exactly one line per promotion and per badge", () => {
			expect(entryLines(container)).toHaveLength(promotions.length + badges.length)
		})
		it("never mentions members, to avoid a mass ping", () => {
			expect(textBlob(container)).not.toContain("<@")
		})
		it("separates the two sections with a divider", () => {
			expect(separators(container)).toHaveLength(2)
		})
		it("sets the accent color", () => {
			expect(rootJson(container).accent_color).toBe(PALETTE.betterLyricsRed)
		})
		it("flags are non-ephemeral components v2", () => {
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("empty sections are omitted", () => {
		it("omits the promotions section when there are no promotions", () => {
			const container = single({ promotions: [], badges }).components[0] as ContainerBuilder
			const blob = textBlob(container)
			expect(blob).not.toContain(announceSummaryPromotionsLabel)
			expect(blob).toContain(announceSummaryBadgesLabel)
			expect(entryLines(container)).toHaveLength(badges.length)
			expect(separators(container)).toHaveLength(1)
		})
		it("omits the badges section when there are no badges", () => {
			const container = single({ promotions, badges: [] }).components[0] as ContainerBuilder
			const blob = textBlob(container)
			expect(blob).toContain(announceSummaryPromotionsLabel)
			expect(blob).not.toContain(announceSummaryBadgesLabel)
			expect(entryLines(container)).toHaveLength(promotions.length)
			expect(separators(container)).toHaveLength(1)
		})
	})

	describe("long summaries", () => {
		const manyPromotions = Array.from({ length: 300 }, (_, i) => ({
			displayName: `curator_${i}`,
			tier: "lyricist",
		}))
		const manyBadges = Array.from({ length: 40 }, (_, i) => ({
			displayName: `curator_${i}`,
			badgeName: "Sharp Ear",
		}))
		const payloads = buildAnnounceSummaryCards({ promotions: manyPromotions, badges: manyBadges })
		const containers = payloads.map((p) => p.components[0] as ContainerBuilder)

		it("regression: splits into several messages, each within the message text limit", () => {
			expect(payloads.length).toBeGreaterThan(1)
			for (const container of containers) {
				const length = texts(container).reduce((sum, t) => sum + t.content.length, 0)
				expect(length).toBeLessThanOrEqual(MAX_MESSAGE_TEXT)
			}
		})
		it("keeps every entry exactly once and in order across the messages", () => {
			const expected = [
				...manyPromotions.map((p) => announceSummaryPromotionLine(p)),
				...manyBadges.map((b) => announceSummaryBadgeLine(b)),
			]
			expect(containers.flatMap(entryLines)).toEqual(expected)
		})
		it("labels each section again in the message it continues into", () => {
			for (const container of containers) {
				const lines = entryLines(container)
				const blob = textBlob(container)
				if (lines.some((l) => l.includes(" reached "))) {
					expect(blob).toContain(announceSummaryPromotionsLabel)
				}
				if (lines.some((l) => l.includes(" earned "))) {
					expect(blob).toContain(announceSummaryBadgesLabel)
				}
			}
		})
	})

	describe("edge cases", () => {
		it("returns no messages when there is nothing to announce", () => {
			expect(buildAnnounceSummaryCards({ promotions: [], badges: [] })).toEqual([])
		})
	})
})
