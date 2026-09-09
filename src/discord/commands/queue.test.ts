import { connectHeading } from "@/copy/strings"
import {
	queueAlreadyRejected,
	queueEmpty,
	queueError,
	queueNotCouncil,
	queueRejectUndone,
	queueRejectedBy,
	queueSealCancelled,
	queueSealUndone,
	queueSealedBy,
	queueUndoRejectButtonLabel,
	queueUndoSealButtonLabel,
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
	QueueResult,
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
	const followUps: unknown[] = []
	return {
		int: {
			user: { id: "disc-1" },
			reply: async (p: unknown) => {
				replies.push(p)
			},
			followUp: async (p: unknown) => {
				followUps.push(p)
			},
		},
		replies,
		followUps,
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
	queue?: QueueResult
}) {
	return {
		resolveKeyId: async () => (overrides.keyId === undefined ? KEY_ID : overrides.keyId),
		getBoostQuota: async (): Promise<QuotaResult> =>
			overrides.quota ?? { status: "ok", quota: { quota: 10, used: 1, remaining: 9, resetsAt: 1 } },
		getQueue: async (): Promise<QueueResult> => overrides.queue ?? { status: "ok", entries: [] },
		linkPageUrl: "https://unison.test/link",
	}
}

describe("handleQueue", () => {
	describe("gates", () => {
		it("shows the connect card and never calls the queue when unlinked", async () => {
			const { int, replies } = commandInteraction()
			let queueCalled = 0
			await handleQueue(int, {
				...commandDeps({ keyId: null }),
				getQueue: async () => {
					queueCalled++
					return { status: "ok", entries: [] }
				},
			})
			expect(payloadText(replies[0])).toContain(connectHeading)
			expect(queueCalled).toBe(0)
		})

		it("refuses a non-council member", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "not_council" } }))
			expect(payloadText(replies[0])).toBe(queueNotCouncil)
		})

		it("reports an unknown user", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "unknown_user" } }))
			expect(payloadText(replies[0])).toBe(queueUnknownUser)
		})

		it("shows a generic error when the quota lookup fails", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ quota: { status: "error", code: 500 } }))
			expect(payloadText(replies[0])).toBe(queueError)
		})
	})

	describe("happy paths", () => {
		it("replies with the first card and follows up with the rest", async () => {
			const { int, replies, followUps } = commandInteraction()
			await handleQueue(
				int,
				commandDeps({
					queue: {
						status: "ok",
						entries: [entry({ id: 1, song: "First" }), entry({ id: 2, song: "Second" })],
					},
				})
			)
			expect(payloadText(replies[0])).toContain("First")
			expect(followUps).toHaveLength(1)
			expect(payloadText(followUps[0])).toContain("Second")
		})
	})

	describe("edge and error paths", () => {
		it("shows the empty message when nothing is queued", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ queue: { status: "ok", entries: [] } }))
			expect(payloadText(replies[0])).toBe(queueEmpty)
		})

		it("shows a generic error when the queue lookup fails", async () => {
			const { int, replies } = commandInteraction()
			await handleQueue(int, commandDeps({ queue: { status: "error", code: 500 } }))
			expect(payloadText(replies[0])).toBe(queueError)
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
	return {
		calls,
		deps: {
			resolveKeyId: async () => keyId,
			boostLyrics: async (lyricsId: string, key: string) => {
				calls.push([lyricsId, key])
				return result
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

describe("handleQueueSealConfirm", () => {
	it("seals and shows an undo affordance on success", async () => {
		const { int, updates } = updateInteraction()
		const { deps, calls } = sealDeps({
			status: "sealed",
			quota: { quota: 10, used: 2, remaining: 8, resetsAt: 1 },
		})
		await handleQueueSealConfirm(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID]])
		expect(payloadText(updates[0])).toBe(queueSealedBy("disc-1"))
		const undo = payloadButtons(updates[0])[0]
		expect(undo?.label).toBe(queueUndoSealButtonLabel)
		expect(undo?.custom_id).toBe("queue.seal.undo:4210")
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
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates } = updateInteraction()
				await handleQueueSealConfirm(int, "4210", sealDeps(result).deps)
				expect(payloadText(updates[0])).toBe(copy)
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

describe("handleQueueSealUndo", () => {
	function undoDeps(result: UnsealResult) {
		return {
			resolveKeyId: async () => KEY_ID,
			unboostLyrics: async () => result,
			linkPageUrl: "https://unison.test/link",
		}
	}

	it("removes the seal on success", async () => {
		const { int, updates } = updateInteraction()
		await handleQueueSealUndo(int, "4210", undoDeps({ status: "unsealed" }))
		expect(payloadText(updates[0])).toBe(queueSealUndone)
	})

	describe("error paths", () => {
		const cases: Array<[UnsealResult, string]> = [
			[{ status: "not_owner" }, sealNotOwner],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "not_council" }, sealNotCouncil],
			[{ status: "error", code: 500 }, sealError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates } = updateInteraction()
				await handleQueueSealUndo(int, "4210", undoDeps(result))
				expect(payloadText(updates[0])).toBe(copy)
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

function rejectDeps(result: RejectResult, keyId: string | null = KEY_ID) {
	const calls: Array<[string, string, string | undefined]> = []
	return {
		calls,
		deps: {
			resolveKeyId: async () => keyId,
			rejectLyric: async (lyricsId: string, key: string, note?: string) => {
				calls.push([lyricsId, key, note])
				return result
			},
			linkPageUrl: "https://unison.test/link",
		},
	}
}

function modalSubmit(note: string) {
	const replies: unknown[] = []
	return {
		int: {
			user: { id: "disc-1" },
			fields: { getTextInputValue: (_id: string) => note },
			reply: async (p: unknown) => {
				replies.push(p)
			},
		},
		replies,
	}
}

describe("handleQueueRejectSubmit", () => {
	it("rejects with the trimmed note and shows an undo affordance", async () => {
		const { int, replies } = modalSubmit("  wrong sync throughout  ")
		const { deps, calls } = rejectDeps({ status: "rejected" })
		await handleQueueRejectSubmit(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID, "wrong sync throughout"]])
		expect(payloadText(replies[0])).toBe(queueRejectedBy("disc-1"))
		const undo = payloadButtons(replies[0])[0]
		expect(undo?.label).toBe(queueUndoRejectButtonLabel)
		expect(undo?.custom_id).toBe("queue.reject.undo:4210")
	})

	it("omits the note when the field is blank", async () => {
		const { int } = modalSubmit("   ")
		const { deps, calls } = rejectDeps({ status: "rejected" })
		await handleQueueRejectSubmit(int, "4210", deps)
		expect(calls).toEqual([["4210", KEY_ID, undefined]])
	})

	describe("error paths", () => {
		const cases: Array<[RejectResult, string]> = [
			[{ status: "not_council" }, queueNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "already_rejected" }, queueAlreadyRejected],
			[{ status: "error", code: 500 }, queueError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, replies } = modalSubmit("note")
				await handleQueueRejectSubmit(int, "4210", rejectDeps(result).deps)
				expect(payloadText(replies[0])).toBe(copy)
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

describe("handleQueueRejectUndo", () => {
	function undoDeps(result: UnrejectResult) {
		return {
			resolveKeyId: async () => KEY_ID,
			unrejectLyric: async () => result,
			linkPageUrl: "https://unison.test/link",
		}
	}

	it("lifts the rejection on success", async () => {
		const { int, updates } = updateInteraction()
		await handleQueueRejectUndo(int, "4210", undoDeps({ status: "unrejected" }))
		expect(payloadText(updates[0])).toBe(queueRejectUndone)
	})

	describe("error paths", () => {
		const cases: Array<[UnrejectResult, string]> = [
			[{ status: "not_council" }, queueNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "error", code: 500 }, queueError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { int, updates } = updateInteraction()
				await handleQueueRejectUndo(int, "4210", undoDeps(result))
				expect(payloadText(updates[0])).toBe(copy)
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

		const sealUndo = updateInteraction()
		await handleQueueSealUndo(sealUndo.int, "4210", {
			resolveKeyId: async () => KEY_ID,
			unboostLyrics: async () => ({ status: "unsealed" }),
			linkPageUrl: "https://unison.test/link",
		})
		expect(JSON.stringify(sealUndo.updates)).not.toContain(KEY_ID)

		const reject = modalSubmit("note")
		await handleQueueRejectSubmit(reject.int, "4210", rejectDeps({ status: "rejected" }).deps)
		expect(JSON.stringify(reject.replies)).not.toContain(KEY_ID)

		const rejectUndo = updateInteraction()
		await handleQueueRejectUndo(rejectUndo.int, "4210", {
			resolveKeyId: async () => KEY_ID,
			unrejectLyric: async () => ({ status: "unrejected" }),
			linkPageUrl: "https://unison.test/link",
		})
		expect(JSON.stringify(rejectUndo.updates)).not.toContain(KEY_ID)
	})
})
