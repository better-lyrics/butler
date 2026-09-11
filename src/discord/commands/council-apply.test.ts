import type { ExamStartResult } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	COUNCIL_APPLY_ALREADY_COUNCIL,
	COUNCIL_APPLY_ERROR,
	COUNCIL_APPLY_GUILD_ONLY,
	COUNCIL_APPLY_INELIGIBLE,
	type CouncilApplyDeps,
	councilApplyAlreadyAttempted,
	handleCouncilApply,
} from "./council-apply"

const KEY_ID = "a".repeat(64)
const APPLICANT = "disc-applicant-1"
const EXAM_URL = "https://unison.test/exam?t=tok-abc"
const LINK_PAGE = "https://unison.test/link"
const GUIDE_URL = "https://composer.test/guides/lyric-best-practices"

function interaction(opts: { guildId?: string | null; userId?: string; manage?: boolean } = {}) {
	const replies: Array<{ content?: string; flags?: number; components?: unknown[] }> = []
	const int = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		user: { id: opts.userId ?? APPLICANT },
		memberPermissions: { has: () => opts.manage ?? false },
		reply: async (p: { content?: string; flags?: number; components?: unknown[] }) => {
			replies.push(p)
		},
	}
	return { interaction: int, replies }
}

function deps(overrides: Partial<CouncilApplyDeps> = {}): {
	deps: CouncilApplyDeps
	calls: {
		eligible: string[]
		council: string[]
		resolve: string[]
		start: Array<{ keyId: string; discordId: string }>
	}
} {
	const calls = {
		eligible: [] as string[],
		council: [] as string[],
		resolve: [] as string[],
		start: [] as Array<{ keyId: string; discordId: string }>,
	}
	const base: CouncilApplyDeps = {
		isEligible: async (discordId) => {
			calls.eligible.push(discordId)
			return true
		},
		isCouncilMember: async (discordId) => {
			calls.council.push(discordId)
			return false
		},
		resolveKeyId: async (discordId) => {
			calls.resolve.push(discordId)
			return KEY_ID
		},
		startExam: async (keyId, discordId) => {
			calls.start.push({ keyId, discordId })
			return { status: "eligible", examUrl: EXAM_URL, expiresAt: 1_790_000_000 } as ExamStartResult
		},
		linkPageUrl: LINK_PAGE,
		guideUrl: GUIDE_URL,
		...overrides,
	}
	return { deps: base, calls }
}

describe("handleCouncilApply gates", () => {
	it("refuses outside a guild and never checks eligibility", async () => {
		const { interaction: int, replies } = interaction({ guildId: null })
		const d = deps()
		await handleCouncilApply(int, d.deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_GUILD_ONLY)
		expect(d.calls.eligible).toEqual([])
	})

	it("turns away a member without a tier role and never resolves a key or starts the exam", async () => {
		const { interaction: int, replies } = interaction()
		const d = deps({ isEligible: async () => false })
		await handleCouncilApply(int, d.deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_INELIGIBLE)
		expect(d.calls.resolve).toEqual([])
		expect(d.calls.start).toEqual([])
	})
})

describe("handleCouncilApply council + admin gates", () => {
	it("blocks a current council member and never starts the exam", async () => {
		const { interaction: int, replies } = interaction()
		const d = deps({ isCouncilMember: async () => true })
		await handleCouncilApply(int, d.deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_ALREADY_COUNCIL)
		expect(d.calls.start).toEqual([])
	})

	it("checks council membership before eligibility so a member gets the right message", async () => {
		const { interaction: int, replies } = interaction()
		const d = deps({ isCouncilMember: async () => true, isEligible: async () => false })
		await handleCouncilApply(int, d.deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_ALREADY_COUNCIL)
	})

	it("lets an admin bypass the eligibility and council gates to test the flow", async () => {
		const { interaction: int, replies } = interaction({ manage: true })
		const d = deps({ isEligible: async () => false, isCouncilMember: async () => true })
		await handleCouncilApply(int, d.deps)
		expect(d.calls.eligible).toEqual([])
		expect(d.calls.council).toEqual([])
		expect(d.calls.start).toEqual([{ keyId: KEY_ID, discordId: APPLICANT }])
		expect(JSON.stringify(replies)).toContain(EXAM_URL)
	})
})

