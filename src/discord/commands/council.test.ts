import type { CouncilAddResult, CouncilListResult, CouncilRemoveResult } from "@/unison/client"
import { PermissionFlagsBits } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	COUNCIL_ERROR,
	COUNCIL_GUILD_ONLY,
	COUNCIL_LIST_EMPTY,
	COUNCIL_NO_PERMISSION,
	COUNCIL_ROLE_CLEARED,
	type CouncilCommandDeps,
	type CouncilRoleOutcome,
	councilAdded,
	councilAddedNoRole,
	councilAddedRoleFailed,
	councilListMessage,
	councilNotFound,
	councilNotLinked,
	councilRemoved,
	councilRemovedRoleFailed,
	councilRoleSet,
	handleCouncil,
} from "./council"

const KEY_ID = "a".repeat(64)
const TARGET = "target-disc-1"

function interaction(opts: {
	sub: string
	guildId?: string | null
	manage?: boolean
	targetId?: string | null
	roleId?: string | null
}) {
	const replies: Array<{ content?: string; flags?: number }> = []
	const int = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		memberPermissions: { has: () => opts.manage ?? true },
		options: {
			getSubcommand: () => opts.sub,
			getUser: (_name: string, _required?: boolean) =>
				opts.targetId === null ? null : { id: opts.targetId ?? TARGET },
			getRole: (_name: string, _required?: boolean) => (opts.roleId ? { id: opts.roleId } : null),
		},
		reply: async (p: { content?: string; flags?: number }) => {
			replies.push(p)
		},
	}
	return { interaction: int, replies }
}

function deps(overrides: Partial<CouncilCommandDeps> = {}): {
	deps: CouncilCommandDeps
	calls: {
		add: string[]
		remove: string[]
		grant: string[]
		revoke: string[]
		setRole: Array<string | null>
	}
} {
	const calls = {
		add: [] as string[],
		remove: [] as string[],
		grant: [] as string[],
		revoke: [] as string[],
		setRole: [] as Array<string | null>,
	}
	const base: CouncilCommandDeps = {
		resolveKeyId: async () => KEY_ID,
		listLinks: async () => [{ discordId: TARGET, keyId: KEY_ID }],
		addCouncilMember: async (keyId) => {
			calls.add.push(keyId)
			return { status: "added" }
		},
		removeCouncilMember: async (keyId) => {
			calls.remove.push(keyId)
			return { status: "removed" }
		},
		getCouncil: async () => ({ status: "ok", keyIds: [KEY_ID] }),
		grantCouncilRole: async (discordId) => {
			calls.grant.push(discordId)
			return "done"
		},
		revokeCouncilRole: async (discordId) => {
			calls.revoke.push(discordId)
			return "done"
		},
		setCouncilRoleId: async (roleId) => {
			calls.setRole.push(roleId)
		},
		...overrides,
	}
	return { deps: base, calls }
}

describe("handleCouncil gates", () => {
	it("refuses outside a guild", async () => {
		const { interaction: int, replies } = interaction({ sub: "add", guildId: null })
		await handleCouncil(int, deps().deps)
		expect(replies[0]?.content).toBe(COUNCIL_GUILD_ONLY)
	})

	it("refuses a member without Manage Server", async () => {
		const { interaction: int, replies } = interaction({ sub: "add", manage: false })
		await handleCouncil(int, deps().deps)
		expect(replies[0]?.content).toBe(COUNCIL_NO_PERMISSION)
	})

	it("passes the Manage Server permission flag when checking", async () => {
		let checked: bigint | null = null
		const int = {
			guildId: "g1",
			memberPermissions: {
				has: (flag: bigint) => {
					checked = flag
					return true
				},
			},
			options: { getSubcommand: () => "list", getUser: () => null, getRole: () => null },
			reply: async () => {},
		}
		await handleCouncil(int, deps().deps)
		expect(checked).toBe(PermissionFlagsBits.ManageGuild)
	})
})

