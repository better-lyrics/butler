import {
	councilDashboardButtonLabel,
	flagClosedTally,
	flagConfirmKeepBody,
	flagConfirmKeepButtonLabel,
	flagConfirmRemoveBody,
	flagConfirmRemoveButtonLabel,
	flagDetailLine,
	flagHeading,
	flagKeepButtonLabel,
	flagKept,
	flagKicker,
	flagReasonsLine,
	flagRemoveButtonLabel,
	flagRemoved,
	flagResolved,
	flagSubmitterLine,
	flagTally,
	queueCancelButtonLabel,
	queueVerifyButtonLabel,
} from "@/copy/strings"
import { routeInteraction } from "@/discord/interactions/router"
import { flagCase } from "@/unison/__fixtures__/flag"
import { type ContainerBuilder, MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	FLAG_DETAIL_MAX_CHARS,
	FLAG_MAX_DETAILS,
	buildFlagCard,
	buildFlagVoteConfirmCard,
} from "./flag-card"

interface ComponentNode {
	type: number
	content?: string
	components?: ComponentNode[]
	custom_id?: string
	url?: string
	label?: string
	style?: number
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

describe("buildFlagCard", () => {
	describe("happy paths", () => {
		it("renders the kicker, heading, submitter, reasons, details and tally", () => {
			const card = flagCase()
			const blob = textBlob(buildFlagCard(card, 3))
			expect(blob).toContain(flagKicker)
			expect(blob).toContain(flagHeading("Never Gonna Give You Up", "Rick Astley"))
			expect(blob).toContain(flagSubmitterLine("mukeenanyafiq"))
			expect(blob).toContain(flagReasonsLine(card.reports) ?? "missing")
			expect(blob).toContain(flagDetailLine("Promo link in every line"))
			expect(blob).toContain(flagTally(1, 3, 0))
		})

		it("offers a YT Music link, remove, keep and the dashboard link", () => {
			const btns = buttons(buildFlagCard(flagCase(), 3))
			expect(btns.map((b) => b.label)).toEqual([
				queueVerifyButtonLabel,
				flagRemoveButtonLabel,
				flagKeepButtonLabel,
				councilDashboardButtonLabel,
			])
			expect(btns[0]?.url).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ")
			expect(btns[1]?.custom_id).toBe("flag.remove:77")
			expect(btns[1]?.style).toBe(4)
			expect(btns[2]?.custom_id).toBe("flag.keep:77")
			expect(btns[2]?.style).toBe(2)
			expect(btns[3]?.url).toBe("https://unison.betterlyrics.org/council/flags?item=77")
		})

		it("is a components v2 payload that pings nobody", () => {
			const payload = buildFlagCard(flagCase(), 3)
			expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
			expect(payload.allowedMentions).toEqual({ parse: [] })
		})
	})

	describe("edge cases", () => {
		it("drops the submitter line for an unknown submitter", () => {
			const blob = textBlob(buildFlagCard(flagCase({ submitterName: null }), 3))
			expect(blob).not.toContain("Submitted by")
		})

		it("renders no reasons or details when there are no reports", () => {
			const payload = buildFlagCard(flagCase({ reports: [] }), 3)
			expect(textBlob(payload)).not.toContain("> ")
			expect(textBlob(payload)).not.toContain("**Spam**")
		})

		it("shows at most three details and skips null ones", () => {
			const reports = [
				{ reason: "spam" as const, details: null, createdAt: 1 },
				...Array.from({ length: 5 }, (_, i) => ({
					reason: "offensive" as const,
					details: `detail ${i}`,
					createdAt: i,
				})),
			]
			const blob = textBlob(buildFlagCard(flagCase({ reports }), 3))
			const quoted = blob.split("\n").filter((line) => line.startsWith("> "))
			expect(quoted).toHaveLength(FLAG_MAX_DETAILS)
			expect(quoted).toEqual(["> detail 0", "> detail 1", "> detail 2"])
		})

		it("clips an over-long detail, song, artist and submitter", () => {
			const blob = textBlob(
				buildFlagCard(
					flagCase({
						song: "S".repeat(500),
						artist: "A".repeat(500),
						submitterName: "D".repeat(500),
						reports: [{ reason: "spam", details: "x".repeat(2000), createdAt: 1 }],
					}),
					3
				)
			)
			expect(blob).toContain(`**${"S".repeat(199)}…**`)
			expect(blob).not.toContain("A".repeat(200))
			expect(blob).not.toContain("D".repeat(101))
			expect(blob).toContain(`> ${"x".repeat(FLAG_DETAIL_MAX_CHARS - 1)}…`)
			expect(blob).not.toContain("x".repeat(FLAG_DETAIL_MAX_CHARS))
		})
	})

	describe("outcomes", () => {
		const cases = [
			[{ kind: "removed" as const }, flagRemoved],
			[{ kind: "kept" as const }, flagKept],
			[{ kind: "resolved" as const }, flagResolved],
		] as const

		for (const [outcome, line] of cases) {
			it(`a ${outcome.kind} card shows its outcome and keeps only the YT Music link`, () => {
				const payload = buildFlagCard(flagCase({ removals: 3, keeps: 1 }), 3, outcome)
				const blob = textBlob(payload)
				expect(blob).toContain(line)
				expect(blob).toContain(flagClosedTally(3, 1))
				expect(blob).not.toContain(flagTally(3, 3, 1))
				expect(buttons(payload).map((b) => b.label)).toEqual([queueVerifyButtonLabel])
			})
		}
	})

	describe("invariants", () => {
		it("every vote button routes back to its handler with the case id", () => {
			for (const button of buttons(buildFlagCard(flagCase(), 3))) {
				if (!button.custom_id) continue
				expect(routeInteraction(button.custom_id)?.args).toEqual(["77"])
			}
		})

		it("custom ids stay within Discord's 100 chars for the largest id", () => {
			const btns = buttons(buildFlagCard(flagCase({ id: Number.MAX_SAFE_INTEGER }), 3))
			for (const b of btns) expect((b.custom_id ?? "").length).toBeLessThanOrEqual(100)
		})

		it("keeps all card text under Discord's 4000 char budget for worst-case input", () => {
			const reports = Array.from({ length: 50 }, (_, i) => ({
				reason: "spam" as const,
				details: "d".repeat(5000),
				createdAt: i,
			}))
			const payload = buildFlagCard(
				flagCase({
					song: "S".repeat(5000),
					artist: "A".repeat(5000),
					submitterName: "N".repeat(5000),
					reports,
				}),
				3
			)
			expect(textBlob(payload).length).toBeLessThan(4000)
			expect(nodes(payload).length).toBeLessThanOrEqual(40)
		})

		it("does not mutate the card it renders", () => {
			const card = flagCase()
			const before = structuredClone(card)
			buildFlagCard(card, 3, { kind: "removed" })
			expect(card).toEqual(before)
		})
	})
})

describe("buildFlagVoteConfirmCard", () => {
	describe("happy paths", () => {
		it("asks to confirm a remove vote with the penalty warning", () => {
			const payload = buildFlagVoteConfirmCard("77", true)
			expect(textBlob(payload)).toContain(flagConfirmRemoveBody)
			const btns = buttons(payload)
			expect(btns.map((b) => b.label)).toEqual([
				flagConfirmRemoveButtonLabel,
				queueCancelButtonLabel,
			])
			expect(btns[0]?.custom_id).toBe("flag.vote.confirm:77:1")
			expect(btns[1]?.custom_id).toBe("flag.vote.cancel")
		})

		it("asks to confirm a keep vote", () => {
			const payload = buildFlagVoteConfirmCard("77", false)
			expect(textBlob(payload)).toContain(flagConfirmKeepBody)
			const btns = buttons(payload)
			expect(btns[0]?.label).toBe(flagConfirmKeepButtonLabel)
			expect(btns[0]?.custom_id).toBe("flag.vote.confirm:77:0")
		})
	})

	describe("invariants", () => {
		it("confirm and cancel ids route to their handlers", () => {
			const btns = buttons(buildFlagVoteConfirmCard("77", true))
			expect(routeInteraction(btns[0]?.custom_id ?? "")).toEqual({
				handler: "flag.vote.confirm",
				args: ["77", "1"],
			})
			expect(routeInteraction(btns[1]?.custom_id ?? "")?.handler).toBe("flag.vote.cancel")
		})
	})
})
