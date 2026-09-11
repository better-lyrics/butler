import { examApplicantsEmpty, examApplicantsHeading } from "@/copy/strings"
import type { CouncilRoleOutcome } from "@/discord/commands/council"
import type { CouncilAddResult, ExamApplicant, ExamDecisionResult } from "@/unison/client"
import { PermissionFlagsBits } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	APPLICANT_BOARD_LIMIT,
	type ApplicantApproveDeps,
	type ApplicantRejectDeps,
	COUNCIL_APPLICANTS_ERROR,
	COUNCIL_APPLICANTS_GUILD_ONLY,
	COUNCIL_APPLICANTS_NO_PERMISSION,
	COUNCIL_APPLICANT_DECISION_ERROR,
	type CouncilApplicantsDeps,
	handleCouncilApplicantApprove,
	handleCouncilApplicantApprovePrompt,
	handleCouncilApplicantCancel,
	handleCouncilApplicantReject,
	handleCouncilApplicantRejectPrompt,
	handleCouncilApplicants,
} from "./council-applicants"

const KEY_ID = "a".repeat(64)
const APPLICANT_DISC = "disc-app-1"
const ADMIN = "admin-1"

function applicant(overrides: Partial<ExamApplicant> = {}): ExamApplicant {
	return {
		applicantId: "sess-1",
		discordId: APPLICANT_DISC,
		keyId: KEY_ID,
		displayName: "quiet-fern",
		score: 90,
		maxScore: 100,
		cutoff: 85,
		breakdown: [{ section: "timing", score: 4, max: 5 }],
		submittedAt: 1_789_000_000,
		state: "pending_review",
		...overrides,
	}
}

function listInteraction(
	opts: { guildId?: string | null; manage?: boolean; nearMisses?: boolean } = {}
) {
	const replies: Array<{ content?: string; components?: unknown[] }> = []
	const followUps: Array<{ content?: string; components?: unknown[] }> = []
	const int = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		memberPermissions: { has: () => opts.manage ?? true },
		options: { getBoolean: (_name: string) => opts.nearMisses ?? null },
		reply: async (p: { content?: string; components?: unknown[] }) => {
			replies.push(p)
		},
		followUp: async (p: { content?: string; components?: unknown[] }) => {
			followUps.push(p)
		},
	}
	return { interaction: int, replies, followUps }
}

describe("handleCouncilApplicants gates", () => {
	it("refuses outside a guild and never fetches", async () => {
		const { interaction: int, replies } = listInteraction({ guildId: null })
		let fetched = false
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => {
				fetched = true
				return { status: "ok", applicants: [] }
			},
		})
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_GUILD_ONLY)
		expect(fetched).toBe(false)
	})

	it("refuses a member without Manage Server and never fetches", async () => {
		const { interaction: int, replies } = listInteraction({ manage: false })
		let fetched = false
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => {
				fetched = true
				return { status: "ok", applicants: [] }
			},
		})
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(fetched).toBe(false)
	})
})

describe("handleCouncilApplicants board", () => {
	it("shows the empty message when no one is waiting", async () => {
		const { interaction: int, replies, followUps } = listInteraction()
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => ({ status: "ok", applicants: [] }),
		})
		expect(replies[0]?.content).toBe(examApplicantsEmpty)
		expect(followUps).toHaveLength(0)
	})

	it("posts a header then one card per applicant", async () => {
		const { interaction: int, replies, followUps } = listInteraction()
		const applicants = [
			applicant({ applicantId: "s1" }),
			applicant({ applicantId: "s2", displayName: "ember" }),
		]
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => ({ status: "ok", applicants }),
		})
		expect(replies[0]?.content).toContain(examApplicantsHeading)
		expect(replies[0]?.content).toContain("2 waiting")
		expect(followUps).toHaveLength(2)
		expect(followUps[0]?.components).toBeDefined()
	})

	it("caps the cards at the board limit and notes the overflow", async () => {
		const { interaction: int, replies, followUps } = listInteraction()
		const applicants = Array.from({ length: APPLICANT_BOARD_LIMIT + 2 }, (_, i) =>
			applicant({ applicantId: `s${i}` })
		)
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => ({ status: "ok", applicants }),
		})
		expect(followUps).toHaveLength(APPLICANT_BOARD_LIMIT)
		expect(replies[0]?.content).toContain("2 more applicant")
	})

	it("passes the near-misses flag through to the fetch", async () => {
		const { interaction: int } = listInteraction({ nearMisses: true })
		let asked: boolean | null = null
		const deps: CouncilApplicantsDeps = {
			getExamApplicants: async (include) => {
				asked = include
				return { status: "ok", applicants: [] }
			},
		}
		await handleCouncilApplicants(int, deps)
		expect(asked).toBe(true)
	})

	it("defaults near-misses to false", async () => {
		const { interaction: int } = listInteraction()
		let asked: boolean | null = null
		await handleCouncilApplicants(int, {
			getExamApplicants: async (include) => {
				asked = include
				return { status: "ok", applicants: [] }
			},
		})
		expect(asked).toBe(false)
	})

	it("shows a generic error when the fetch fails", async () => {
		const { interaction: int, replies } = listInteraction()
		await handleCouncilApplicants(int, {
			getExamApplicants: async () => ({ status: "error", code: 500 }),
		})
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_ERROR)
	})
})