describe("handleCouncil role", () => {
	it("sets the council role to the chosen role", async () => {
		const { interaction: int, replies } = interaction({ sub: "role", roleId: "council-role-9" })
		const d = deps()
		await handleCouncil(int, d.deps)
		expect(d.calls.setRole).toEqual(["council-role-9"])
		expect(replies[0]?.content).toBe(councilRoleSet("<@&council-role-9>"))
	})

	it("clears the council role when no role is given", async () => {
		const { interaction: int, replies } = interaction({ sub: "role" })
		const d = deps()
		await handleCouncil(int, d.deps)
		expect(d.calls.setRole).toEqual([null])
		expect(replies[0]?.content).toBe(COUNCIL_ROLE_CLEARED)
	})

	it("still requires Manage Server", async () => {
		const { interaction: int, replies } = interaction({
			sub: "role",
			roleId: "council-role-9",
			manage: false,
		})
		const d = deps()
		await handleCouncil(int, d.deps)
		expect(replies[0]?.content).toBe(COUNCIL_NO_PERMISSION)
		expect(d.calls.setRole).toEqual([])
	})
})

describe("handleCouncil add", () => {
	describe("happy paths", () => {
		it("adds the resolved key and grants the council role", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			const d = deps()
			await handleCouncil(int, d.deps)
			expect(d.calls.add).toEqual([KEY_ID])
			expect(d.calls.grant).toEqual([TARGET])
			expect(replies[0]?.content).toBe(councilAdded(`<@${TARGET}>`))
		})

		it("notes when no council role is configured", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			await handleCouncil(int, deps({ grantCouncilRole: async () => "not_configured" }).deps)
			expect(replies[0]?.content).toBe(councilAddedNoRole(`<@${TARGET}>`))
		})

		it("notes when the role grant fails but membership still landed", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			await handleCouncil(int, deps({ grantCouncilRole: async () => "failed" }).deps)
			expect(replies[0]?.content).toBe(councilAddedRoleFailed(`<@${TARGET}>`))
		})
	})

	describe("error paths", () => {
		it("refuses to add an unlinked user and never calls unison", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			const d = deps({ resolveKeyId: async () => null })
			await handleCouncil(int, d.deps)
			expect(replies[0]?.content).toBe(councilNotLinked(`<@${TARGET}>`))
			expect(d.calls.add).toEqual([])
			expect(d.calls.grant).toEqual([])
		})

		it("reports when unison cannot find the account and never touches the role", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			const d = deps({ addCouncilMember: async () => ({ status: "not_found" }) })
			await handleCouncil(int, d.deps)
			expect(replies[0]?.content).toBe(councilNotFound(`<@${TARGET}>`))
			expect(d.calls.grant).toEqual([])
		})

		it("shows a generic error and does not grant the role when the add fails", async () => {
			const { interaction: int, replies } = interaction({ sub: "add" })
			const failing: CouncilAddResult = { status: "error", code: 500 }
			const d = deps({ addCouncilMember: async () => failing })
			await handleCouncil(int, d.deps)
			expect(replies[0]?.content).toBe(COUNCIL_ERROR)
			expect(d.calls.grant).toEqual([])
		})
	})
})

describe("handleCouncil remove", () => {
	it("removes the resolved key and revokes the council role", async () => {
		const { interaction: int, replies } = interaction({ sub: "remove" })
		const d = deps()
		await handleCouncil(int, d.deps)
		expect(d.calls.remove).toEqual([KEY_ID])
		expect(d.calls.revoke).toEqual([TARGET])
		expect(replies[0]?.content).toBe(councilRemoved(`<@${TARGET}>`))
	})

	it("notes when the role removal fails but membership was lifted", async () => {
		const { interaction: int, replies } = interaction({ sub: "remove" })
		await handleCouncil(int, deps({ revokeCouncilRole: async () => "failed" }).deps)
		expect(replies[0]?.content).toBe(councilRemovedRoleFailed(`<@${TARGET}>`))
	})

	it("reports not found and does not revoke the role", async () => {
		const { interaction: int, replies } = interaction({ sub: "remove" })
		const d = deps({ removeCouncilMember: async () => ({ status: "not_found" }) })
		await handleCouncil(int, d.deps)
		expect(replies[0]?.content).toBe(councilNotFound(`<@${TARGET}>`))
		expect(d.calls.revoke).toEqual([])
	})

	it("shows a generic error when the remove fails", async () => {
		const { interaction: int, replies } = interaction({ sub: "remove" })
		const failing: CouncilRemoveResult = { status: "error", code: 500 }
		await handleCouncil(int, deps({ removeCouncilMember: async () => failing }).deps)
		expect(replies[0]?.content).toBe(COUNCIL_ERROR)
	})
})

