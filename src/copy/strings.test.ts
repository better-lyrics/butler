import { describe, expect, it } from "vitest"
import {
	promotionStats,
	promotionSubtitle,
	promotionTitle,
	reportHelp,
	selfFixInstructions,
	tierLabel,
} from "./strings"

const discordId = "111222333444555666"
const mention = `<@${discordId}>`
const tiers = ["legendary", "grandmaster", "master", "elite", "lyricist"]

describe("promotionTitle", () => {
	describe("happy paths", () => {
		it("pings the curator in every tier", () => {
			for (const tier of tiers) {
				expect(promotionTitle({ discordId, tier })).toContain(mention)
			}
		})

		it("ends every tier title with an exclamation", () => {
			for (const tier of tiers) {
				expect(promotionTitle({ discordId, tier }).endsWith("!")).toBe(true)
			}
		})

		it("gives every tier a distinct title", () => {
			const titles = tiers.map((tier) => promotionTitle({ discordId, tier }))
			expect(new Set(titles).size).toBe(tiers.length)
		})

		it("frames the podium titles by their absolute rank", () => {
			expect(promotionTitle({ discordId, tier: "legendary" })).toContain("top spot")
			expect(promotionTitle({ discordId, tier: "master" })).toContain("top three")
		})
	})

	describe("edge cases", () => {
		it("falls back to the tier label for an unknown tier", () => {
			const line = promotionTitle({ discordId, tier: "wizard" })
			expect(line).toContain(mention)
			expect(line).toContain(tierLabel("wizard"))
		})
	})
})

describe("promotionSubtitle", () => {
	it("names the tier without exposing a raw percentile", () => {
		expect(promotionSubtitle("elite")).toContain("sharpest")
		expect(promotionSubtitle("grandmaster")).toContain("Second")
		for (const tier of tiers) {
			expect(promotionSubtitle(tier).length).toBeGreaterThan(0)
		}
	})

	it("returns an empty string for an unknown tier", () => {
		expect(promotionSubtitle("wizard")).toBe("")
	})

	it("never exposes a raw percentile in a title or subtitle", () => {
		for (const tier of tiers) {
			expect(promotionTitle({ discordId, tier })).not.toContain("%")
			expect(promotionSubtitle(tier)).not.toContain("%")
		}
	})
})

describe("self-fix copy", () => {
	it("names Composer as a proper noun, never 'the composer'", () => {
		for (const line of [reportHelp, selfFixInstructions]) {
			expect(line).toContain("Composer")
			expect(line.toLowerCase()).not.toContain("the composer")
		}
	})

	it("walks the user from Composer to the Unison upload button", () => {
		expect(selfFixInstructions).toContain("Composer")
		expect(selfFixInstructions).toContain("YouTube Music")
		expect(selfFixInstructions).toContain("Submit lyrics with Unison")
	})
})

describe("promotionStats", () => {
	describe("happy paths", () => {
		it("shows the rank with a hash prefix", () => {
			expect(promotionStats({ rank: 3, submissionCount: 42, totalUpvotes: 100 })).toContain(
				"Rank #3"
			)
		})

		it("adds thousands separators to large counts", () => {
			const line = promotionStats({ rank: 1, submissionCount: 1234, totalUpvotes: 56789 })
			expect(line).toContain("1,234 submissions")
			expect(line).toContain("56,789 upvotes")
		})
	})

	describe("edge cases", () => {
		it("uses the singular noun for a count of one", () => {
			const line = promotionStats({ rank: 9, submissionCount: 1, totalUpvotes: 1 })
			expect(line).toContain("1 submission")
			expect(line).not.toContain("1 submissions")
			expect(line).toContain("1 upvote")
			expect(line).not.toContain("1 upvotes")
		})

		it("uses the plural noun for zero", () => {
			const line = promotionStats({ rank: 50, submissionCount: 0, totalUpvotes: 0 })
			expect(line).toContain("0 submissions")
			expect(line).toContain("0 upvotes")
		})
	})
})
