import {
	councilBookmarkLine,
	councilDashboardButtonLabel,
	queueCancelButtonLabel,
	queueConfirmSealBody,
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
import type { CouncilBookmark, QueueEntry } from "@/unison/client"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	buildBoardCard,
	buildConfirmCard,
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
		ttmlFlags: [],
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
			expect(textBlob(buildQueueCard(entry({ ttmlFlags: [] })))).toContain(
				"TTML: no issues flagged."
			)
		})

		it("shows Unison's labels for the signals", () => {
			const blob = textBlob(
				buildQueueCard(
					entry({
						ttmlFlags: [
							{ code: "line-synced", label: "Line-synced, not word-by-word" },
							{ code: "unbracketed-bg", label: "Unbracketed background vocals" },
						],
					})
				)
			)
			expect(blob).toContain("Line-synced, not word-by-word · Unbracketed background vocals")
		})

		it("omits the signals line for a non-ttml lyric", () => {
			const blob = textBlob(buildQueueCard(entry({ format: "lrc", ttmlFlags: [] })))
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
		const card = buildQueueRejectedCard(entry(), "777", "@everyone drop everything", 318)
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
	const undoId = (card: ReturnType<typeof buildQueueRejectedCard>) =>
		buttons(card).find((b) => b.label === queueUndoRejectButtonLabel)?.custom_id

	it("shows a rejected-by line, the reason note, and an undo-reject button", () => {
		const card = buildQueueRejectedCard(entry(), "777", "line-synced only", 318)
		const blob = textBlob(card)
		expect(blob).toContain(queueRejectedBy("777"))
		expect(blob).toContain(queueRejectNoteLine("line-synced only"))
		expect(undoId(card)).toBe("queue.reject.undo:4210:318")
	})

	it("omits the reason line when there is no note", () => {
		expect(textBlob(buildQueueRejectedCard(entry(), "777", null, 318))).not.toContain("Reason:")
	})

	it("falls back to a generic rejected line when no actor is known", () => {
		expect(textBlob(buildQueueRejectedCard(entry(), null, null, 318))).toContain(
			queueRejectedGeneric
		)
	})

	describe("edge cases", () => {
		it("keeps the legacy undo id when the rejection id is unknown", () => {
			expect(undoId(buildQueueRejectedCard(entry(), "777", null, null))).toBe(
				"queue.reject.undo:4210"
			)
		})

		it("fits the largest ids inside the 100-char custom id limit", () => {
			const id = undoId(
				buildQueueRejectedCard(
					entry({ id: Number.MAX_SAFE_INTEGER }),
					"777",
					null,
					Number.MAX_SAFE_INTEGER
				)
			)
			expect(id).toBe(`queue.reject.undo:${Number.MAX_SAFE_INTEGER}:${Number.MAX_SAFE_INTEGER}`)
			expect(id?.length).toBeLessThanOrEqual(100)
		})
	})

	describe("regressions", () => {
		it("regression: undo names the rejection this card created", () => {
			const [, lyricsId, rejectionId] = (
				undoId(buildQueueRejectedCard(entry(), "777", "bad sync", 318)) ?? ""
			).split(":")
			expect([lyricsId, rejectionId]).toEqual(["4210", "318"])
		})
	})
})

const bookmark: CouncilBookmark = {
	itemType: "seal",
	itemId: 4210,
	holder: { displayName: "boidu", discordId: "111" },
	expiresAt: 1_790_259_200,
}

describe("council dashboard on queue cards", () => {
	it("links a pending card to the item in the dashboard", () => {
		const link = buttons(buildQueueCard(entry())).find(
			(b) => b.label === councilDashboardButtonLabel
		)
		expect(link?.url).toBe("https://unison.betterlyrics.org/council/queue?item=4210")
	})

	it("shows who holds a web bookmark and when it lapses", () => {
		expect(textBlob(buildQueueCard(entry(), bookmark))).toContain(
			councilBookmarkLine(bookmark.holder, bookmark.expiresAt)
		)
	})

	it("has no bookmark line without a bookmark", () => {
		expect(textBlob(buildQueueCard(entry()))).not.toContain("Bookmarked")
	})

	it("carries the stored bookmark onto a pending board card only", () => {
		const pending = buildBoardCard({
			state: "pending",
			entry: entry(),
			actorId: null,
			note: null,
			bookmark,
		})
		const sealed = buildBoardCard({
			state: "sealed",
			entry: entry(),
			actorId: "777",
			note: null,
			bookmark,
		})
		expect(textBlob(pending)).toContain("Bookmarked on the web")
		expect(textBlob(sealed)).not.toContain("Bookmarked on the web")
	})

	it("regression: a bookmark line pings nobody", () => {
		expect(buildQueueCard(entry(), bookmark).allowedMentions).toEqual({ parse: [] })
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

	it("keeps the stored rejection id on a re-rendered rejected card", () => {
		const card = buildBoardCard({
			state: "rejected",
			entry: entry(),
			actorId: "777",
			note: null,
			rejectionId: 318,
		})
		expect(buttons(card).find((b) => b.label === queueUndoRejectButtonLabel)?.custom_id).toBe(
			"queue.reject.undo:4210:318"
		)
	})

	it("re-renders a row stored before rejection ids with the legacy undo id", () => {
		const card = buildBoardCard({ state: "rejected", entry: entry(), actorId: "777", note: null })
		expect(buttons(card).find((b) => b.label === queueUndoRejectButtonLabel)?.custom_id).toBe(
			"queue.reject.undo:4210"
		)
	})
})

describe("buildQueueResultCard", () => {
	it("renders just the line with no buttons", () => {
		const card = buildQueueResultCard("Cancelled.")
		expect(textBlob(card)).toContain("Cancelled.")
		expect(buttons(card)).toHaveLength(0)
	})
})

describe("buildConfirmCard", () => {
	const opts = {
		body: "Approve this?",
		confirmLabel: "Confirm approve",
		confirmId: "revision.approve.confirm:4210:918",
		cancelId: "revision.approve.cancel",
	}

	describe("happy paths", () => {
		it("shows the body with a confirm button and the shared cancel button", () => {
			const card = buildConfirmCard(opts)
			expect(textBlob(card)).toBe("Approve this?")
			const btns = buttons(card)
			expect(btns.map((b) => [b.label, b.custom_id])).toEqual([
				["Confirm approve", "revision.approve.confirm:4210:918"],
				[queueCancelButtonLabel, "revision.approve.cancel"],
			])
		})

		it("is a components v2 payload", () => {
			expect(buildConfirmCard(opts).flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe("invariants", () => {
		it("regression: the seal confirm card is unchanged by the extraction", () => {
			const card = buildQueueSealConfirmCard("4210")
			expect(textBlob(card)).toBe(queueConfirmSealBody)
			expect(buttons(card).map((b) => [b.label, b.custom_id])).toEqual([
				[queueConfirmSealButtonLabel, "queue.seal.confirm:4210"],
				[queueCancelButtonLabel, "queue.seal.cancel"],
			])
		})
	})
})
