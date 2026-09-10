import {
	queueCancelButtonLabel,
	queueConfirmSealButtonLabel,
	queueEntryHeading,
	queueRejectButtonLabel,
	queueRejectNoteLine,
	queueRejectedBy,
	queueRejectedGeneric,
	queueSealButtonLabel,
	queueSealedBy,
	queueSealedGeneric,
	queueUndoRejectButtonLabel,
	queueUndoSealButtonLabel,
	queueVerifyButtonLabel,
} from "@/copy/strings"
import type { QueueEntry } from "@/unison/client"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	buildBoardCard,
	buildQueueCard,
	buildQueueRejectedCard,
	buildQueueResultCard,
	buildQueueSealConfirmCard,
	buildQueueSealedCard,
} from "./queue-card"

interface ComponentNode {
	type: number
	content?: string
	components?: ComponentNode[]
	custom_id?: string
	url?: string
	label?: string
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	for (const child of node.components ?? []) walk(child, out)
}

function nodes(card: { components: ContainerBuilder[] }): ComponentNode[] {
	const out: ComponentNode[] = []
	walk(card.components[0]?.toJSON() as unknown as ComponentNode, out)
	return out
}

function textBlob(card: { components: ContainerBuilder[] }): string {
	return nodes(card)
		.filter((n) => n.type === 10)
		.map((n) => n.content ?? "")
		.join("\n")
}

