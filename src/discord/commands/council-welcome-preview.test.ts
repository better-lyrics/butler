import { PermissionFlagsBits } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	COUNCIL_WELCOME_PREVIEW_FAILED,
	COUNCIL_WELCOME_PREVIEW_GUILD_ONLY,
	COUNCIL_WELCOME_PREVIEW_NO_PERMISSION,
	COUNCIL_WELCOME_PREVIEW_SENT,
	handleCouncilWelcomePreview,
} from "./council-welcome-preview"

function interaction(opts: { guildId?: string | null; manage?: boolean; userId?: string } = {}) {
	const replies: Array<{ content?: string }> = []
	const int = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		user: { id: opts.userId ?? "admin-1" },
		memberPermissions: { has: () => opts.manage ?? true },
		reply: async (p: { content?: string }) => {
			replies.push(p)
		},
	}
	return { interaction: int, replies }
}

describe("handleCouncilWelcomePreview", () => {
	it("refuses outside a guild and never DMs", async () => {
		const { interaction: int, replies } = interaction({ guildId: null })
		let dmed = false
		await handleCouncilWelcomePreview(int, {
			welcomeMember: async () => {
				dmed = true
				return true
			},
		})
		expect(replies[0]?.content).toBe(COUNCIL_WELCOME_PREVIEW_GUILD_ONLY)
		expect(dmed).toBe(false)
	})

	it("refuses a member without Manage Server and never DMs", async () => {
		const { interaction: int, replies } = interaction({ manage: false })
		let dmed = false
		await handleCouncilWelcomePreview(int, {
			welcomeMember: async () => {
				dmed = true
				return true
			},
		})
		expect(replies[0]?.content).toBe(COUNCIL_WELCOME_PREVIEW_NO_PERMISSION)
		expect(dmed).toBe(false)
	})

	it("DMs the running admin and confirms when it lands", async () => {
		const { interaction: int, replies } = interaction({ userId: "admin-7" })
		const targets: string[] = []
		await handleCouncilWelcomePreview(int, {
			welcomeMember: async (id) => {
				targets.push(id)
				return true
			},
		})
		expect(targets).toEqual(["admin-7"])
		expect(replies[0]?.content).toBe(COUNCIL_WELCOME_PREVIEW_SENT)
	})

	it("tells the admin to open DMs when the message could not be delivered", async () => {
		const { interaction: int, replies } = interaction()
		await handleCouncilWelcomePreview(int, { welcomeMember: async () => false })
		expect(replies[0]?.content).toBe(COUNCIL_WELCOME_PREVIEW_FAILED)
	})
})
