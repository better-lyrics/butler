import { describe, expect, it } from "vitest"
import { councilItemUrl } from "./council-links"

describe("councilItemUrl", () => {
	it("opens a lyric in the seal queue and a revision in edits", () => {
		expect(councilItemUrl("seal", 4210)).toBe(
			"https://unison.betterlyrics.org/council/queue?item=4210"
		)
		expect(councilItemUrl("edit", 9001)).toBe(
			"https://unison.betterlyrics.org/council/edits?item=9001"
		)
	})

	describe("edge cases", () => {
		it("keeps a zero id", () => {
			expect(councilItemUrl("seal", 0)).toBe("https://unison.betterlyrics.org/council/queue?item=0")
		})
	})
})
