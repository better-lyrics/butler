import {
	sealConfirmButtonLabel,
	sealPickHeading,
	unsealConfirmButtonLabel,
	unsealPickHeading,
} from "@/copy/strings"
import type { LyricVariant } from "@/unison/client"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildSealConfirmCard, buildSealPickerCard, buildSealResultCard } from "./seal-card"

interface SelectOption {
	label: string
	value: string
	description?: string
}

interface ComponentNode {
	type: number
	content?: string
	custom_id?: string
	label?: string
	placeholder?: string
	min_values?: number
	max_values?: number
	options?: SelectOption[]
	components?: ComponentNode[]
	accessory?: ComponentNode
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	for (const child of node.components ?? []) walk(child, out)
	if (node.accessory) walk(node.accessory, out)
}

function collect(card: { components: ContainerBuilder[] }): ComponentNode[] {
	const out: ComponentNode[] = []
	walk(card.components[0]?.toJSON() as unknown as ComponentNode, out)
	return out
}

function textBlob(card: { components: ContainerBuilder[] }): string {
	return collect(card)
		.filter((n) => n.type === 10)
		.map((n) => n.content ?? "")
		.join("\n")
}

function selectMenu(card: { components: ContainerBuilder[] }): ComponentNode | undefined {
	return collect(card).find((n) => n.type === 3)
}

function buttons(card: { components: ContainerBuilder[] }): ComponentNode[] {
	return collect(card).filter((n) => n.type === 2)
}

const variants: LyricVariant[] = [
	{
		id: 21,
		song: "Teardrop",
		artist: "Massive Attack",
		format: "ttml",
		score: 42,
		submitterName: "quiet-fern",
	},
	{
		id: 22,
		song: "Teardrop",
		artist: "Massive Attack",
		format: "lrc",
		score: 8,
		submitterName: null,
	},
]

describe("buildSealPickerCard", () => {
	describe("happy paths", () => {
		it("add: renders the seal heading and a seal.pick select menu", () => {
			const card = buildSealPickerCard({ variants, mode: "add" })
			expect(textBlob(card)).toContain(sealPickHeading)
			expect(selectMenu(card)?.custom_id).toBe("seal.pick")
		})

		it("remove: renders the unseal heading and a seal.unpick select menu", () => {
			const card = buildSealPickerCard({ variants, mode: "remove" })
			expect(textBlob(card)).toContain(unsealPickHeading)
			expect(selectMenu(card)?.custom_id).toBe("seal.unpick")
		})

		it("carries one option per variant with the lyricsId as the value", () => {
			const menu = selectMenu(buildSealPickerCard({ variants, mode: "add" }))
			expect(menu?.options?.map((o) => o.value)).toEqual(["21", "22"])
		})

		it("labels each option with the song and describes it with artist, format, and score", () => {
			const menu = selectMenu(buildSealPickerCard({ variants, mode: "add" }))
			const first = menu?.options?.[0]
			expect(first?.label).toBe("Teardrop")
			expect(first?.description).toContain("Massive Attack")
			expect(first?.description).toContain("ttml")
			expect(first?.description).toContain("quiet-fern")
			expect(first?.description).toContain("score 42")
		})

		it("lets the user pick exactly one variant", () => {
			const menu = selectMenu(buildSealPickerCard({ variants, mode: "add" }))
			expect(menu?.min_values).toBe(1)
			expect(menu?.max_values).toBe(1)
		})
	})

	describe("invariants", () => {
		it("is a components v2 payload", () => {
			expect(buildSealPickerCard({ variants, mode: "add" }).flags).toBe(MessageFlags.IsComponentsV2)
		})

		it("never leaks a submitter keyId into the rendered card", () => {
			const withKeyLike: LyricVariant[] = [
				{ id: 1, song: "x", artist: "y", format: "ttml", score: 1, submitterName: "petname" },
			]
			const card = buildSealPickerCard({ variants: withKeyLike, mode: "add" })
			const menu = selectMenu(card)
			expect(JSON.stringify(menu)).not.toMatch(/[a-f0-9]{64}/)
		})
	})

	describe("edge cases", () => {
		it("omits the submitter segment when the variant has no submitter name", () => {
			const menu = selectMenu(buildSealPickerCard({ variants, mode: "add" }))
			const second = menu?.options?.[1]
			expect(second?.description).toBe("Massive Attack · lrc · score 8")
		})

		it("caps the option list at 25 even when more variants exist", () => {
			const many: LyricVariant[] = Array.from({ length: 40 }, (_, i) => ({
				id: i,
				song: `Song ${i}`,
				artist: "Artist",
				format: "ttml",
				score: i,
				submitterName: null,
			}))
			const menu = selectMenu(buildSealPickerCard({ variants: many, mode: "add" }))
			expect(menu?.options).toHaveLength(25)
		})

		it("truncates an over-long song label to the 100-char field limit", () => {
			const long: LyricVariant[] = [
				{
					id: 1,
					song: "a".repeat(200),
					artist: "b",
					format: "ttml",
					score: 1,
					submitterName: null,
				},
			]
			const menu = selectMenu(buildSealPickerCard({ variants: long, mode: "add" }))
			expect(menu?.options?.[0]?.label.length ?? 0).toBeLessThanOrEqual(100)
		})
	})
})

describe("buildSealConfirmCard", () => {
	const variant: LyricVariant = {
		id: 99,
		song: "Only Version",
		artist: "Someone",
		format: "ttml",
		score: 5,
		submitterName: "lone-fox",
	}

	describe("happy paths", () => {
		it("add: shows the variant details and a seal button carrying the lyricsId, no dropdown", () => {
			const card = buildSealConfirmCard({ variant, mode: "add" })
			expect(textBlob(card)).toContain(sealPickHeading)
			expect(textBlob(card)).toContain("Only Version")
			expect(textBlob(card)).toContain("lone-fox")
			expect(selectMenu(card)).toBeUndefined()
			const btn = buttons(card)[0]
			expect(btn?.custom_id).toBe("seal.pick:99")
			expect(btn?.label).toBe(sealConfirmButtonLabel)
		})

		it("remove: shows a lift-seal button carrying the lyricsId", () => {
			const card = buildSealConfirmCard({ variant, mode: "remove" })
			expect(textBlob(card)).toContain(unsealPickHeading)
			const btn = buttons(card)[0]
			expect(btn?.custom_id).toBe("seal.unpick:99")
			expect(btn?.label).toBe(unsealConfirmButtonLabel)
		})
	})

	describe("invariants", () => {
		it("is a components v2 payload", () => {
			expect(buildSealConfirmCard({ variant, mode: "add" }).flags).toBe(MessageFlags.IsComponentsV2)
		})

		it("carries exactly one button", () => {
			expect(buttons(buildSealConfirmCard({ variant, mode: "add" }))).toHaveLength(1)
		})
	})
})

describe("buildSealResultCard", () => {
	it("renders each line as its own text block", () => {
		const card = buildSealResultCard(["**Sealed**", "This lyric now carries a council seal."])
		const blob = textBlob(card)
		expect(blob).toContain("**Sealed**")
		expect(blob).toContain("This lyric now carries a council seal.")
	})

	it("is a components v2 payload", () => {
		expect(buildSealResultCard(["one"]).flags).toBe(MessageFlags.IsComponentsV2)
	})
})
