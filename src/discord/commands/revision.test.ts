import {
	connectHeading,
	queueNotCouncil,
	queueRejectNoteLine,
	revisionAlreadyDecided,
	revisionApproveCancelled,
	revisionApprovedBy,
	revisionConfirmApproveBody,
	revisionError,
	revisionNotFound,
	revisionRejectModalTitle,
	revisionRejectedBy,
	revisionStale,
} from "@/copy/strings"
import type { RevisionDecisionRecord } from "@/db/revision-board"
import { pendingRevision } from "@/unison/__fixtures__/pending-revision"
import type { PendingRevisionCard, RevisionDecisionResult } from "@/unison/client"
import { MessageFlags, type ModalBuilder } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	type RevisionDecisionFailure,
	handleRevisionApprove,
	handleRevisionApproveCancel,
	handleRevisionApproveConfirm,
	handleRevisionReject,
	handleRevisionRejectSubmit,
	revisionDecisionErrorCopy,
} from "./revision"

const KEY_ID = "a".repeat(64)

interface PayloadNode {
	type?: number
	content?: string
	components?: PayloadNode[]
	custom_id?: string
	label?: string
}
interface Payload {
	content?: string
	flags?: number
	components?: Array<{ toJSON(): unknown }>
}

function collect(payload: unknown): PayloadNode[] {
	const p = payload as Payload
	const out: PayloadNode[] = []
	const walk = (n: PayloadNode) => {
		out.push(n)
		for (const c of n.components ?? []) walk(c)
	}
	for (const comp of p.components ?? []) walk(comp.toJSON() as PayloadNode)
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

function modalSubmit(note: string) {
	const updates: unknown[] = []
	const replies: unknown[] = []
	return {
		int: {
			user: { id: "disc-1" },
			fields: { getTextInputValue: (_id: string) => note },
			update: async (p: unknown) => {
				updates.push(p)
			},
			reply: async (p: unknown) => {
				replies.push(p)
			},
		},
		updates,
		replies,
	}
}

function approveDeps(
	result: RevisionDecisionResult,
	opts: { keyId?: string | null; log?: string[] } = {}
) {
	const calls: Array<[string, string, string]> = []
	const boardFlips: Array<[string, string]> = []
	const keyId = opts.keyId === undefined ? KEY_ID : opts.keyId
	return {
		calls,
		boardFlips,
		deps: {
			resolveKeyId: async () => keyId,
			approveRevision: async (lyricsId: string, revisionId: string, key: string) => {
				calls.push([lyricsId, revisionId, key])
				return result
			},
			approveBoardCard: async (revisionId: string, actorId: string) => {
				opts.log?.push("board")
				boardFlips.push([revisionId, actorId])
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

function rejectDeps(
	result: RevisionDecisionResult,
	opts: { keyId?: string | null; stored?: PendingRevisionCard | null } = {}
) {
	const calls: Array<[string, string, string, string | undefined]> = []
	const decided: Array<[string, RevisionDecisionRecord]> = []
	const keyId = opts.keyId === undefined ? KEY_ID : opts.keyId
	const stored = opts.stored === undefined ? pendingRevision() : opts.stored
	return {
		calls,
		decided,
		deps: {
			resolveKeyId: async () => keyId,
			rejectRevision: async (lyricsId: string, revisionId: string, key: string, note?: string) => {
				calls.push([lyricsId, revisionId, key, note])
				return result
			},
			getCard: async () => stored,
			markDecided: async (revisionId: string, decision: RevisionDecisionRecord) => {
				decided.push([revisionId, decision])
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

const FAILURES: Array<[RevisionDecisionFailure, string]> = [
	[{ status: "not_council" }, queueNotCouncil],
	[{ status: "not_found" }, revisionNotFound],
	[{ status: "already_decided" }, revisionAlreadyDecided],
	[{ status: "stale" }, revisionStale],
	[{ status: "error", code: 500 }, revisionError],
]

describe("revisionDecisionErrorCopy", () => {
	for (const [result, copy] of FAILURES) {
		it(`maps ${result.status} to its message`, () => {
			expect(revisionDecisionErrorCopy(result)).toBe(copy)
		})
	}
})

describe("handleRevisionApprove", () => {
	it("replies with an ephemeral confirm card carrying both ids", async () => {
		const { int, replies } = replyInteraction()
		await handleRevisionApprove(int, "4210", "918")
		expect(isEphemeral(replies[0])).toBe(true)
		expect(payloadText(replies[0])).toBe(revisionConfirmApproveBody)
		expect(customIds(replies[0])).toEqual([
			"revision.approve.confirm:4210:918",
			"revision.approve.cancel",
		])
	})

	describe("edge cases", () => {
		it("shows an error instead of a confirm for a missing revision id", async () => {
			const { int, replies } = replyInteraction()
			await handleRevisionApprove(int, "4210", "")
			expect(payloadText(replies[0])).toBe(revisionError)
			expect(customIds(replies[0])).toEqual([])
		})
	})
})

describe("handleRevisionApproveCancel", () => {
	it("turns the confirm into a cancelled notice", async () => {
		const { int, updates } = updateInteraction()
		await handleRevisionApproveCancel(int)
		expect(payloadText(updates[0])).toBe(revisionApproveCancelled)
		expect(customIds(updates[0])).toEqual([])
	})
})

describe("handleRevisionApproveConfirm", () => {
	describe("happy paths", () => {
		it("approves, acks the confirm, and flips the board card", async () => {
			const { int, updates } = updateInteraction()
			const { deps, calls, boardFlips } = approveDeps({ status: "decided" })
			await handleRevisionApproveConfirm(int, "4210", "918", deps)
			expect(calls).toEqual([["4210", "918", KEY_ID]])
			expect(payloadText(updates[0])).toBe(revisionApprovedBy("disc-1"))
			expect(customIds(updates[0])).toEqual([])
			expect(boardFlips).toEqual([["918", "disc-1"]])
		})
	})

	describe("edge cases", () => {
		it("shows an error and calls nothing for a missing lyrics id", async () => {
			const { int, updates } = updateInteraction()
			const { deps, calls, boardFlips } = approveDeps({ status: "decided" })
			await handleRevisionApproveConfirm(int, "", "918", deps)
			expect(payloadText(updates[0])).toBe(revisionError)
			expect(calls).toEqual([])
			expect(boardFlips).toEqual([])
		})
	})

	describe("error paths never flip the board", () => {
		for (const [result, copy] of FAILURES) {
			it(`maps ${result.status} to its message on the confirm`, async () => {
				const { int, updates } = updateInteraction()
				const { deps, boardFlips } = approveDeps(result)
				await handleRevisionApproveConfirm(int, "4210", "918", deps)
				expect(payloadText(updates[0])).toBe(copy)
				expect(boardFlips).toEqual([])
			})
		}

		it("shows the connect card and never approves when unlinked", async () => {
			const { int, updates } = updateInteraction()
			const { deps, calls } = approveDeps({ status: "decided" }, { keyId: null })
			await handleRevisionApproveConfirm(int, "4210", "918", deps)
			expect(calls).toEqual([])
			expect(payloadText(updates[0])).toContain(connectHeading)
		})
	})

	describe("regressions", () => {
		it("regression: acks the confirm before flipping the board so a board failure cannot swallow it", async () => {
			const log: string[] = []
			const { int } = updateInteraction(log)
			await handleRevisionApproveConfirm(
				int,
				"4210",
				"918",
				approveDeps({ status: "decided" }, { log }).deps
			)
			expect(log).toEqual(["update", "board"])
		})
	})
})

describe("handleRevisionReject", () => {
	it("opens the shared note modal with a submit id carrying both ids", async () => {
		const modals: ModalBuilder[] = []
		await handleRevisionReject({ showModal: async (m) => modals.push(m) }, "4210", "918")
		const json = modals[0]?.toJSON() as { custom_id?: string; title?: string }
		expect(json.custom_id).toBe("revision.reject.submit:4210:918")
		expect(json.title).toBe(revisionRejectModalTitle)
	})
})

describe("handleRevisionRejectSubmit", () => {
	describe("happy paths", () => {
		it("rejects with the trimmed note, records it, and flips the card", async () => {
			const { int, updates } = modalSubmit("  timing is off in the bridge  ")
			const { deps, calls, decided } = rejectDeps({ status: "decided" })
			await handleRevisionRejectSubmit(int, "4210", "918", deps)
			expect(calls).toEqual([["4210", "918", KEY_ID, "timing is off in the bridge"]])
			expect(decided).toEqual([
				["918", { state: "rejected", actorId: "disc-1", note: "timing is off in the bridge" }],
			])
			const blob = payloadText(updates[0])
			expect(blob).toContain(revisionRejectedBy("disc-1"))
			expect(blob).toContain(queueRejectNoteLine("timing is off in the bridge"))
			expect(customIds(updates[0])).toEqual([])
		})

		it("re-attaches the full diff and clears the old attachment on the edit", async () => {
			const { int, updates } = modalSubmit("note")
			await handleRevisionRejectSubmit(int, "4210", "918", rejectDeps({ status: "decided" }).deps)
			const payload = updates[0] as { files: unknown[]; attachments: unknown[] }
			expect(payload.attachments).toEqual([])
			expect(payload.files).toHaveLength(1)
		})
	})

	describe("edge cases", () => {
		it("sends no note and records null for a blank field", async () => {
			const { int, updates } = modalSubmit("   ")
			const { deps, calls, decided } = rejectDeps({ status: "decided" })
			await handleRevisionRejectSubmit(int, "4210", "918", deps)
			expect(calls).toEqual([["4210", "918", KEY_ID, undefined]])
			expect(decided[0]?.[1].note).toBeNull()
			expect(payloadText(updates[0])).not.toContain("Reason:")
		})

		it("falls back to a plain notice when the stored card is gone", async () => {
			const { int, updates } = modalSubmit("note")
			await handleRevisionRejectSubmit(
				int,
				"4210",
				"918",
				rejectDeps({ status: "decided" }, { stored: null }).deps
			)
			expect(payloadText(updates[0])).toBe(revisionRejectedBy("disc-1"))
		})

		it("shows an error and calls nothing for a missing lyrics id", async () => {
			const { int, replies } = modalSubmit("note")
			const { deps, calls } = rejectDeps({ status: "decided" })
			await handleRevisionRejectSubmit(int, "", "918", deps)
			expect(payloadText(replies[0])).toBe(revisionError)
			expect(calls).toEqual([])
		})
	})

	describe("error paths reply ephemerally and never flip the card", () => {
		for (const [result, copy] of FAILURES) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates, replies } = modalSubmit("note")
				const { deps, decided } = rejectDeps(result)
				await handleRevisionRejectSubmit(int, "4210", "918", deps)
				expect(payloadText(replies[0])).toBe(copy)
				expect(isEphemeral(replies[0])).toBe(true)
				expect(updates).toHaveLength(0)
				expect(decided).toHaveLength(0)
			})
		}

		it("shows the connect card and never rejects when unlinked", async () => {
			const { int, replies } = modalSubmit("note")
			const { deps, calls } = rejectDeps({ status: "decided" }, { keyId: null })
			await handleRevisionRejectSubmit(int, "4210", "918", deps)
			expect(calls).toEqual([])
			expect(payloadText(replies[0])).toContain(connectHeading)
		})
	})
})

describe("invariants", () => {
	it("never leaks the keyId into any reply or update payload", async () => {
		const approve = updateInteraction()
		await handleRevisionApproveConfirm(
			approve.int,
			"4210",
			"918",
			approveDeps({ status: "decided" }).deps
		)
		const approveFail = updateInteraction()
		await handleRevisionApproveConfirm(
			approveFail.int,
			"4210",
			"918",
			approveDeps({ status: "stale" }).deps
		)
		const reject = modalSubmit("note")
		await handleRevisionRejectSubmit(
			reject.int,
			"4210",
			"918",
			rejectDeps({ status: "decided" }).deps
		)
		for (const payloads of [approve.updates, approveFail.updates, reject.updates, reject.replies]) {
			expect(JSON.stringify(payloads)).not.toContain(KEY_ID)
		}
	})
})
