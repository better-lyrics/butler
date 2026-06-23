import { describe, expect, it } from "vitest"
import { promotionHeadline, promotionStats, tierLabel } from "./strings"

const discordId = "111222333444555666"
const mention = `<@${discordId}>`
const tiers = ["legendary", "grandmaster", "master", "elite", "lyricist"]

describe("promotionHeadline", () => {
	describe("happy paths", () => {
		it("pings the curator with a discord mention in every tier", () => {
			for (const tier of tiers) {
				expect(promotionHeadline({ discordId, tier })).toContain(mention)
			}
		})

		it("gives every tier a distinct line", () => {
			const lines = tiers.map((tier) => promotionHeadline({ discordId, tier }))
			expect(new Set(lines).size).toBe(tiers.length)
		})

		it("frames the podium tiers by their absolute rank", () => {
			expect(promotionHeadline({ discordId, tier: "legendary" })).toContain("top spot")
			expect(promotionHeadline({ discordId, tier: "grandmaster" })).toContain("Second")
			expect(promotionHeadline({ discordId, tier: "master" })).toContain("top three")
		})

		it("frames the banded tiers by their real percentile thresholds", () => {
			expect(promotionHeadline({ discordId, tier: "elite" })).toContain("Top 5%")
			expect(promotionHeadline({ discordId, tier: "lyricist" })).toContain("top 20%")
		})
	})

	describe("edge cases", () => {
		it("falls back to the tier label for an unknown tier", () => {
			const line = promotionHeadline({ discordId, tier: "wizard" })
			expect(line).toContain(mention)
			expect(line).toContain(tierLabel("wizard"))
		})
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