function decisionInteraction(opts: { manage?: boolean; userId?: string } = {}) {
	const updates: Array<{ components?: unknown[] }> = []
	const replies: Array<{ content?: string }> = []
	const int = {
		user: { id: opts.userId ?? ADMIN },
		memberPermissions: { has: () => opts.manage ?? true },
		update: async (p: { components?: unknown[] }) => {
			updates.push(p)
		},
		reply: async (p: { content?: string }) => {
			replies.push(p)
		},
	}
	return { interaction: int, updates, replies }
}

function approveDeps(
	opts: {
		keyId?: string | null
		add?: CouncilAddResult
		role?: CouncilRoleOutcome
		decide?: ExamDecisionResult
	} = {}
): { deps: ApplicantApproveDeps; order: string[] } {
	const order: string[] = []
	const deps: ApplicantApproveDeps = {
		resolveKeyId: async () => {
			order.push("resolve")
			return opts.keyId === undefined ? KEY_ID : opts.keyId
		},
		addCouncilMember: async () => {
			order.push("add")
			return opts.add ?? { status: "added" }
		},
		grantCouncilRole: async () => {
			order.push("grant")
			return opts.role ?? "done"
		},
		decideExamApplicant: async () => {
			order.push("decide")
			return opts.decide ?? { status: "recorded" }
		},
		welcomeMember: async () => {
			order.push("welcome")
		},
	}
	return { deps, order }
}

describe("handleCouncilApplicantApprove", () => {
	const args = { applicantId: "sess-1", discordId: APPLICANT_DISC }

	it("refuses a non-admin clicker and never touches the council", async () => {
		const { interaction: int, replies, updates } = decisionInteraction({ manage: false })
		const { deps, order } = approveDeps()
		await handleCouncilApplicantApprove(int, args, deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(order).toEqual([])
		expect(updates).toHaveLength(0)
	})

	it("adds to the council, grants the role, records the decision, welcomes them, then flips the card", async () => {
		const { interaction: int, updates } = decisionInteraction()
		const { deps, order } = approveDeps()
		await handleCouncilApplicantApprove(int, args, deps)
		expect(order).toEqual(["resolve", "add", "grant", "decide", "welcome"])
		expect(JSON.stringify(updates)).toContain("approved by")
	})

	it("only sends the welcome DM after the role grant and committee add have landed", async () => {
		const { interaction: int } = decisionInteraction()
		const { deps, order } = approveDeps()
		await handleCouncilApplicantApprove(int, args, deps)
		expect(order.indexOf("welcome")).toBeGreaterThan(order.indexOf("add"))
		expect(order.indexOf("welcome")).toBeGreaterThan(order.indexOf("grant"))
	})

	it("errors without touching the council when the applicant has no linked key", async () => {
		const { interaction: int, replies } = decisionInteraction()
		const { deps, order } = approveDeps({ keyId: null })
		await handleCouncilApplicantApprove(int, args, deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANT_DECISION_ERROR)
		expect(order).toEqual(["resolve"])
	})

	it("errors and never grants the role when the council add fails", async () => {
		const { interaction: int, replies } = decisionInteraction()
		const { deps, order } = approveDeps({ add: { status: "error", code: 500 } })
		await handleCouncilApplicantApprove(int, args, deps)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANT_DECISION_ERROR)
		expect(order).toEqual(["resolve", "add"])
	})

	it("still approves and notes the failure when the role grant fails", async () => {
		const { interaction: int, updates } = decisionInteraction()
		const { deps, order } = approveDeps({ role: "failed" })
		await handleCouncilApplicantApprove(int, args, deps)
		expect(order).toEqual(["resolve", "add", "grant", "decide", "welcome"])
		expect(JSON.stringify(updates)).toContain("Could not assign the Council role")
	})
})

