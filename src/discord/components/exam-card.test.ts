import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildCouncilWelcomeCard } from "./exam-card"

const GETTING_STARTED = "https://discord.com/channels/1/2/3"
const GIF = "https://cdn.betterlyrics.org/bb-hell-yeah.gif"

describe("buildCouncilWelcomeCard", () => {
	it("is a Components V2 card", () => {
		const card = buildCouncilWelcomeCard({ gettingStartedUrl: GETTING_STARTED, gifUrl: GIF })
		expect(card.components.length).toBeGreaterThan(0)
		expect(card.flags).toBe(MessageFlags.IsComponentsV2)
	})

	it("carries the getting-started link and the gif in a media gallery", () => {
		const card = buildCouncilWelcomeCard({ gettingStartedUrl: GETTING_STARTED, gifUrl: GIF })
		const json = JSON.stringify(card)
		expect(json).toContain(GETTING_STARTED)
		expect(json).toContain(GIF)
	})

	it("renders both custom emojis by id so they show for a bot", () => {
		const json = JSON.stringify(
			buildCouncilWelcomeCard({ gettingStartedUrl: GETTING_STARTED, gifUrl: GIF })
		)
		expect(json).toContain("1269246856710324275")
		expect(json).toContain("1444330560632783060")
	})
})
