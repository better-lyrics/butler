import { helpAdminLabel, helpSealLine } from "@/copy/strings"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { type HelpCommandInteraction, handleHelp } from "./help"

function makeInteraction(manage: boolean) {
	const replies: Array<{ components?: unknown; flags?: number | number[] }> = []
	const interaction: HelpCommandInteraction = {
		memberPermissions: { has: () => manage },
		reply: async (p) => {
			replies.push(p as { components?: unknown; flags?: number | number[] })
		},
	}
	return { interaction, replies }
}

function ephemeral(flags: unknown): boolean {
	if (Array.isArray(flags)) return flags.includes(MessageFlags.Ephemeral)
	return ((flags as number) & MessageFlags.Ephemeral) !== 0
}

describe("handleHelp", () => {
	describe("happy paths", () => {
		it("replies with an ephemeral card carrying the council commands", async () => {
			const { interaction, replies } = makeInteraction(false)
			await handleHelp(interaction)
			expect(ephemeral(replies[0]?.flags)).toBe(true)
			expect(JSON.stringify(replies[0])).toContain(helpSealLine)
		})

		it("includes the admin section for a Manage Server member", async () => {
			const { interaction, replies } = makeInteraction(true)
			await handleHelp(interaction)
			expect(JSON.stringify(replies[0])).toContain(helpAdminLabel)
		})
	})

	describe("edge cases", () => {
		it("omits the admin section for a member without Manage Server", async () => {
			const { interaction, replies } = makeInteraction(false)
			await handleHelp(interaction)
			expect(JSON.stringify(replies[0])).not.toContain(helpAdminLabel)
		})

		it("treats a null member permission as not admin", async () => {
			const replies: Array<{ flags?: number | number[] }> = []
			const interaction: HelpCommandInteraction = {
				memberPermissions: null,
				reply: async (p) => {
					replies.push(p as { flags?: number | number[] })
				},
			}
			await handleHelp(interaction)
			expect(JSON.stringify(replies[0])).not.toContain(helpAdminLabel)
		})
	})
})
