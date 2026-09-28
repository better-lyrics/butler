import { describe, expect, it } from "vitest"
import { planCouncilAdmins, readManageAccess } from "./council-admins"

const ada = { keyId: "key-ada", discordId: "111" }
const bo = { keyId: "key-bo", discordId: "222" }

describe("planCouncilAdmins", () => {
	it("marks members who can manage the server as admins and the rest as not", () => {
		const plan = planCouncilAdmins(
			["key-ada", "key-bo"],
			[ada, bo],
			new Map([
				["111", true],
				["222", false],
			])
		)
		expect(plan).toEqual([
			{ keyId: "key-ada", admin: true },
			{ keyId: "key-bo", admin: false },
		])
	})

	describe("edge cases", () => {
		it("returns nothing for an empty council", () => {
			expect(planCouncilAdmins([], [], new Map())).toEqual([])
		})

		it("treats a member who left the server as not an admin", () => {
			expect(planCouncilAdmins(["key-ada"], [ada], new Map([["111", "gone"]]))).toEqual([
				{ keyId: "key-ada", admin: false },
			])
		})

		it("demotes a council key with no Discord account behind it", () => {
			expect(planCouncilAdmins(["key-ada", "key-cy"], [ada], new Map([["111", true]]))).toEqual([
				{ keyId: "key-ada", admin: true },
				{ keyId: "key-cy", admin: false },
			])
		})
	})

	describe("error paths", () => {
		it("skips a member whose permissions could not be read, so a failed read never demotes", () => {
			expect(planCouncilAdmins(["key-ada", "key-bo"], [ada, bo], new Map([["222", true]]))).toEqual(
				[{ keyId: "key-bo", admin: true }]
			)
		})
	})

	describe("invariants", () => {
		it("lists each key once, admin if any of its accounts can manage the server", () => {
			const second = { keyId: "key-ada", discordId: "333" }
			const plan = planCouncilAdmins(
				["key-ada"],
				[ada, second],
				new Map([
					["111", false],
					["333", true],
				])
			)
			expect(plan).toEqual([{ keyId: "key-ada", admin: true }])
		})
	})
})

describe("readManageAccess", () => {
	function fakeGuild(members: Record<string, "manage" | "plain" | "gone" | "error">) {
		const calls: unknown[] = []
		const guild = {
			members: {
				fetch: async (options: { user: string; force: boolean }) => {
					calls.push(options)
					const kind = members[options.user]
					if (kind === "error") throw new Error("rate limited")
					if (kind === "gone") throw Object.assign(new Error("Unknown Member"), { gone: true })
					return { permissions: { has: () => kind === "manage" } }
				},
			},
		}
		return { guild, calls }
	}
	const isGone = (err: unknown) => err instanceof Error && "gone" in err

	it("reads each member fresh from Discord, never from the cache", async () => {
		const { guild, calls } = fakeGuild({ "111": "manage" })
		await readManageAccess(guild, ["111"], isGone)
		expect(calls).toEqual([{ user: "111", force: true }])
	})

	it("maps manage, plain and gone members, and skips a failed read", async () => {
		const { guild } = fakeGuild({ "111": "manage", "222": "plain", "333": "gone", "444": "error" })
		const access = await readManageAccess(guild, ["111", "222", "333", "444"], isGone)
		expect([...access]).toEqual([
			["111", true],
			["222", false],
			["333", "gone"],
		])
	})
})
