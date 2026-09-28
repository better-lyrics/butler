import { describe, expect, it } from "vitest"
import { planCouncilRoles } from "./council-roles"

const links = new Map([
	["key-a", "111"],
	["key-b", "222"],
	["key-c", "333"],
])

describe("planCouncilRoles", () => {
	it("grants every linked member and revokes members who left the council", () => {
		const plan = planCouncilRoles({
			previous: [
				{ keyId: "key-a", discordId: "111" },
				{ keyId: "key-c", discordId: "333" },
			],
			councilKeyIds: ["key-a", "key-b"],
			links,
		})
		expect(plan).toEqual({
			grant: ["111", "222"],
			revoke: ["333"],
			members: [
				{ keyId: "key-a", discordId: "111" },
				{ keyId: "key-b", discordId: "222" },
			],
		})
	})

	describe("edge cases", () => {
		it("skips a member with no linked Discord account", () => {
			const plan = planCouncilRoles({ previous: [], councilKeyIds: ["key-x"], links })
			expect(plan).toEqual({ grant: [], revoke: [], members: [] })
		})

		it("keeps the role on a member who unlinked but is still on the council", () => {
			const plan = planCouncilRoles({
				previous: [{ keyId: "key-x", discordId: "999" }],
				councilKeyIds: ["key-x"],
				links,
			})
			expect(plan?.revoke).toEqual([])
			expect(plan?.members).toEqual([{ keyId: "key-x", discordId: "999" }])
		})

		it("revokes the Discord account that was recorded, even if the link moved", () => {
			const moved = new Map([["key-c", "444"]])
			const plan = planCouncilRoles({
				previous: [{ keyId: "key-c", discordId: "333" }],
				councilKeyIds: ["key-a"],
				links: moved,
			})
			expect(plan?.revoke).toEqual(["333"])
		})
	})

	describe("regressions", () => {
		it("does nothing when the council list is empty, so a bad read never strips everyone", () => {
			const plan = planCouncilRoles({
				previous: [{ keyId: "key-a", discordId: "111" }],
				councilKeyIds: [],
				links,
			})
			expect(plan).toBeNull()
		})

		it("does nothing when there are no links, so a bad read never strips everyone", () => {
			const plan = planCouncilRoles({
				previous: [{ keyId: "key-a", discordId: "111" }],
				councilKeyIds: ["key-a"],
				links: new Map(),
			})
			expect(plan).toBeNull()
		})
	})

	describe("invariants", () => {
		it("never grants and revokes the same account", () => {
			const plan = planCouncilRoles({
				previous: [{ keyId: "key-old", discordId: "111" }],
				councilKeyIds: ["key-a"],
				links,
			})
			expect(plan?.grant).toEqual(["111"])
			expect(plan?.revoke).toEqual([])
		})

		it("lists each account once", () => {
			const plan = planCouncilRoles({
				previous: [],
				councilKeyIds: ["key-a", "key-a"],
				links,
			})
			expect(plan?.grant).toEqual(["111"])
			expect(plan?.members).toHaveLength(1)
		})
	})
})
