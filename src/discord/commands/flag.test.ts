import {
	connectHeading,
	flagAlreadyDecided,
	flagConfirmKeepBody,
	flagConfirmRemoveBody,
	flagConflict,
	flagError,
	flagKept,
	flagNotFound,
	flagRemoved,
	flagVoteCancelled,
	flagVoteCounted,
	queueNotCouncil,
} from "@/copy/strings"
import type { FlagOutcome } from "@/discord/components/flag-card"
import type { FlagTally, FlagVoteResult } from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	type FlagVoteFailure,
	flagVoteErrorCopy,
	handleFlagVote,
	handleFlagVoteCancel,
	handleFlagVoteConfirm,
} from "./flag"

const KEY_ID = "a".repeat(64)

interface PayloadNode {
	type?: number
	content?: string
	components?: PayloadNode[]
	custom_id?: string
}
interface Payload {
	content?: string
	flags?: number
	components?: Array<{ toJSON(): unknown }>
}

function collect(payload: unknown): PayloadNode[] {
	const out: PayloadNode[] = []
	const walk = (n: PayloadNode) => {
		out.push(n)
		for (const c of n.components ?? []) walk(c)
	}
	for (const comp of (payload as Payload).components ?? []) walk(comp.toJSON() as PayloadNode)
	return out
}

function payloadText(payload: unknown): string {
	const p = payload as Payload
	if (typeof p.content === "string") return p.content
	return collect(payload)
		.filter((n) => n.type === 10)
		.map((n) => n.content ?? "")
		.join("\n")
}

function customIds(payload: unknown): string[] {
	return collect(payload)
		.filter((n) => n.type === 2 && n.custom_id)
		.map((n) => n.custom_id ?? "")
}

function isEphemeral(payload: unknown): boolean {
	return Boolean(((payload as Payload).flags ?? 0) & MessageFlags.Ephemeral)
}

function replyInteraction() {
	const replies: unknown[] = []
	return {
		int: {
			reply: async (p: unknown) => {
				replies.push(p)
			},
		},
		replies,
	}
}

function updateInteraction(log: string[] = [], userId = "disc-1") {
	const updates: unknown[] = []
	return {
		int: {
			user: { id: userId },
			update: async (p: unknown) => {
				log.push("update")
				updates.push(p)
			},
		},
		updates,
	}
}

