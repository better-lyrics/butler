import { describe, expect, it } from "vitest"
import { assertRoleHierarchy, nextMemberRoles, sameRoleSet } from "./apply"

describe("assertRoleHierarchy", () => {
	it("does not throw when every managed role is below the bot", () => {
		expect(() => assertRoleHierarchy(10, [1, 5, 9])).not.toThrow()
	})

	it("throws when a managed role shares the bot position", () => {
		expect(() => assertRoleHierarchy(10, [10])).toThrow()
	})

	it("throws when a managed role is above the bot", () => {
		expect(() => assertRoleHierarchy(10, [11])).toThrow()
	})

	it("does not throw for an empty managed list", () => {
		expect(() => assertRoleHierarchy(10, [])).not.toThrow()
	})
})

describe("nextMemberRoles", () => {
	const roleIds = {
		legendary: "1300000000000000001",
		grandmaster: "1300000000000000002",
		master: "1300000000000000003",
		elite: "1300000000000000004",
		lyricist: "1300000000000000005",
	}
	const unmanaged = "1100000000000000099"

	describe("happy paths", () => {
		it("stacks a podium holder's role on elite and lyricist", () => {
			expect(nextMemberRoles([unmanaged], roleIds, "grandmaster")).toEqual([
				unmanaged,
				roleIds.grandmaster,
				roleIds.elite,
				roleIds.lyricist,
			])
		})

		it("strips every managed role when the tier is null", () => {
			expect(nextMemberRoles([unmanaged, roleIds.elite, roleIds.lyricist], roleIds, null)).toEqual([
				unmanaged,
			])
		})
	})

	describe("edge cases", () => {
		it("skips a stacked tier whose role is not configured", () => {
			const { elite: _, ...withoutElite } = roleIds
			expect(nextMemberRoles([], withoutElite, "master")).toEqual([
				roleIds.master,
				roleIds.lyricist,
			])
		})
	})

	describe("invariants", () => {
		it("drops a stale podium role on a move instead of keeping both", () => {
			const next = nextMemberRoles(
				[roleIds.legendary, roleIds.elite, roleIds.lyricist],
				roleIds,
				"master"
			)
			expect(next).not.toContain(roleIds.legendary)
			expect(next).toContain(roleIds.master)
		})

		it("keeps unmanaged roles untouched", () => {
			expect(nextMemberRoles([unmanaged], roleIds, "lyricist")).toContain(unmanaged)
		})
	})
})

describe("sameRoleSet", () => {
	describe("happy paths", () => {
		it("matches identical sets regardless of order", () => {
			expect(sameRoleSet(["a", "b"], ["b", "a"])).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("matches two empty lists", () => {
			expect(sameRoleSet([], [])).toBe(true)
		})

		it("ignores duplicate ids", () => {
			expect(sameRoleSet(["a", "a"], ["a"])).toBe(true)
		})
	})

	describe("invariants", () => {
		it("differs when either side has a role the other lacks", () => {
			expect(sameRoleSet(["a", "b"], ["a"])).toBe(false)
			expect(sameRoleSet(["a"], ["a", "b"])).toBe(false)
		})
	})
})
