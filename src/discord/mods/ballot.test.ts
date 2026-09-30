import { describe, expect, it } from "vitest"
import { isVotingOpen, pickPages, rankApplicants, supportBar } from "./ballot"

const ALICE = "284091471239512064"
const BOB = "719388223508070471"
const CARA = "1049311214321823774"

describe("rankApplicants", () => {
	describe("happy paths", () => {
		it("orders by support, highest first", () => {
			const ranked = rankApplicants([
				{ discordId: ALICE, support: 2, submittedAt: 1 },
				{ discordId: BOB, support: 7, submittedAt: 2 },
				{ discordId: CARA, support: 4, submittedAt: 3 },
			])
			expect(ranked.map((r) => r.discordId)).toEqual([BOB, CARA, ALICE])
			expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
		})
	})

	describe("edge cases", () => {
		it("returns an empty list for no applicants", () => {
			expect(rankApplicants([])).toEqual([])
		})

		it("ranks a single applicant first even with zero support", () => {
			expect(rankApplicants([{ discordId: ALICE, support: 0, submittedAt: 5 }])).toEqual([
				{ discordId: ALICE, support: 0, submittedAt: 5, rank: 1 },
			])
		})

		it("shares a rank on a tie and skips the next rank", () => {
			const ranked = rankApplicants([
				{ discordId: ALICE, support: 3, submittedAt: 1 },
				{ discordId: BOB, support: 3, submittedAt: 2 },
				{ discordId: CARA, support: 1, submittedAt: 3 },
			])
			expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3])
		})

		it("lists tied applicants by who applied first", () => {
			const ranked = rankApplicants([
				{ discordId: BOB, support: 3, submittedAt: 20 },
				{ discordId: ALICE, support: 3, submittedAt: 10 },
			])
			expect(ranked.map((r) => r.discordId)).toEqual([ALICE, BOB])
		})

		it("falls back to discord id when support and time both tie", () => {
			const ranked = rankApplicants([
				{ discordId: BOB, support: 1, submittedAt: 10 },
				{ discordId: ALICE, support: 1, submittedAt: 10 },
			])
			expect(ranked.map((r) => r.discordId)).toEqual([ALICE, BOB])
		})
	})

	describe("invariants", () => {
		it("never mutates its input", () => {
			const input = [
				{ discordId: ALICE, support: 1, submittedAt: 1 },
				{ discordId: BOB, support: 9, submittedAt: 2 },
			]
			const snapshot = structuredClone(input)
			rankApplicants(input)
			expect(input).toEqual(snapshot)
		})

		it("gives the same order whatever the input order", () => {
			const a = { discordId: ALICE, support: 2, submittedAt: 1 }
			const b = { discordId: BOB, support: 2, submittedAt: 2 }
			const c = { discordId: CARA, support: 5, submittedAt: 3 }
			expect(rankApplicants([a, b, c])).toEqual(rankApplicants([c, b, a]))
		})

		it("keeps ranks non-decreasing down the list", () => {
			const ranked = rankApplicants([
				{ discordId: ALICE, support: 0, submittedAt: 1 },
				{ discordId: BOB, support: 4, submittedAt: 2 },
				{ discordId: CARA, support: 4, submittedAt: 3 },
			])
			for (let i = 1; i < ranked.length; i++) {
				expect(ranked[i]?.rank).toBeGreaterThanOrEqual(ranked[i - 1]?.rank ?? 0)
			}
		})
	})
})

