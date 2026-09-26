import {
	examApplicantScore,
	examApprovedLine,
	examIntroCatch,
	examIntroExam,
	examIntroWarning,
	examRejectedLine,
	examReportBelowCutoff,
	examReportPending,
} from "@/copy/strings"
import type { ExamApplicant } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	buildApplicantApprovedCard,
	buildApplicantRejectedCard,
	buildApplicantReportCard,
	buildCouncilWelcomeCard,
	buildExamIntroCard,
} from "./exam-card"

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

	it("renders the intro beats, the confidentiality warning, and both link buttons", () => {
		const json = JSON.stringify(card())
		expect(json).toContain("The Council is an elite team that seals rare, exceptional lyrics.")
		expect(json).toContain(examIntroCatch)
		expect(json).toContain(examIntroExam)
		expect(json).toContain(examIntroWarning)
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

const APPLICANT = "123456789012345678"
const ADMIN = "999999999999999999"

function report(overrides: Partial<ExamApplicant> = {}): ExamApplicant {
	return {
		applicantId: "sess-1",
		discordId: APPLICANT,
		keyId: "a".repeat(64),
		displayName: "quiet-fern",
		score: 90,
		maxScore: 100,
		cutoff: 85,
		breakdown: [
			{ section: "timing", score: 4, max: 5 },
			{ section: "standards", score: 5, max: 5 },
		],
		submittedAt: 1_789_000_000,
		state: "pending_review",
		decidedAt: null,
		decidedByDiscordId: null,
		...overrides,
	}
}

const SCORE_LINE = examApplicantScore({ score: 90, maxScore: 100, cutoff: 85, belowCutoff: false })

describe("decided applicant cards", () => {
	it("keeps the report on the approved card above the decision", () => {
		const json = JSON.stringify(
			buildApplicantApprovedCard({
				discordId: APPLICANT,
				adminId: ADMIN,
				role: "done",
				report: report(),
			})
		)
		expect(json).toContain(SCORE_LINE)
		expect(json).toContain("Needs a look")
		expect(json).toContain(examApprovedLine({ discordId: APPLICANT, adminId: ADMIN }))
		expect(json.indexOf(SCORE_LINE)).toBeLessThan(json.indexOf("approved by"))
	})

	it("keeps the report on the rejected card", () => {
		const json = JSON.stringify(
			buildApplicantRejectedCard({ discordId: APPLICANT, adminId: ADMIN, report: report() })
		)
		expect(json).toContain(SCORE_LINE)
		expect(json).toContain(examRejectedLine({ discordId: APPLICANT, adminId: ADMIN }))
	})

	describe("invariants", () => {
		it("never carries decision buttons once decided", () => {
			for (const card of [
				buildApplicantApprovedCard({
					discordId: APPLICANT,
					adminId: ADMIN,
					role: "done",
					report: report(),
				}),
				buildApplicantRejectedCard({ discordId: APPLICANT, adminId: ADMIN, report: report() }),
			]) {
				expect(JSON.stringify(card)).not.toContain("exam.approve")
				expect(JSON.stringify(card)).not.toContain("exam.reject")
			}
		})
	})

	describe("edge cases", () => {
		it("still shows the decision when the report is unavailable", () => {
			const json = JSON.stringify(
				buildApplicantApprovedCard({
					discordId: APPLICANT,
					adminId: ADMIN,
					role: "done",
					report: null,
				})
			)
			expect(json).toContain(examApprovedLine({ discordId: APPLICANT, adminId: ADMIN }))
			expect(json).not.toContain("Score:")
		})
	})
})

describe("buildApplicantReportCard", () => {
	it("shows the report with who approved it", () => {
		const json = JSON.stringify(
			buildApplicantReportCard(
				report({ state: "approved", decidedByDiscordId: ADMIN, decidedAt: 1 })
			)
		)
		expect(json).toContain(SCORE_LINE)
		expect(json).toContain(examApprovedLine({ discordId: APPLICANT, adminId: ADMIN }))
	})

	it("shows who rejected it", () => {
		const json = JSON.stringify(
			buildApplicantReportCard(
				report({ state: "rejected", decidedByDiscordId: ADMIN, decidedAt: 1 })
			)
		)
		expect(json).toContain(examRejectedLine({ discordId: APPLICANT, adminId: ADMIN }))
	})

	it("marks an undecided attempt as waiting for review", () => {
		expect(JSON.stringify(buildApplicantReportCard(report()))).toContain(examReportPending)
	})

	it("marks an attempt under the cutoff", () => {
		const json = JSON.stringify(buildApplicantReportCard(report({ state: "failed", score: 40 })))
		expect(json).toContain(examReportBelowCutoff)
	})

	describe("invariants", () => {
		it("is view only, with no decision buttons, and suppresses mentions", () => {
			const card = buildApplicantReportCard(report())
			expect(JSON.stringify(card)).not.toContain("exam.approve")
			expect(card.allowedMentions).toEqual({ parse: [] })
		})
	})

	describe("edge cases", () => {
		it("falls back to a plain status when the decider is unknown", () => {
			const json = JSON.stringify(buildApplicantReportCard(report({ state: "approved" })))
			expect(json).toContain(SCORE_LINE)
			expect(json).not.toContain("<@null>")
		})
	})
})
