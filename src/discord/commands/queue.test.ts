import {
	connectHeading,
	queueAlreadyRejected,
	queueEntryHeading,
	queueError,
	queueNotCouncil,
	queueRejectNoteLine,
	queueRejectUndone,
	queueRejectedBy,
	queueResendEmpty,
	queueResendFailed,
	queueResendPosted,
	queueSealCancelled,
	queueSealUndone,
	queueSealedBy,
	queueUnknownUser,
	sealAlreadyActive,
	sealError,
	sealNotCouncil,
	sealNotFound,
	sealNotOwner,
	sealOverQuota,
	sealSelf,
	sealTargetCouncil,
} from "@/copy/strings"
import type {
	QueueEntry,
	QuotaResult,
	RejectResult,
	SealResult,
	UnrejectResult,
	UnsealResult,
} from "@/unison/client"
import type { ModalBuilder } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	handleQueue,
	handleQueueReject,
	handleQueueRejectSubmit,
	handleQueueRejectUndo,
	handleQueueSeal,
	handleQueueSealCancel,
	handleQueueSealConfirm,
	handleQueueSealUndo,
} from "./queue"

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

function payloadButtons(payload: unknown): PayloadNode[] {
	return collect(payload).filter((n) => n.type === 2)
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
	return {
		id: 4210,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		format: "ttml",
		score: 87,
		voteCount: 41,
		submitterName: "Alice",
		ttmlSignals: [],
		...overrides,
	}
}

function commandInteraction() {
	const replies: unknown[] = []
	const defers: unknown[] = []
	const edits: unknown[] = []
	return {
		int: {
			user: { id: "disc-1" },
			deferReply: async (o: unknown) => {
				defers.push(o)
			},
			editReply: async (p: unknown) => {
				edits.push(p)
			},
			reply: async (p: unknown) => {
				replies.push(p)
			},
		},
		replies,
		defers,
		edits,
	}
}

function boardInteraction(userId = "disc-1") {
	const updates: unknown[] = []
	const replies: unknown[] = []
	return {
		int: {
			user: { id: userId },
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

function updateInteraction(userId = "disc-1") {
	const updates: unknown[] = []
	return {
		int: {
			user: { id: userId },
			update: async (p: unknown) => {
				updates.push(p)
			},
		},
		updates,
	}
}

function commandDeps(overrides: {
	keyId?: string | null
	quota?: QuotaResult
	resend?: "posted" | "empty" | "failed"
}) {
	const resendCalls: number[] = []
	return {
		resendCalls,
		deps: {
			resolveKeyId: async () => (overrides.keyId === undefined ? KEY_ID : overrides.keyId),
			getBoostQuota: async (): Promise<QuotaResult> =>
				overrides.quota ?? {
					status: "ok",
					quota: { quota: 10, used: 1, remaining: 9, resetsAt: 1 },
				},
			resendBoard: async () => {
				resendCalls.push(1)
				return overrides.resend ?? "posted"
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

describe("handleQueue", () => {
	describe("gates", () => {
		it("shows the connect card and never resends when unlinked", async () => {
			const { int, replies } = commandInteraction()
			const { deps, resendCalls } = commandDeps({ keyId: null })
			await handleQueue(int, deps)
			expect(payloadText(replies[0])).toContain(connectHeading)
			expect(resendCalls).toHaveLength(0)
		})

		it("refuses a non-council member", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "not_council" } }).deps)
			expect(payloadText(replies[0])).toBe(queueNotCouncil)
		})

		it("reports an unknown user", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "unknown_user" } }).deps)
			expect(payloadText(replies[0])).toBe(queueUnknownUser)
		})

		it("shows a generic error when the quota lookup fails", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "error", code: 500 } }).deps)
			expect(payloadText(replies[0])).toBe(queueError)
		})
	})

	describe("resend", () => {
		it("defers before the slow resend and edits the reply once done", async () => {
			const { int, replies, defers, edits } = commandInteraction()
			const { deps, resendCalls } = commandDeps({ resend: "posted" })
			await handleQueue(int, deps)
			expect(defers).toHaveLength(1)
			expect(resendCalls).toHaveLength(1)
			expect(replies).toHaveLength(0)
			expect(payloadText(edits[0])).toBe(queueResendPosted)
		})

		it("tells the caller there is no board to resend", async () => {
			const { int, edits } = commandInteraction()
			await handleQueue(int, commandDeps({ resend: "empty" }).deps)
			expect(payloadText(edits[0])).toBe(queueResendEmpty)
		})

		it("reports a failed repost without claiming the board is empty", async () => {
			const { int, edits } = commandInteraction()
			await handleQueue(int, commandDeps({ resend: "failed" }).deps)
			expect(payloadText(edits[0])).toBe(queueResendFailed)
		})
	})
})

