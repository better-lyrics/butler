import {
	queueCancelButtonLabel,
	queueEntryHeading,
	queueRejectButtonLabel,
	queueRejectNoteLine,
	queueVerifyButtonLabel,
	revisionApproveButtonLabel,
	revisionApprovedBy,
	revisionConfirmApproveBody,
	revisionConfirmApproveButtonLabel,
	revisionDetails,
	revisionKicker,
	revisionPreviewEmpty,
	revisionPreviewTrimmed,
	revisionReasonLine,
	revisionRejectedBy,
	revisionResolved,
} from "@/copy/strings"
import { routeInteraction } from "@/discord/interactions/router"
import { pendingRevision } from "@/unison/__fixtures__/pending-revision"
import type { PendingReason } from "@/unison/client"
import { type ContainerBuilder, MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	REVISION_PREVIEW_MAX_CHARS,
	REVISION_PREVIEW_MAX_LINES,
	buildRevisionApproveConfirmCard,
	buildRevisionCard,
	formatDiffPreview,
	revisionCardEdit,
} from "./revision-card"

interface ComponentNode {
	type: number
	content?: string
	components?: ComponentNode[]
	custom_id?: string
	url?: string
	label?: string
	file?: { url: string }
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

function fileNodes(card: { components: ContainerBuilder[] }): ComponentNode[] {
	return nodes(card).filter((n) => n.type === 13)
}

function diffBlock(card: { components: ContainerBuilder[] }): string | undefined {
	return nodes(card).find((n) => n.type === 10 && n.content?.startsWith("```diff"))?.content
}

function blockLines(block: string): string[] {
	return block.split("\n").slice(1, -1)
}

const FENCE_OVERHEAD = "```diff\n\n```".length

describe("buildRevisionCard", () => {
	describe("happy paths", () => {
		it("renders the kicker, song, details, reason line, and the diff preview", () => {
			const card = pendingRevision()
			const payload = buildRevisionCard(card)
			const blob = textBlob(payload)
			expect(blob).toContain(revisionKicker)
			expect(blob).toContain(queueEntryHeading("Never Gonna Give You Up"))
			expect(blob).toContain(revisionDetails(card))
			expect(blob).toContain(revisionReasonLine(card))
			expect(diffBlock(payload)).toBe(`\`\`\`diff\n${card.diffPreview}\n\`\`\``)
			expect(blob).not.toContain(revisionPreviewTrimmed)
		})

		it("offers a YT Music link plus approve and reject carrying both ids", () => {
			const btns = buttons(buildRevisionCard(pendingRevision()))
			expect(btns.find((b) => b.label === queueVerifyButtonLabel)?.url).toBe(
				"https://music.youtube.com/watch?v=dQw4w9WgXcQ"
			)
			expect(btns.find((b) => b.label === revisionApproveButtonLabel)?.custom_id).toBe(
				"revision.approve:4210:918"
			)
			expect(btns.find((b) => b.label === queueRejectButtonLabel)?.custom_id).toBe(
				"revision.reject:4210:918"
			)
		})

		it("attaches the full diff as a .diff file shown by a file component", () => {
			const payload = buildRevisionCard(pendingRevision())
			expect(payload.files).toHaveLength(1)
			expect(payload.files[0]?.name).toBe("lyric-4210-rev-3.diff")
			expect((payload.files[0]?.attachment as Buffer).toString("utf8")).toBe(
				pendingRevision().diffFull
			)
			expect(fileNodes(payload).map((n) => n.file?.url)).toEqual([
				"attachment://lyric-4210-rev-3.diff",
			])
		})

		it("is a components v2 payload that pings nobody", () => {
			const payload = buildRevisionCard(pendingRevision())
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
			expect(payload.allowedMentions).toEqual({ parse: [] })
		})
	})

	describe("reason labels", () => {
		const cases: Array<[PendingReason | null, number | null, string]> = [
			["sealed", null, "Sealed lyric"],
			["large_text_drift", null, "Large text change"],
			["large_timing_drift", null, "Large timing change"],
			["flagged", 0.82, "Flagged by Jev 82%"],
			["flagged", null, "Flagged by Jev"],
			[null, null, "Needs review"],
		]

		for (const [pendingReason, jevProbability, label] of cases) {
			it(`labels ${String(pendingReason)} / ${String(jevProbability)} as ${label}`, () => {
				const blob = textBlob(buildRevisionCard(pendingRevision({ pendingReason, jevProbability })))
				expect(blob).toContain(`**${label}**`)
			})
		}

		it("shows both drift percentages", () => {
			const blob = textBlob(buildRevisionCard(pendingRevision()))
			expect(blob).toContain("text change 23%")
			expect(blob).toContain("timing change 4%")
		})
	})

	describe("edge cases", () => {
		it("drops the author clause for a null author", () => {
			const blob = textBlob(buildRevisionCard(pendingRevision({ author: null })))
			expect(blob).not.toContain(" · by ")
		})

		it("shows the empty-preview line and no diff block for a blank preview", () => {
			const payload = buildRevisionCard(pendingRevision({ diffPreview: "  \n" }))
			expect(textBlob(payload)).toContain(revisionPreviewEmpty)
			expect(diffBlock(payload)).toBeUndefined()
			expect(payload.files).toHaveLength(1)
		})

		it("sends no file and no file component when the full diff is blank", () => {
			const payload = buildRevisionCard(pendingRevision({ diffFull: "" }))
			expect(payload.files).toEqual([])
			expect(fileNodes(payload)).toEqual([])
		})

		it("clips an over-long song, artist, and author", () => {
			const blob = textBlob(
				buildRevisionCard(
					pendingRevision({
						song: "S".repeat(500),
						artist: "A".repeat(500),
						author: { displayName: "D".repeat(500) },
					})
				)
			)
			expect(blob).toContain(`**${"S".repeat(199)}…**`)
			expect(blob).toContain(`${"A".repeat(199)}… · Rev 3`)
			expect(blob).toContain(`by ${"D".repeat(99)}…`)
			expect(blob).not.toContain("S".repeat(200))
		})

		it("keeps unicode diff lines intact", () => {
			const diffPreview = "-[00:12.00] 夜に駆ける\n+[00:12.00] 夜に駆ける (YOASOBI)"
			expect(diffBlock(buildRevisionCard(pendingRevision({ diffPreview })))).toBe(
				`\`\`\`diff\n${diffPreview}\n\`\`\``
			)
		})
	})

	describe("limits and truncation", () => {
		it("caps a long diff at the line limit and says it was trimmed", () => {
			const diffPreview = Array.from({ length: 40 }, (_, i) => `+line ${i}`).join("\n")
			const payload = buildRevisionCard(pendingRevision({ diffPreview }))
			const block = diffBlock(payload) ?? ""
			expect(blockLines(block)).toHaveLength(REVISION_PREVIEW_MAX_LINES)
			expect(textBlob(payload)).toContain(revisionPreviewTrimmed)
		})

		it("caps a single huge line at the char limit", () => {
			const payload = buildRevisionCard(pendingRevision({ diffPreview: `+${"a".repeat(5000)}` }))
			const block = diffBlock(payload) ?? ""
			expect(block.length).toBeLessThanOrEqual(REVISION_PREVIEW_MAX_CHARS + FENCE_OVERHEAD)
			expect(block.endsWith("…\n```")).toBe(true)
			expect(textBlob(payload)).toContain(revisionPreviewTrimmed)
		})

		it("caps many long lines by total chars before the line limit", () => {
			const diffPreview = Array.from({ length: 12 }, (_, i) => `+${i} ${"x".repeat(300)}`).join(
				"\n"
			)
			const block = diffBlock(buildRevisionCard(pendingRevision({ diffPreview }))) ?? ""
			expect(blockLines(block).join("\n").length).toBeLessThanOrEqual(REVISION_PREVIEW_MAX_CHARS)
			expect(blockLines(block).length).toBeLessThan(12)
		})

		it("attaches a very long full diff whole", () => {
			const diffFull = `+${"x".repeat(200_000)}`
			const payload = buildRevisionCard(pendingRevision({ diffFull }))
			expect((payload.files[0]?.attachment as Buffer).toString("utf8")).toBe(diffFull)
		})

		it("keeps all card text under Discord's 4000 char budget for worst-case input", () => {
			const payload = buildRevisionCard(
				pendingRevision({
					song: "S".repeat(5000),
					artist: "A".repeat(5000),
					author: { displayName: "D".repeat(5000) },
					diffPreview: Array.from({ length: 50 }, (_, i) => `+${i} ${"x".repeat(500)}`).join("\n"),
				}),
				{ kind: "rejected", actorId: "777", note: "n".repeat(300) }
			)
			expect(textBlob(payload).length).toBeLessThan(4000)
		})
	})

	describe("regressions", () => {
		it("regression: a diff containing a code fence cannot close the diff block early", () => {
			const diffPreview = "+```js\n+const x = 1\n+```"
			const block = diffBlock(buildRevisionCard(pendingRevision({ diffPreview }))) ?? ""
			expect(block.split("```").length - 1).toBe(2)
		})

		it("regression: a reject note with @everyone pings nobody", () => {
			const payload = buildRevisionCard(pendingRevision(), {
				kind: "rejected",
				actorId: "777",
				note: "@everyone drop everything",
			})
			expect(textBlob(payload)).toContain(queueRejectNoteLine("@everyone drop everything"))
			expect(payload.allowedMentions).toEqual({ parse: [] })
		})
	})

	describe("outcomes", () => {
		it("an approved card names the approver, keeps the diff, and drops the decision buttons", () => {
			const payload = buildRevisionCard(pendingRevision(), { kind: "approved", actorId: "777" })
			expect(textBlob(payload)).toContain(revisionApprovedBy("777"))
			expect(buttons(payload).map((b) => b.label)).toEqual([queueVerifyButtonLabel])
			expect(payload.files).toHaveLength(1)
		})

		it("a rejected card names the rejecter and shows the note", () => {
			const blob = textBlob(
				buildRevisionCard(pendingRevision(), {
					kind: "rejected",
					actorId: "777",
					note: "timing is off",
				})
			)
			expect(blob).toContain(revisionRejectedBy("777"))
			expect(blob).toContain(queueRejectNoteLine("timing is off"))
		})

		it("a rejected card without a note has no reason line", () => {
			const blob = textBlob(
				buildRevisionCard(pendingRevision(), { kind: "rejected", actorId: "777", note: null })
			)
			expect(blob).not.toContain("Reason:")
		})

		it("a resolved card says it is no longer pending and drops the decision buttons", () => {
			const payload = buildRevisionCard(pendingRevision(), { kind: "resolved" })
			expect(textBlob(payload)).toContain(revisionResolved)
			expect(buttons(payload).map((b) => b.label)).toEqual([queueVerifyButtonLabel])
		})
	})

	describe("invariants", () => {
		it("every decision button routes back to its handler with both ids", () => {
			for (const button of buttons(buildRevisionCard(pendingRevision()))) {
				if (!button.custom_id) continue
				expect(routeInteraction(button.custom_id)?.args).toEqual(["4210", "918"])
			}
		})

		it("custom ids stay within Discord's 100 chars for the largest ids", () => {
			const max = Number.MAX_SAFE_INTEGER
			const btns = buttons(buildRevisionCard(pendingRevision({ lyricsId: max, revisionId: max })))
			for (const b of btns) expect((b.custom_id ?? "").length).toBeLessThanOrEqual(100)
		})

		it("never exceeds Discord's 40 component cap", () => {
			const payload = buildRevisionCard(pendingRevision(), {
				kind: "rejected",
				actorId: "777",
				note: "n",
			})
			expect(nodes(payload).length).toBeLessThanOrEqual(40)
		})

		it("does not mutate the card it renders", () => {
			const card = pendingRevision()
			const before = structuredClone(card)
			buildRevisionCard(card, { kind: "resolved" })
			expect(card).toEqual(before)
		})
	})
})

describe("formatDiffPreview", () => {
	it("normalizes CRLF and drops trailing newlines", () => {
		expect(formatDiffPreview("-a\r\n+b\r\n\n")).toEqual({
			block: "```diff\n-a\n+b\n```",
			trimmed: false,
		})
	})

	it("returns no block for a whitespace-only preview", () => {
		expect(formatDiffPreview(" \n\t\n")).toEqual({ block: null, trimmed: false })
	})

	it("keeps exactly the line limit without marking it trimmed", () => {
		const diff = Array.from({ length: REVISION_PREVIEW_MAX_LINES }, (_, i) => `+${i}`).join("\n")
		expect(formatDiffPreview(diff).trimmed).toBe(false)
	})
})

describe("buildRevisionApproveConfirmCard", () => {
	it("asks for confirmation with confirm and cancel ids that route back", () => {
		const card = buildRevisionApproveConfirmCard("4210", "918")
		expect(textBlob(card)).toBe(revisionConfirmApproveBody)
		const btns = buttons(card)
		expect(btns.map((b) => [b.label, b.custom_id])).toEqual([
			[revisionConfirmApproveButtonLabel, "revision.approve.confirm:4210:918"],
			[queueCancelButtonLabel, "revision.approve.cancel"],
		])
		expect(routeInteraction(btns[0]?.custom_id ?? "")).toEqual({
			handler: "revision.approve.confirm",
			args: ["4210", "918"],
		})
		expect(routeInteraction(btns[1]?.custom_id ?? "")?.handler).toBe("revision.approve.cancel")
	})

	it("fits the largest ids within Discord's 100 char custom id limit", () => {
		const max = String(Number.MAX_SAFE_INTEGER)
		for (const b of buttons(buildRevisionApproveConfirmCard(max, max))) {
			expect((b.custom_id ?? "").length).toBeLessThanOrEqual(100)
		}
	})
})

describe("revisionCardEdit", () => {
	it("clears existing attachments and keeps the fresh file", () => {
		const edit = revisionCardEdit(buildRevisionCard(pendingRevision()))
		expect(edit.attachments).toEqual([])
		expect(edit.files).toHaveLength(1)
	})

	it("does not mutate the payload it was given", () => {
		const payload = buildRevisionCard(pendingRevision())
		revisionCardEdit(payload)
		expect("attachments" in payload).toBe(false)
	})
})
