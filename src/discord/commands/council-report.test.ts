import { examReportNone } from "@/copy/strings"
import type { ExamApplicant, ExamReportsResult } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	COUNCIL_APPLICANTS_ERROR,
	COUNCIL_APPLICANTS_GUILD_ONLY,
	COUNCIL_APPLICANTS_NO_PERMISSION,
} from "./council-applicants"
import { councilReportCommand, handleCouncilReport } from "./council-report"

const TARGET = "123456789012345678"

function report(overrides: Partial<ExamApplicant> = {}): ExamApplicant {
	return {
		applicantId: "sess-1",
		discordId: TARGET,
		keyId: "a".repeat(64),
		displayName: "quiet-fern",
		score: 90,
		maxScore: 100,
		cutoff: 85,
		breakdown: [{ section: "timing", score: 4, max: 5 }],
		submittedAt: 1_789_000_000,
		state: "approved",
		decidedAt: 1_789_000_500,
		decidedByDiscordId: "999999999999999999",
		...overrides,
	}
}

function reportInteraction(opts: { guildId?: string | null; manage?: boolean } = {}) {
	const replies: Array<{ content?: string; components?: unknown[]; flags?: number }> = []
	const followUps: Array<{ content?: string; components?: unknown[]; flags?: number }> = []
	const interaction = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		memberPermissions: { has: () => opts.manage ?? true },
		options: { getUser: (_name: string, _required: true) => ({ id: TARGET }) },
		reply: async (p: (typeof replies)[number]) => {
			replies.push(p)
		},
		followUp: async (p: (typeof followUps)[number]) => {
			followUps.push(p)
		},
	}
	return { interaction, replies, followUps }
}

function reportsDeps(result: ExamReportsResult, requested: string[] = []) {
	return {
		getExamReports: async (discordId: string) => {
			requested.push(discordId)
			return result
		},
	}
}

describe("councilReportCommand", () => {
	it("is limited to server managers and takes a required user", () => {
		const json = councilReportCommand.toJSON()
		expect(json.name).toBe("council-report")
		expect(json.default_member_permissions).toBe("32")
		expect(json.options?.[0]).toMatchObject({ name: "user", required: true })
	})
})

describe("handleCouncilReport", () => {
	it("shows the user's exam report, looked up by their discord id", async () => {
		const { interaction, replies } = reportInteraction()
		const requested: string[] = []
		await handleCouncilReport(
			interaction,
			reportsDeps({ status: "ok", reports: [report()] }, requested)
		)
		expect(requested).toEqual([TARGET])
		expect(replies).toHaveLength(1)
		expect(JSON.stringify(replies[0])).toContain("Score: 90 / 100")
		expect((replies[0]?.flags ?? 0) & MessageFlags.Ephemeral).toBeTruthy()
	})

	it("posts older attempts as follow-ups after the newest", async () => {
		const { interaction, replies, followUps } = reportInteraction()
		await handleCouncilReport(
			interaction,
			reportsDeps({
				status: "ok",
				reports: [report({ score: 95 }), report({ applicantId: "sess-0", score: 70 })],
			})
		)
		expect(JSON.stringify(replies[0])).toContain("Score: 95")
		expect(followUps).toHaveLength(1)
		expect(JSON.stringify(followUps[0])).toContain("Score: 70")
	})

	describe("gates", () => {
		it("refuses outside a guild and never fetches", async () => {
			const { interaction, replies } = reportInteraction({ guildId: null })
			const requested: string[] = []
			await handleCouncilReport(interaction, reportsDeps({ status: "ok", reports: [] }, requested))
			expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_GUILD_ONLY)
			expect(requested).toEqual([])
		})

		it("refuses a member without Manage Server and never fetches", async () => {
			const { interaction, replies } = reportInteraction({ manage: false })
			const requested: string[] = []
			await handleCouncilReport(interaction, reportsDeps({ status: "ok", reports: [] }, requested))
			expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
			expect(requested).toEqual([])
		})
	})

	describe("edge cases", () => {
		it("says so when the user never took the exam", async () => {
			const { interaction, replies } = reportInteraction()
			await handleCouncilReport(interaction, reportsDeps({ status: "ok", reports: [] }))
			expect(replies[0]?.content).toBe(examReportNone(TARGET))
		})
	})

	describe("error paths", () => {
		it("shows a generic error when the lookup fails", async () => {
			const { interaction, replies, followUps } = reportInteraction()
			await handleCouncilReport(interaction, reportsDeps({ status: "error", code: 500 }))
			expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_ERROR)
			expect(followUps).toHaveLength(0)
		})
	})
})