describe("handleQueueSeal", () => {
	it("replies with a confirm card carrying the lyrics id", async () => {
		const replies: unknown[] = []
		await handleQueueSeal({ reply: async (p) => replies.push(p) }, "4210")
		expect(payloadButtons(replies[0]).map((b) => b.custom_id)).toContain("queue.seal.confirm:4210")
	})

	it("shows an error for a missing lyrics id", async () => {
		const replies: unknown[] = []
		await handleQueueSeal({ reply: async (p) => replies.push(p) }, "")
		expect(payloadText(replies[0])).toBe(queueError)
	})
})

describe("handleQueueSealCancel", () => {
	it("updates the message to a cancelled notice", async () => {
		const updates: unknown[] = []
		await handleQueueSealCancel({ update: async (p) => updates.push(p) })
		expect(payloadText(updates[0])).toBe(queueSealCancelled)
	})
})

function sealDeps(result: SealResult, keyId: string | null = KEY_ID) {
	const calls: Array<[string, string]> = []
	const boardCalls: Array<[string, string]> = []
	return {
		calls,
		boardCalls,
		deps: {
			resolveKeyId: async () => keyId,
			boostLyrics: async (lyricsId: string, key: string) => {
				calls.push([lyricsId, key])
				return result
			},
			sealBoardCard: async (lyricsId: string, actorId: string) => {
				boardCalls.push([lyricsId, actorId])
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

describe("handleQueueSealConfirm", () => {
	it("seals, flips the board card, and acks without an undo on the ephemeral reply", async () => {
		const { int, updates } = updateInteraction()
		const { deps, calls, boardCalls } = sealDeps({
			status: "sealed",
			quota: { quota: 10, used: 2, remaining: 8, resetsAt: 1 },
		})
		await handleQueueSealConfirm(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID]])
		expect(boardCalls).toEqual([["4210", "disc-1"]])
		expect(payloadText(updates[0])).toBe(queueSealedBy("disc-1"))
		expect(payloadButtons(updates[0])).toHaveLength(0)
	})

	describe("error paths", () => {
		const cases: Array<[SealResult, string]> = [
			[{ status: "not_council" }, sealNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "self" }, sealSelf],
			[{ status: "target_council" }, sealTargetCouncil],
			[{ status: "over_quota" }, sealOverQuota],
			[{ status: "already_sealed" }, sealAlreadyActive],
			[{ status: "error", code: 500 }, sealError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message and never flips the board`, async () => {
				const { int, updates } = updateInteraction()
				const { deps, boardCalls } = sealDeps(result)
				await handleQueueSealConfirm(int, "4210", deps)
				expect(payloadText(updates[0])).toBe(copy)
				expect(boardCalls).toEqual([])
			})
		}
	})

	it("shows the connect card and never seals when unlinked", async () => {
		const { int, updates } = updateInteraction()
		const { deps, calls } = sealDeps({ status: "sealed", quota: {} as never }, null)
		await handleQueueSealConfirm(int, "4210", deps)
		expect(calls).toEqual([])
		expect(payloadText(updates[0])).toContain(connectHeading)
	})

	it("shows an error for a missing lyrics id", async () => {
		const { int, updates } = updateInteraction()
		const { deps, calls } = sealDeps({ status: "sealed", quota: {} as never })
		await handleQueueSealConfirm(int, "", deps)
		expect(calls).toEqual([])
		expect(payloadText(updates[0])).toBe(sealError)
	})
})

function sealUndoDeps(result: UnsealResult, storedEntry: QueueEntry | null = entry()) {
	const pendingCalls: string[] = []
	return {
		pendingCalls,
		deps: {
			resolveKeyId: async () => KEY_ID,
			unboostLyrics: async () => result,
			getEntry: async () => storedEntry,
			markPending: async (lyricsId: string) => {
				pendingCalls.push(lyricsId)
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

describe("handleQueueSealUndo", () => {
	it("restores the actionable card and marks the row pending on success", async () => {
		const { int, updates, replies } = boardInteraction()
		const { deps, pendingCalls } = sealUndoDeps({ status: "unsealed" })
		await handleQueueSealUndo(int, "4210", deps)
		expect(pendingCalls).toEqual(["4210"])
		expect(payloadText(updates[0])).toContain(queueEntryHeading("Never Gonna Give You Up"))
		expect(payloadButtons(updates[0]).map((b) => b.custom_id)).toContain("queue.seal:4210")
		expect(replies).toHaveLength(0)
	})

	it("falls back to a plain notice when the entry is gone", async () => {
		const { int, updates } = boardInteraction()
		await handleQueueSealUndo(int, "4210", sealUndoDeps({ status: "unsealed" }, null).deps)
		expect(payloadText(updates[0])).toBe(queueSealUndone)
	})

	describe("error paths keep the card and reply ephemerally", () => {
		const cases: Array<[UnsealResult, string]> = [
			[{ status: "not_owner" }, sealNotOwner],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "not_council" }, sealNotCouncil],
			[{ status: "error", code: 500 }, sealError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates, replies } = boardInteraction()
				await handleQueueSealUndo(int, "4210", sealUndoDeps(result).deps)
				expect(payloadText(replies[0])).toBe(copy)
				expect(updates).toHaveLength(0)
			})
		}
	})
})

describe("handleQueueReject", () => {
	it("opens a note modal whose submit id carries the lyrics id", async () => {
		const modals: ModalBuilder[] = []
		await handleQueueReject({ showModal: async (m) => modals.push(m) }, "4210")
		const json = modals[0]?.toJSON() as { custom_id?: string }
		expect(json.custom_id).toBe("queue.reject.submit:4210")
	})
})

function rejectDeps(
	result: RejectResult,
	keyId: string | null = KEY_ID,
	storedEntry: QueueEntry | null = entry()
) {
	const calls: Array<[string, string, string | undefined]> = []
	const rejectedCalls: Array<[string, string, string | null]> = []
	return {
		calls,
		rejectedCalls,
		deps: {
			resolveKeyId: async () => keyId,
			rejectLyric: async (lyricsId: string, key: string, note?: string) => {
				calls.push([lyricsId, key, note])
				return result
			},
			getEntry: async () => storedEntry,
			markRejected: async (lyricsId: string, actorId: string, note: string | null) => {
				rejectedCalls.push([lyricsId, actorId, note])
			},
			linkPageUrl: "https://unison.test/link",
		},
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

describe("handleQueueRejectSubmit", () => {
	it("rejects, flips the card to rejected with the note, and persists the decision", async () => {
		const { int, updates } = modalSubmit("  wrong sync throughout  ")
		const { deps, calls, rejectedCalls } = rejectDeps({ status: "rejected" })
		await handleQueueRejectSubmit(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID, "wrong sync throughout"]])
		expect(rejectedCalls).toEqual([["4210", "disc-1", "wrong sync throughout"]])
		const blob = payloadText(updates[0])
		expect(blob).toContain(queueRejectedBy("disc-1"))
		expect(blob).toContain(queueRejectNoteLine("wrong sync throughout"))
		expect(payloadButtons(updates[0]).map((b) => b.custom_id)).toContain("queue.reject.undo:4210")
	})

	it("omits the note when the field is blank", async () => {
		const { int } = modalSubmit("   ")
		const { deps, calls, rejectedCalls } = rejectDeps({ status: "rejected" })
		await handleQueueRejectSubmit(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID, undefined]])
		expect(rejectedCalls).toEqual([["4210", "disc-1", null]])
	})

	it("falls back to a plain notice when the card entry is gone", async () => {
		const { int, updates } = modalSubmit("note")
		await handleQueueRejectSubmit(
			int,
			"4210",
			rejectDeps({ status: "rejected" }, KEY_ID, null).deps
		)
		expect(payloadText(updates[0])).toBe(queueRejectedBy("disc-1"))
	})

	describe("error paths reply ephemerally and never flip the card", () => {
		const cases: Array<[RejectResult, string]> = [
			[{ status: "not_council" }, queueNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "already_rejected" }, queueAlreadyRejected],
			[{ status: "error", code: 500 }, queueError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates, replies } = modalSubmit("note")
				await handleQueueRejectSubmit(int, "4210", rejectDeps(result).deps)
				expect(payloadText(replies[0])).toBe(copy)
				expect(updates).toHaveLength(0)
			})
		}
	})

	it("shows the connect card and never rejects when unlinked", async () => {
		const { int, replies } = modalSubmit("note")
		const { deps, calls } = rejectDeps({ status: "rejected" }, null)
		await handleQueueRejectSubmit(int, "4210", deps)
		expect(calls).toEqual([])
		expect(payloadText(replies[0])).toContain(connectHeading)
	})
})

function rejectUndoDeps(result: UnrejectResult, storedEntry: QueueEntry | null = entry()) {
	const pendingCalls: string[] = []
	return {
		pendingCalls,
		deps: {
			resolveKeyId: async () => KEY_ID,
			unrejectLyric: async () => result,
			getEntry: async () => storedEntry,
			markPending: async (lyricsId: string) => {
				pendingCalls.push(lyricsId)
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

describe("handleQueueRejectUndo", () => {
	it("restores the actionable card and marks the row pending on success", async () => {
		const { int, updates } = boardInteraction()
		const { deps, pendingCalls } = rejectUndoDeps({ status: "unrejected" })
		await handleQueueRejectUndo(int, "4210", deps)
		expect(pendingCalls).toEqual(["4210"])
		expect(payloadButtons(updates[0]).map((b) => b.custom_id)).toContain("queue.reject:4210")
	})

	it("falls back to a plain notice when the entry is gone", async () => {
		const { int, updates } = boardInteraction()
		await handleQueueRejectUndo(int, "4210", rejectUndoDeps({ status: "unrejected" }, null).deps)
		expect(payloadText(updates[0])).toBe(queueRejectUndone)
	})

	describe("error paths reply ephemerally", () => {
		const cases: Array<[UnrejectResult, string]> = [
			[{ status: "not_council" }, queueNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "error", code: 500 }, queueError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates, replies } = boardInteraction()
				await handleQueueRejectUndo(int, "4210", rejectUndoDeps(result).deps)
				expect(payloadText(replies[0])).toBe(copy)
				expect(updates).toHaveLength(0)
			})
		}
	})
})

describe("invariants", () => {
	it("never leaks the keyId into any reply or update payload", async () => {
		const seal = updateInteraction()
		await handleQueueSealConfirm(
			seal.int,
			"4210",
			sealDeps({ status: "sealed", quota: { quota: 10, used: 2, remaining: 8, resetsAt: 1 } }).deps
		)
		expect(JSON.stringify(seal.updates)).not.toContain(KEY_ID)

		const sealUndo = boardInteraction()
		await handleQueueSealUndo(sealUndo.int, "4210", sealUndoDeps({ status: "unsealed" }).deps)
		expect(JSON.stringify(sealUndo.updates)).not.toContain(KEY_ID)

		const reject = modalSubmit("note")
		await handleQueueRejectSubmit(reject.int, "4210", rejectDeps({ status: "rejected" }).deps)
		expect(JSON.stringify(reject.updates)).not.toContain(KEY_ID)

		const rejectUndo = boardInteraction()
		await handleQueueRejectUndo(
			rejectUndo.int,
			"4210",
			rejectUndoDeps({ status: "unrejected" }).deps
		)
		expect(JSON.stringify(rejectUndo.updates)).not.toContain(KEY_ID)
	})
})