function buttons(card: { components: ContainerBuilder[] }): ComponentNode[] {
	return nodes(card).filter((n) => n.type === 2)
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

describe("buildQueueCard", () => {
	describe("happy paths", () => {
		it("renders the song, details, a verify link, and seal/reject buttons carrying the lyrics id", () => {
			const card = buildQueueCard(entry())
			const blob = textBlob(card)
			expect(blob).toContain(queueEntryHeading("Never Gonna Give You Up"))
			expect(blob).toContain("Rick Astley")
			expect(blob).toContain("41 votes")
			expect(blob).toContain("score 87")
			expect(blob).toContain("by Alice")

			const btns = buttons(card)
			const verify = btns.find((b) => b.label === queueVerifyButtonLabel)
			expect(verify?.url).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ")
			expect(btns.find((b) => b.label === queueSealButtonLabel)?.custom_id).toBe("queue.seal:4210")
			expect(btns.find((b) => b.label === queueRejectButtonLabel)?.custom_id).toBe(
				"queue.reject:4210"
			)
		})

		it("is a components v2 payload", () => {
			expect(buildQueueCard(entry()).flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("TTML signals", () => {
		it("shows a clean line when a ttml lyric has no signals", () => {
			expect(textBlob(buildQueueCard(entry({ ttmlSignals: [] })))).toContain(
				"TTML: no issues flagged."
			)
		})

		it("humanizes the signal codes when present", () => {
			const blob = textBlob(
				buildQueueCard(entry({ ttmlSignals: ["line-synced", "unbracketed-bg"] }))
			)
			expect(blob).toContain("line-synced (not word-by-word)")
			expect(blob).toContain("unbracketed background vocals")
		})

		it("omits the signals line for a non-ttml lyric", () => {
			const blob = textBlob(buildQueueCard(entry({ format: "lrc", ttmlSignals: [] })))
			expect(blob).not.toContain("TTML")
		})
	})

	describe("edge cases", () => {
		it("drops the submitter clause when the submitter is unknown", () => {
			const blob = textBlob(buildQueueCard(entry({ submitterName: null })))
			expect(blob).not.toContain("by ")
		})
	})
})

describe("board cards suppress mentions", () => {
	it("regression: a rejected card renders its note but pings nobody", () => {
		const card = buildQueueRejectedCard(entry(), "777", "@everyone drop everything")
		expect(textBlob(card)).toContain(queueRejectNoteLine("@everyone drop everything"))
		expect(card.allowedMentions).toEqual({ parse: [] })
	})

	it("suppresses mentions on pending and sealed cards too", () => {
		expect(buildQueueCard(entry()).allowedMentions).toEqual({ parse: [] })
		expect(buildQueueSealedCard(entry(), "777").allowedMentions).toEqual({ parse: [] })
		expect(
			buildBoardCard({ state: "rejected", entry: entry(), actorId: "777", note: "@here" })
				.allowedMentions
		).toEqual({ parse: [] })
	})
})

describe("buildQueueSealConfirmCard", () => {
	it("offers confirm and cancel buttons, with the lyrics id only on confirm", () => {
		const btns = buttons(buildQueueSealConfirmCard("4210"))
		expect(btns.find((b) => b.label === queueConfirmSealButtonLabel)?.custom_id).toBe(
			"queue.seal.confirm:4210"
		)
		expect(btns.find((b) => b.label === queueCancelButtonLabel)?.custom_id).toBe(
			"queue.seal.cancel"
		)
	})
})

describe("buildQueueSealedCard", () => {
	it("shows the song, a sealed-by line, a verify link, and an undo-seal button, no seal/reject", () => {
		const card = buildQueueSealedCard(entry(), "777")
		const blob = textBlob(card)
		expect(blob).toContain(queueEntryHeading("Never Gonna Give You Up"))
		expect(blob).toContain(queueSealedBy("777"))

		const btns = buttons(card)
		expect(btns.find((b) => b.label === queueVerifyButtonLabel)?.url).toBe(
			"https://music.youtube.com/watch?v=dQw4w9WgXcQ"
		)
		expect(btns.find((b) => b.label === queueUndoSealButtonLabel)?.custom_id).toBe(
			"queue.seal.undo:4210"
		)
		expect(btns.find((b) => b.label === queueSealButtonLabel)).toBeUndefined()
		expect(btns.find((b) => b.label === queueRejectButtonLabel)).toBeUndefined()
	})

	it("falls back to a generic sealed line when no actor is known", () => {
		expect(textBlob(buildQueueSealedCard(entry(), null))).toContain(queueSealedGeneric)
	})
})

describe("buildQueueRejectedCard", () => {
	it("shows a rejected-by line, the reason note, and an undo-reject button", () => {
		const card = buildQueueRejectedCard(entry(), "777", "line-synced only")
		const blob = textBlob(card)
		expect(blob).toContain(queueRejectedBy("777"))
		expect(blob).toContain(queueRejectNoteLine("line-synced only"))
		expect(buttons(card).find((b) => b.label === queueUndoRejectButtonLabel)?.custom_id).toBe(
			"queue.reject.undo:4210"
		)
	})

	it("omits the reason line when there is no note", () => {
		expect(textBlob(buildQueueRejectedCard(entry(), "777", null))).not.toContain("Reason:")
	})

	it("falls back to a generic rejected line when no actor is known", () => {
		expect(textBlob(buildQueueRejectedCard(entry(), null, null))).toContain(queueRejectedGeneric)
	})
})

describe("buildBoardCard", () => {
	it("renders a pending card with seal and reject buttons", () => {
		const btns = buttons(
			buildBoardCard({ state: "pending", entry: entry(), actorId: null, note: null })
		)
		expect(btns.find((b) => b.label === queueSealButtonLabel)).toBeDefined()
		expect(btns.find((b) => b.label === queueRejectButtonLabel)).toBeDefined()
	})

	it("renders a sealed card with an undo-seal button", () => {
		const btns = buttons(
			buildBoardCard({ state: "sealed", entry: entry(), actorId: "777", note: null })
		)
		expect(btns.find((b) => b.label === queueUndoSealButtonLabel)).toBeDefined()
	})

	it("renders a rejected card with an undo-reject button and the note", () => {
		const card = buildBoardCard({
			state: "rejected",
			entry: entry(),
			actorId: "777",
			note: "capitalization",
		})
		expect(buttons(card).find((b) => b.label === queueUndoRejectButtonLabel)).toBeDefined()
		expect(textBlob(card)).toContain(queueRejectNoteLine("capitalization"))
	})
})

describe("buildQueueResultCard", () => {
	it("renders just the line with no buttons", () => {
		const card = buildQueueResultCard("Cancelled.")
		expect(textBlob(card)).toContain("Cancelled.")
		expect(buttons(card)).toHaveLength(0)
	})
})
