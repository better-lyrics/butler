import { examIntroCatch, examIntroExam } from "@/copy/strings"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildCouncilWelcomeCard, buildExamIntroCard } from "./exam-card"

const GETTING_STARTED = "https://discord.com/channels/1/2/3"
const GIF = "https://cdn.betterlyrics.org/bb-hell-yeah.gif"
const EXAM_URL = "https://unison.betterlyrics.org/exam/abc"
const GUIDE_URL = "https://betterlyrics.org/lyric-guide"

describe("buildExamIntroCard", () => {
	function card() {
		return buildExamIntroCard({
			examUrl: EXAM_URL,
			guideUrl: GUIDE_URL,
			expiresAt: 1_789_000_000,
		})
	}

	it("is a Components V2 card that suppresses mentions", () => {
		const c = card()
		expect(c.flags).toBe(MessageFlags.IsComponentsV2)
		expect(c.allowedMentions).toEqual({ parse: [] })
	})

	it("renders the three intro beats and both link buttons", () => {
		const json = JSON.stringify(card())
		expect(json).toContain("The Council is an elite team that seals rare, exceptional lyrics.")
		expect(json).toContain(examIntroCatch)
		expect(json).toContain(examIntroExam)
		expect(json).toContain(EXAM_URL)
		expect(json).toContain(GUIDE_URL)
	})
})

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