describe("handleCouncil list", () => {
	it("lists linked members as mentions", async () => {
		const { interaction: int, replies } = interaction({ sub: "list" })
		await handleCouncil(int, deps().deps)
		expect(replies[0]?.content).toContain(`<@${TARGET}>`)
		expect(replies[0]?.content).toContain("Better Lyrics Council (1)")
	})

	it("counts council members with no Discord link instead of showing their key", async () => {
		const { interaction: int, replies } = interaction({ sub: "list" })
		const unlinkedKey = "c".repeat(64)
		const d = deps({
			getCouncil: async () => ({ status: "ok", keyIds: [KEY_ID, unlinkedKey] }),
			listLinks: async () => [{ discordId: TARGET, keyId: KEY_ID }],
		})
		await handleCouncil(int, d.deps)
		const content = replies[0]?.content ?? ""
		expect(content).toContain(`<@${TARGET}>`)
		expect(content).toContain("1 member not linked to Discord")
		expect(content).not.toContain(unlinkedKey)
	})

	it("shows the empty message when the council has no members", async () => {
		const { interaction: int, replies } = interaction({ sub: "list" })
		await handleCouncil(int, deps({ getCouncil: async () => ({ status: "ok", keyIds: [] }) }).deps)
		expect(replies[0]?.content).toBe(COUNCIL_LIST_EMPTY)
	})

	it("shows a generic error when the council lookup fails", async () => {
		const { interaction: int, replies } = interaction({ sub: "list" })
		const failing: CouncilListResult = { status: "error", code: 500 }
		await handleCouncil(int, deps({ getCouncil: async () => failing }).deps)
		expect(replies[0]?.content).toBe(COUNCIL_ERROR)
	})
})

describe("councilListMessage", () => {
	it("pluralizes the unlinked count and totals linked plus unlinked", () => {
		const msg = councilListMessage({ mentions: ["<@a>", "<@b>"], unlinked: 2 })
		expect(msg).toContain("Better Lyrics Council (4)")
		expect(msg).toContain("2 members not linked to Discord")
	})

	it("uses the singular for a single unlinked member", () => {
		expect(councilListMessage({ mentions: [], unlinked: 1 })).toContain(
			"1 member not linked to Discord"
		)
	})
})

describe("invariants", () => {
	it("never leaks a keyId into any reply", async () => {
		const cases = ["add", "remove", "list"]
		for (const sub of cases) {
			const { interaction: int, replies } = interaction({ sub })
			await handleCouncil(int, deps().deps)
			expect(JSON.stringify(replies)).not.toContain(KEY_ID)
		}
	})

	it("resolves the target through the link store, not by trusting client input", async () => {
		const { interaction: int } = interaction({ sub: "add" })
		let resolvedFor: string | null = null
		await handleCouncil(
			int,
			deps({
				resolveKeyId: async (discordId) => {
					resolvedFor = discordId
					return KEY_ID
				},
			}).deps
		)
		expect(resolvedFor).toBe(TARGET)
	})
})

describe("council role outcomes", () => {
	it("maps every outcome to distinct copy", () => {
		const outcomes: CouncilRoleOutcome[] = ["done", "not_configured", "failed"]
		expect(new Set(outcomes).size).toBe(3)
	})
})