describe("handleCouncilApplicantReject", () => {
	const args = { applicantId: "sess-1", discordId: APPLICANT_DISC }

	it("refuses a non-admin clicker and never records a decision", async () => {
		const { interaction: int, replies, updates } = decisionInteraction({ manage: false })
		let decided = false
		await handleCouncilApplicantReject(int, args, {
			decideExamApplicant: async () => {
				decided = true
				return { status: "recorded" }
			},
		})
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(decided).toBe(false)
		expect(updates).toHaveLength(0)
	})

	it("records the reject and flips the card", async () => {
		const { interaction: int, updates } = decisionInteraction()
		const calls: Array<{ applicantId: string; decision: string; decider: string }> = []
		const deps: ApplicantRejectDeps = {
			decideExamApplicant: async (applicantId, decision, decider) => {
				calls.push({ applicantId, decision, decider })
				return { status: "recorded" }
			},
		}
		await handleCouncilApplicantReject(int, args, deps)
		expect(calls).toEqual([{ applicantId: "sess-1", decision: "reject", decider: ADMIN }])
		expect(JSON.stringify(updates)).toContain("not selected")
	})

	it("errors without flipping the card when the decision cannot be recorded", async () => {
		const { interaction: int, replies, updates } = decisionInteraction()
		await handleCouncilApplicantReject(int, args, {
			decideExamApplicant: async () => ({ status: "error", code: 500 }),
		})
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANT_DECISION_ERROR)
		expect(updates).toHaveLength(0)
	})

	it("still flips the card when the applicant was already decided (not_found)", async () => {
		const { interaction: int, updates } = decisionInteraction()
		await handleCouncilApplicantReject(int, args, {
			decideExamApplicant: async () => ({ status: "not_found" }),
		})
		expect(JSON.stringify(updates)).toContain("not selected")
	})
})

describe("handleCouncilApplicantApprovePrompt", () => {
	const args = { applicantId: "sess-1", discordId: APPLICANT_DISC }

	it("refuses a non-admin clicker and shows no confirm", async () => {
		const { interaction: int, replies, updates } = decisionInteraction({ manage: false })
		await handleCouncilApplicantApprovePrompt(int, args)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(updates).toHaveLength(0)
	})

	it("swaps the card for an are-you-sure confirm instead of granting anything", async () => {
		const { interaction: int, updates } = decisionInteraction()
		await handleCouncilApplicantApprovePrompt(int, args)
		const s = JSON.stringify(updates)
		expect(s).toContain("Confirm approve")
		expect(s).toContain("to the Council?")
	})
})

describe("handleCouncilApplicantRejectPrompt", () => {
	const args = { applicantId: "sess-1", discordId: APPLICANT_DISC }

	it("refuses a non-admin clicker and shows no confirm", async () => {
		const { interaction: int, replies, updates } = decisionInteraction({ manage: false })
		await handleCouncilApplicantRejectPrompt(int, args)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(updates).toHaveLength(0)
	})

	it("swaps the card for an are-you-sure confirm that warns it burns the attempt", async () => {
		const { interaction: int, updates } = decisionInteraction()
		await handleCouncilApplicantRejectPrompt(int, args)
		const s = JSON.stringify(updates)
		expect(s).toContain("Confirm reject")
		expect(s).toContain("one attempt")
	})
})

describe("handleCouncilApplicantCancel", () => {
	it("refuses a non-admin clicker", async () => {
		const { interaction: int, replies, updates } = decisionInteraction({ manage: false })
		await handleCouncilApplicantCancel(
			int,
			{ applicantId: "sess-1" },
			{ getExamApplicants: async () => ({ status: "ok", applicants: [] }) }
		)
		expect(replies[0]?.content).toBe(COUNCIL_APPLICANTS_NO_PERMISSION)
		expect(updates).toHaveLength(0)
	})

	it("restores the applicant card when the applicant is still pending", async () => {
		const { interaction: int, updates } = decisionInteraction()
		const a = applicant({ applicantId: "sess-1", displayName: "quiet-fern" })
		await handleCouncilApplicantCancel(
			int,
			{ applicantId: "sess-1" },
			{ getExamApplicants: async () => ({ status: "ok", applicants: [a] }) }
		)
		const s = JSON.stringify(updates)
		expect(s).toContain("quiet-fern")
		expect(s).toContain("Approve")
	})

	it("shows a gone card when the applicant was already decided", async () => {
		const { interaction: int, updates } = decisionInteraction()
		await handleCouncilApplicantCancel(
			int,
			{ applicantId: "missing" },
			{ getExamApplicants: async () => ({ status: "ok", applicants: [] }) }
		)
		expect(JSON.stringify(updates)).toContain("no longer pending")
	})

	it("shows a gone card when the applicant list cannot be fetched", async () => {
		const { interaction: int, updates } = decisionInteraction()
		await handleCouncilApplicantCancel(
			int,
			{ applicantId: "sess-1" },
			{ getExamApplicants: async () => ({ status: "error", code: 500 }) }
		)
		expect(JSON.stringify(updates)).toContain("no longer pending")
	})
})
