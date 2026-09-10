import {
	helpAdminLabel,
	helpConfigLine,
	helpCouncilLabel,
	helpDigestLine,
	helpEveryoneLabel,
	helpMigrateLine,
	helpQueueLine,
	helpSealLine,
	helpSetupLine,
} from "@/copy/strings"
import type { ContainerBuilder } from "discord.js"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildHelpCard } from "./help-card"

interface ComponentNode {
	type: number
	content?: string
	components?: ComponentNode[]
	accessory?: ComponentNode
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	for (const child of node.components ?? []) walk(child, out)
	if (node.accessory) walk(node.accessory, out)
}

function textBlob(card: { components: ContainerBuilder[] }): string {
	const out: ComponentNode[] = []
	walk(card.components[0]?.toJSON() as unknown as ComponentNode, out)
	return out
		.filter((n) => n.type === 10)
		.map((n) => n.content ?? "")
		.join("\n")
}

describe("buildHelpCard", () => {
	describe("happy paths", () => {
		it("always shows the everyone and council sections", () => {
			const blob = textBlob(buildHelpCard({ isAdmin: false }))
			expect(blob).toContain(helpEveryoneLabel)
			expect(blob).toContain(helpMigrateLine)
			expect(blob).toContain(helpCouncilLabel)
			expect(blob).toContain(helpSealLine)
			expect(blob).toContain(helpQueueLine)
		})

		it("shows the admin section to an admin", () => {
			const blob = textBlob(buildHelpCard({ isAdmin: true }))
			expect(blob).toContain(helpAdminLabel)
			expect(blob).toContain(helpSetupLine)
			expect(blob).toContain(helpConfigLine)
			expect(blob).toContain(helpDigestLine)
		})
	})

	describe("invariants", () => {
		it("hides the admin section from non-admins", () => {
			const blob = textBlob(buildHelpCard({ isAdmin: false }))
			expect(blob).not.toContain(helpAdminLabel)
			expect(blob).not.toContain(helpSetupLine)
		})

		it("is a components v2 payload", () => {
			expect(buildHelpCard({ isAdmin: true }).flags).toBe(MessageFlags.IsComponentsV2)
		})
	})
})