describe("handleCouncilApply link gate", () => {
	it("shows the connect card and never starts the exam for an unlinked member", async () => {
		const { interaction: int, replies } = interaction()
		const d = deps({ resolveKeyId: async () => null })
		await handleCouncilApply(int, d.deps)
		expect(replies[0]?.components).toBeDefined()
		expect(JSON.stringify(replies)).toContain(LINK_PAGE)
		expect(d.calls.start).toEqual([])
	})
})

describe("handleCouncilApply happy path", () => {
	it("starts the exam with the resolved key and replies with the intro card carrying the exam link", async () => {
		const { interaction: int, replies } = interaction()
		const d = deps()
		await handleCouncilApply(int, d.deps)
		expect(d.calls.start).toEqual([{ keyId: KEY_ID, discordId: APPLICANT }])
		expect(replies[0]?.components).toBeDefined()
		expect(JSON.stringify(replies)).toContain(EXAM_URL)
	})

	it("includes the lyric guide link so candidates can prep before starting", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilApply(int, deps().deps)
		expect(JSON.stringify(replies)).toContain(GUIDE_URL)
	})

	it("replies ephemerally", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilApply(int, deps().deps)
		const flags = replies[0]?.flags ?? 0
		expect(flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral)
	})
})

describe("handleCouncilApply already attempted", () => {
	const cases: Array<[ExamStartResult, string]> = [
		[
			{
				status: "already_attempted",
				attempt: { state: "pending_review", score: 88, submittedAt: 1 },
			},
			councilApplyAlreadyAttempted("pending_review"),
		],
		[
			{ status: "already_attempted", attempt: { state: "failed", score: 40, submittedAt: 1 } },
			councilApplyAlreadyAttempted("failed"),
		],
		[
			{ status: "already_attempted", attempt: { state: "rejected", score: 90, submittedAt: 1 } },
			councilApplyAlreadyAttempted("rejected"),
		],
		[
			{ status: "already_attempted", attempt: { state: "approved", score: 95, submittedAt: 1 } },
			councilApplyAlreadyAttempted("approved"),
		],
		[
			{
				status: "already_attempted",
				attempt: { state: "in_progress", score: null, submittedAt: null },
			},
			councilApplyAlreadyAttempted("in_progress"),
		],
	]

	for (const [result, expected] of cases) {
		const state = result.status === "already_attempted" ? result.attempt.state : ""
		it(`reports the ${state} attempt and never posts a card`, async () => {
			const { interaction: int, replies } = interaction()
			await handleCouncilApply(int, deps({ startExam: async () => result }).deps)
			expect(replies[0]?.content).toBe(expected)
			expect(replies[0]?.components).toBeUndefined()
		})
	}

	it("stays intentionally vague: one line for every state, revealing no outcome", () => {
		const states = ["approved", "failed", "rejected", "pending_review", "in_progress"] as const
		const lines = states.map((s) => councilApplyAlreadyAttempted(s))
		expect(new Set(lines).size).toBe(1)
		expect(lines[0] ?? "").not.toMatch(/not selected|passed|review|waiting|result|congrat/i)
	})
})

describe("handleCouncilApply error paths", () => {
	it("shows a generic error when unison cannot find the account", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilApply(int, deps({ startExam: async () => ({ status: "not_found" }) }).deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_ERROR)
	})

	it("shows a generic error when the start call errors", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilApply(
			int,
			deps({ startExam: async () => ({ status: "error", code: 500 }) }).deps
		)
		expect(replies[0]?.content).toBe(COUNCIL_APPLY_ERROR)
	})
})

describe("handleCouncilApply invariants", () => {
	it("checks eligibility for the acting user before anything else", async () => {
		const { interaction: int } = interaction({ userId: "acting-7" })
		const d = deps()
		await handleCouncilApply(int, d.deps)
		expect(d.calls.eligible).toEqual(["acting-7"])
		expect(d.calls.resolve).toEqual(["acting-7"])
	})

	it("never leaks the keyId into any reply", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilApply(int, deps().deps)
		expect(JSON.stringify(replies)).not.toContain(KEY_ID)
	})
})