function voteDeps(result: FlagVoteResult, opts: { keyId?: string | null; log?: string[] } = {}) {
	const calls: Array<[number, string, boolean]> = []
	const resolved: Array<[string, FlagOutcome, string, FlagTally]> = []
	const refreshed: Array<[string, FlagTally]> = []
	const keyId = opts.keyId === undefined ? KEY_ID : opts.keyId
	return {
		calls,
		resolved,
		refreshed,
		deps: {
			resolveKeyId: async () => keyId,
			voteFlag: async (caseId: number, key: string, remove: boolean) => {
				calls.push([caseId, key, remove])
				return result
			},
			refreshBoardCard: async (caseId: string, tally: FlagTally) => {
				opts.log?.push("refresh")
				refreshed.push([caseId, tally])
			},
			resolveBoardCard: async (
				caseId: string,
				outcome: FlagOutcome,
				actorId: string,
				tally: FlagTally
			) => {
				opts.log?.push("resolve")
				resolved.push([caseId, outcome, actorId, tally])
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

const OPEN = { status: "open" as const, removals: 2, keeps: 1, needed: 3 }
const REMOVED = { status: "removed" as const, removals: 3, keeps: 1, needed: 3 }
const KEPT = { status: "kept" as const, removals: 1, keeps: 3, needed: 3 }
const tallyOf = ({ removals, keeps, needed }: FlagTally) => ({ removals, keeps, needed })

const FAILURES: Array<[FlagVoteFailure, string]> = [
	[{ status: "not_council" }, queueNotCouncil],
	[{ status: "not_found" }, flagNotFound],
	[{ status: "already_decided" }, flagAlreadyDecided],
	[{ status: "conflict" }, flagConflict],
	[{ status: "error", code: 500 }, flagError],
]

describe("flagVoteErrorCopy", () => {
	for (const [result, copy] of FAILURES) {
		it(`maps ${result.status} to its message`, () => {
			expect(flagVoteErrorCopy(result)).toBe(copy)
		})
	}

	it("tells the voter another member has to decide on a conflict", () => {
		expect(flagConflict).toBe(
			"You submitted or reported this lyric, so another council member has to decide."
		)
	})
})

describe("handleFlagVote", () => {
	describe("happy paths", () => {
		it("replies with an ephemeral remove confirm carrying the case id", async () => {
			const { int, replies } = replyInteraction()
			await handleFlagVote(int, "77", true)
			expect(isEphemeral(replies[0])).toBe(true)
			expect(payloadText(replies[0])).toBe(flagConfirmRemoveBody)
			expect(customIds(replies[0])).toEqual(["flag.vote.confirm:77:1", "flag.vote.cancel"])
		})

		it("replies with an ephemeral keep confirm", async () => {
			const { int, replies } = replyInteraction()
			await handleFlagVote(int, "77", false)
			expect(payloadText(replies[0])).toBe(flagConfirmKeepBody)
			expect(customIds(replies[0])).toEqual(["flag.vote.confirm:77:0", "flag.vote.cancel"])
		})
	})

	describe("error paths", () => {
		for (const bad of ["", "abc", "-1", "1.5"]) {
			it(`shows an error instead of a confirm for case id ${JSON.stringify(bad)}`, async () => {
				const { int, replies } = replyInteraction()
				await handleFlagVote(int, bad, true)
				expect(isEphemeral(replies[0])).toBe(true)
				expect(payloadText(replies[0])).toBe(flagError)
			})
		}
	})
})

describe("handleFlagVoteCancel", () => {
	it("replaces the confirm card with the cancelled line", async () => {
		const { int, updates } = updateInteraction()
		await handleFlagVoteCancel(int)
		expect(payloadText(updates[0])).toBe(flagVoteCancelled)
		expect(customIds(updates[0])).toEqual([])
	})
})

describe("handleFlagVoteConfirm", () => {
	describe("happy paths", () => {
		it("casts a remove vote, shows the returned progress and redraws the board", async () => {
			const { int, updates } = updateInteraction()
			const { deps, calls, refreshed, resolved } = voteDeps(OPEN)
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(calls).toEqual([[77, KEY_ID, true]])
			expect(payloadText(updates[0])).toBe(flagVoteCounted(2, 3))
			expect(refreshed).toEqual([["77", tallyOf(OPEN)]])
			expect(resolved).toEqual([])
		})

		it("casts a keep vote", async () => {
			const { int } = updateInteraction()
			const { deps, calls } = voteDeps(OPEN)
			await handleFlagVoteConfirm(int, "77", "0", deps)
			expect(calls).toEqual([[77, KEY_ID, false]])
		})

		it("shows the removed outcome and resolves the board card with the returned tally", async () => {
			const log: string[] = []
			const { int, updates } = updateInteraction(log, "disc-9")
			const { deps, resolved, refreshed } = voteDeps(REMOVED, { log })
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(payloadText(updates[0])).toBe(flagRemoved)
			expect(resolved).toEqual([["77", { kind: "removed" }, "disc-9", tallyOf(REMOVED)]])
			expect(refreshed).toEqual([])
			expect(log).toEqual(["update", "resolve"])
		})

		it("shows the kept outcome and resolves the board card", async () => {
			const { int, updates } = updateInteraction()
			const { deps, resolved } = voteDeps(KEPT)
			await handleFlagVoteConfirm(int, "77", "0", deps)
			expect(payloadText(updates[0])).toBe(flagKept)
			expect(resolved).toEqual([["77", { kind: "kept" }, "disc-1", tallyOf(KEPT)]])
		})
	})

	describe("edge cases", () => {
		it("shows a zero quorum as returned", async () => {
			const { int, updates } = updateInteraction()
			const { deps } = voteDeps({ status: "open", removals: 0, keeps: 0, needed: 0 })
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(payloadText(updates[0])).toBe(flagVoteCounted(0, 0))
		})

		it("shows the connect card when the voter has no linked key", async () => {
			const { int, updates } = updateInteraction()
			const { deps, calls } = voteDeps(OPEN, { keyId: null })
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(calls).toEqual([])
			expect(payloadText(updates[0])).toContain(connectHeading)
		})
	})

	describe("error paths", () => {
		for (const [result, copy] of FAILURES) {
			it(`shows ${result.status} copy and leaves the board alone`, async () => {
				const { int, updates } = updateInteraction()
				const { deps, resolved, refreshed } = voteDeps(result)
				await handleFlagVoteConfirm(int, "77", "1", deps)
				expect(payloadText(updates[0])).toBe(copy)
				expect(resolved).toEqual([])
				expect(refreshed).toEqual([])
			})
		}

		for (const [caseId, choice] of [
			["", "1"],
			["abc", "1"],
			["77", ""],
			["77", "2"],
		]) {
			it(`rejects case ${JSON.stringify(caseId)} choice ${JSON.stringify(choice)} without voting`, async () => {
				const { int, updates } = updateInteraction()
				const { deps, calls } = voteDeps(OPEN)
				await handleFlagVoteConfirm(int, caseId ?? "", choice ?? "", deps)
				expect(calls).toEqual([])
				expect(payloadText(updates[0])).toBe(flagError)
			})
		}
	})

	describe("invariants", () => {
		it("answers the voter before redrawing the board on an open vote", async () => {
			const log: string[] = []
			const { int } = updateInteraction(log)
			const { deps } = voteDeps(OPEN, { log })
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(log).toEqual(["update", "refresh"])
		})

		it("never pings anyone from the ephemeral result", async () => {
			const { int, updates } = updateInteraction()
			const { deps } = voteDeps(REMOVED)
			await handleFlagVoteConfirm(int, "77", "1", deps)
			expect(payloadText(updates[0])).not.toContain("<@")
		})
	})
})
