import { describe, expect, it } from "vitest"
import { planCouncilAdmins } from "./council-admins"

const ada = { keyId: "key-ada", discordId: "111" }
const bo = { keyId: "key-bo", discordId: "222" }

describe("planCouncilAdmins", () => {
	it("marks members who can manage the server as admins and the rest as not", () => {
		const plan = planCouncilAdmins(
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
			expect(planCouncilAdmins([], new Map())).toEqual([])
		})

		it("treats a member who left the server as not an admin", () => {
			expect(planCouncilAdmins([ada], new Map([["111", "gone"]]))).toEqual([
				{ keyId: "key-ada", admin: false },
			])
		})
	})

	describe("error paths", () => {
		it("skips a member whose permissions could not be read, so a failed read never demotes", () => {
			expect(planCouncilAdmins([ada, bo], new Map([["222", true]]))).toEqual([
				{ keyId: "key-bo", admin: true },
			])
		})
	})

	describe("invariants", () => {
		it("lists each key once, admin if any of its accounts can manage the server", () => {
			const second = { keyId: "key-ada", discordId: "333" }
			const plan = planCouncilAdmins(
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