describe("supportBar", () => {
	describe("happy paths", () => {
		it("fills the bar in proportion to the top count", () => {
			expect(supportBar(5, 10)).toBe("▰▰▰▰▰▱▱▱▱▱")
		})

		it("fills the whole bar for the leader", () => {
			expect(supportBar(8, 8)).toBe("▰▰▰▰▰▰▰▰▰▰")
		})
	})

	describe("edge cases", () => {
		it("is empty when nobody has support yet", () => {
			expect(supportBar(0, 0)).toBe("▱▱▱▱▱▱▱▱▱▱")
		})

		it("shows at least one block for any non-zero support", () => {
			expect(supportBar(1, 1000)).toBe("▰▱▱▱▱▱▱▱▱▱")
		})

		it("rounds to the nearest block", () => {
			expect(supportBar(2, 3)).toBe("▰▰▰▰▰▰▰▱▱▱")
		})
	})

	describe("invariants", () => {
		it("is always ten blocks wide", () => {
			for (const [n, max] of [
				[0, 0],
				[1, 3],
				[3, 3],
				[7, 13],
			] as const) {
				expect([...supportBar(n, max)]).toHaveLength(10)
			}
		})
	})

	describe("error paths", () => {
		it("clamps a count above the max to a full bar", () => {
			expect(supportBar(12, 10)).toBe("▰▰▰▰▰▰▰▰▰▰")
		})
	})
})

describe("isVotingOpen", () => {
	const closesAt = 1_790_000_000_000

	it("is open while the session is open and the close time has not passed", () => {
		expect(isVotingOpen({ state: "open", closesAt }, closesAt - 1)).toBe(true)
	})

	describe("edge cases", () => {
		it("closes exactly at the close time", () => {
			expect(isVotingOpen({ state: "open", closesAt }, closesAt)).toBe(false)
		})

		it("regression: refuses votes after the close time even before the hourly close runs", () => {
			expect(isVotingOpen({ state: "open", closesAt }, closesAt + 60_000)).toBe(false)
		})
	})

	describe("error paths", () => {
		it("is shut for a closed session", () => {
			expect(isVotingOpen({ state: "closed", closesAt }, closesAt - 1)).toBe(false)
		})

		it("is shut for a finalized session", () => {
			expect(isVotingOpen({ state: "finalized", closesAt }, closesAt - 1)).toBe(false)
		})
	})
})

describe("pickPages", () => {
	function tallies(n: number) {
		return Array.from({ length: n }, (_, i) => ({
			discordId: `1300000000000000${String(i).padStart(3, "0")}`,
			support: n - i,
			submittedAt: i,
		}))
	}

	it("splits ranked applicants into pages of 25", () => {
		const pages = pickPages(tallies(30))
		expect(pages.map((p) => p.length)).toEqual([25, 5])
		expect(pages[0]?.[0]?.discordId).toBe("1300000000000000000")
	})

	describe("edge cases", () => {
		it("has no pages for no applicants", () => {
			expect(pickPages([])).toEqual([])
		})

		it("fills exactly one page at 25", () => {
			expect(pickPages(tallies(25)).map((p) => p.length)).toEqual([25])
		})

		it("stops at four pages", () => {
			expect(pickPages(tallies(120)).map((p) => p.length)).toEqual([25, 25, 25, 25])
		})
	})

	describe("invariants", () => {
		it("never puts one applicant on two pages", () => {
			const ids = pickPages(tallies(80))
				.flat()
				.map((a) => a.discordId)
			expect(new Set(ids).size).toBe(ids.length)
		})

		it("keeps rank order across pages", () => {
			const supports = pickPages(tallies(60))
				.flat()
				.map((a) => a.support)
			expect(supports).toEqual([...supports].sort((a, b) => b - a))
		})
	})
})

describe("cross-field interactions", () => {
	it("ranks by support while bars scale to the leader's count", () => {
		const ranked = rankApplicants([
			{ discordId: ALICE, support: 5, submittedAt: 2 },
			{ discordId: BOB, support: 10, submittedAt: 1 },
		])
		const top = ranked[0]?.support ?? 0
		expect(ranked.map((r) => [r.discordId, r.rank, supportBar(r.support, top)])).toEqual([
			[BOB, 1, "▰▰▰▰▰▰▰▰▰▰"],
			[ALICE, 2, "▰▰▰▰▰▱▱▱▱▱"],
		])
	})

	it("carries extra fields through ranking and paging", () => {
		const [page] = pickPages([{ discordId: ALICE, support: 1, submittedAt: 1, picked: true }])
		expect(page?.[0]).toEqual({
			discordId: ALICE,
			support: 1,
			submittedAt: 1,
			picked: true,
			rank: 1,
		})
	})
})
