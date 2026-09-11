import { describe, expect, it } from "vitest"
import {
	announceSummaryBadgeLine,
	announceSummaryPromotionLine,
	badgeAwardTitle,
	examApplicantFullMarks,
	examApplicantGrade,
	examApplicantMisses,
	examApplicantScore,
	examApplicantVerdict,
	migrateExpiresLine,
	migratePreviewBody,
	migratePreviewCollisions,
	promotionStats,
	promotionSubtitle,
	promotionTitle,
	reportHelp,
	sealQuotaSummary,
	sealResetsLine,
	sealVariantDescription,
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

	it("prefixes each tier subtitle with its custom emoji", () => {
		expect(promotionSubtitle("legendary")).toContain("<a:PogFishAnimated:1519140120014622731>")
		expect(promotionSubtitle("grandmaster")).toContain("<a:pogseizure:1519140203304845403>")
		expect(promotionSubtitle("master")).toContain("<a:CatInsanity:1519139827419709450>")
		expect(promotionSubtitle("lyricist")).toContain("<:blobcat_flower:1516783964092760095>")
	})

	it("uses animated emoji syntax for the animated tiers", () => {
		for (const tier of ["legendary", "grandmaster", "master", "elite"]) {
			expect(promotionSubtitle(tier)).toContain("<a:")
		}
		expect(promotionSubtitle("elite")).toContain("<a:bussin:1516783244291477630>")
	})

	it("keeps the lyricist tier emoji static", () => {
		expect(promotionSubtitle("lyricist")).toContain("<:blobcat_flower:")
		expect(promotionSubtitle("lyricist")).not.toContain("<a:")
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

describe("badgeAwardTitle", () => {
	it("pings the curator and names the badge", () => {
		const line = badgeAwardTitle({ discordId, badgeName: "Night Owl" })
		expect(line).toContain(mention)
		expect(line).toContain("Night Owl")
		expect(line.endsWith("!")).toBe(true)
	})
})

describe("announceSummaryPromotionLine", () => {
	describe("happy paths", () => {
		it("prefixes a known tier with its custom emoji and the tier label", () => {
			const line = announceSummaryPromotionLine({ displayName: "boidu", tier: "legendary" })
			expect(line).toContain("<a:PogFishAnimated:1519140120014622731>")
			expect(line).toContain("**boidu**")
			expect(line).toContain(tierLabel("legendary"))
		})

		it("starts each line as a markdown bullet", () => {
			for (const tier of tiers) {
				expect(announceSummaryPromotionLine({ displayName: "boidu", tier }).startsWith("- ")).toBe(
					true
				)
			}
		})
	})

	describe("edge cases", () => {
		it("drops the emoji lead for a tier with no custom emoji", () => {
			const line = announceSummaryPromotionLine({ displayName: "boidu", tier: "wizard" })
			expect(line).toBe(`- **boidu** reached ${tierLabel("wizard")}`)
			expect(line).not.toContain("<")
		})
	})
})

describe("announceSummaryBadgeLine", () => {
	it("names the curator and the badge as a markdown bullet", () => {
		const line = announceSummaryBadgeLine({ displayName: "boidu", badgeName: "Night Owl" })
		expect(line).toBe("- **boidu** earned Night Owl")
	})
})

describe("migratePreviewBody", () => {
	it("names the new key the account moves onto", () => {
		expect(migratePreviewBody("swift-otter")).toContain("new key `swift-otter`")
	})

	it("keeps the everything-moves framing", () => {
		expect(migratePreviewBody("3d71d3")).toContain("You keep everything below")
	})
})

describe("migratePreviewCollisions", () => {
	it("names votes, reports, and requests as the droppable duplicates", () => {
		expect(migratePreviewCollisions(2)).toContain("(vote, report, or request)")
	})

	it("returns null when there is nothing to drop", () => {
		expect(migratePreviewCollisions(0)).toBeNull()
	})
})

describe("migrateExpiresLine", () => {
	it("embeds the relative discord timestamp token so the user sees the countdown", () => {
		expect(migrateExpiresLine("<t:1788394920:R>")).toContain("<t:1788394920:R>")
	})

	it("frames the timestamp as the migration expiry while the window is active", () => {
		expect(migrateExpiresLine("<t:1788394920:R>")).toContain("This migration expires")
	})
})

describe("sealQuotaSummary", () => {
	describe("happy paths", () => {
		it("states used out of quota and what is left", () => {
			const line = sealQuotaSummary({ quota: 8, used: 3, remaining: 5 })
			expect(line).toContain("3 of 8 seals used this month")
			expect(line).toContain("5 left")
		})
	})

	describe("edge cases", () => {
		it("reads correctly at a full quota with nothing left", () => {
			const line = sealQuotaSummary({ quota: 4, used: 4, remaining: 0 })
			expect(line).toContain("4 of 4 seals used this month")
			expect(line).toContain("0 left")
		})

		it("reads correctly for a fresh quota with nothing used", () => {
			expect(sealQuotaSummary({ quota: 6, used: 0, remaining: 6 })).toContain(
				"0 of 6 seals used this month"
			)
		})
	})
})

describe("sealResetsLine", () => {
	it("embeds the reset instant as a relative discord timestamp token", () => {
		expect(sealResetsLine(1_790_000_000)).toBe("Resets <t:1790000000:R>.")
	})
})

describe("sealVariantDescription", () => {
	describe("happy paths", () => {
		it("joins artist, format, submitter, and score with a middle dot", () => {
			const line = sealVariantDescription({
				artist: "Deftones",
				format: "ttml",
				score: 42,
				submitterName: "quiet-fern",
			})
			expect(line).toBe("Deftones · ttml · quiet-fern · score 42")
		})
	})

	describe("edge cases", () => {
		it("drops the submitter segment when the name is unknown", () => {
			const line = sealVariantDescription({
				artist: "Deftones",
				format: "lrc",
				score: 0,
				submitterName: null,
			})
			expect(line).toBe("Deftones · lrc · score 0")
		})
	})
})

const fullBreakdown = [
	{ section: "a-vs-b", score: 6, max: 10 },
	{ section: "capstone", score: 60, max: 60 },
	{ section: "is-exceptional", score: 24, max: 24 },
	{ section: "scenario", score: 9, max: 9 },
	{ section: "seal-discipline", score: 6, max: 6 },
	{ section: "seal-or-not", score: 20, max: 20 },
	{ section: "trap-exception", score: 6, max: 6 },
	{ section: "what-holds-back", score: 10, max: 10 },
]

describe("examApplicantScore", () => {
	it("reads passed above the cutoff", () => {
		expect(
			examApplicantScore({ score: 141, maxScore: 145, cutoff: 123.25, belowCutoff: false })
		).toBe("Score: 141 / 145 (cutoff 123.25), passed")
	})

	it("reads below cutoff for a near miss", () => {
		expect(
			examApplicantScore({ score: 120, maxScore: 145, cutoff: 123.25, belowCutoff: true })
		).toBe("Score: 120 / 145 (cutoff 123.25), below cutoff")
	})
})

describe("examApplicantGrade", () => {
	describe("happy paths", () => {
		it("grades 141/145 as A+", () => {
			expect(examApplicantGrade(141, 145)).toBe("A+")
		})

		it("walks the ladder down through the bands", () => {
			expect(examApplicantGrade(93, 100)).toBe("A")
			expect(examApplicantGrade(90, 100)).toBe("A-")
			expect(examApplicantGrade(87, 100)).toBe("B+")
			expect(examApplicantGrade(83, 100)).toBe("B")
			expect(examApplicantGrade(80, 100)).toBe("B-")
			expect(examApplicantGrade(70, 100)).toBe("C")
			expect(examApplicantGrade(60, 100)).toBe("D")
			expect(examApplicantGrade(59, 100)).toBe("F")
		})
	})

	describe("edge cases", () => {
		it("does not divide by zero on an empty exam", () => {
			expect(examApplicantGrade(0, 0)).toBe("F")
		})

		it("gives a perfect score the top grade", () => {
			expect(examApplicantGrade(145, 145)).toBe("A+")
		})
	})
})

describe("examApplicantVerdict", () => {
	describe("happy paths", () => {
		it("names the dropped section and its point loss for a strong pass", () => {
			const line = examApplicantVerdict({
				score: 141,
				maxScore: 145,
				cutoff: 123.25,
				breakdown: fullBreakdown,
			})
			expect(line).toContain("**Butler verdict: A+**")
			expect(line).toContain("Lost 4 points on A vs b (6/10)")
			expect(line).toContain("Ready for the Council")
		})

		it("calls out full marks when nothing was missed", () => {
			const perfect = fullBreakdown.map((r) => ({ ...r, score: r.max }))
			const line = examApplicantVerdict({
				score: 145,
				maxScore: 145,
				cutoff: 123.25,
				breakdown: perfect,
			})
			expect(line).toContain("Full marks across every section")
			expect(line).toContain("Ready for the Council")
		})
	})

	describe("edge cases", () => {
		it("says not there yet and names the weakest sections below the cutoff", () => {
			const weak = [
				{ section: "a-vs-b", score: 2, max: 10 },
				{ section: "capstone", score: 30, max: 60 },
				{ section: "seal-or-not", score: 20, max: 20 },
			]
			const line = examApplicantVerdict({ score: 52, maxScore: 90, cutoff: 76, breakdown: weak })
			expect(line).toContain("Came up short of the 76 bar")
			expect(line).toContain("Not there yet")
			expect(line).toContain("Capstone (30/60)")
		})

		it("uses singular point when only one was lost", () => {
			const oneOff = [{ section: "scenario", score: 8, max: 9 }]
			const line = examApplicantVerdict({ score: 8, maxScore: 9, cutoff: 6, breakdown: oneOff })
			expect(line).toContain("Lost 1 point on Scenario (8/9)")
		})
	})
})

describe("examApplicantMisses and examApplicantFullMarks", () => {
	it("lists only the dropped sections under a needs-a-look header, with a blurb", () => {
		const misses = examApplicantMisses(fullBreakdown)
		expect(misses).toContain("**Needs a look**")
		expect(misses).toContain(
			"**A vs b** (6/10): picking which of two syncs tracks the vocal better"
		)
		expect(misses).not.toContain("Capstone")
	})

	it("renders an unknown section without a trailing blurb", () => {
		const misses = examApplicantMisses([{ section: "mystery-box", score: 1, max: 2 }])
		expect(misses).toContain("**Mystery box** (1/2)")
		expect(misses).not.toContain("**Mystery box** (1/2):")
	})

	it("returns null when every section is perfect", () => {
		const perfect = fullBreakdown.map((r) => ({ ...r, score: r.max }))
		expect(examApplicantMisses(perfect)).toBeNull()
	})

	it("rolls perfect sections into one comma list", () => {
		const full = examApplicantFullMarks(fullBreakdown)
		expect(full).toContain("**Full marks**")
		expect(full).toContain("Capstone, Is exceptional")
		expect(full).not.toContain("A vs b")
	})

	it("returns null when nothing was full marks", () => {
		const allMissed = fullBreakdown.map((r) => ({ ...r, score: 0 }))
		expect(examApplicantFullMarks(allMissed)).toBeNull()
	})
})
