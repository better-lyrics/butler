import { describe, expect, it } from "vitest"
import { meetsMinRole } from "./eligibility"

describe("meetsMinRole", () => {
	describe("happy paths", () => {
		it("qualifies a member holding a role above the anchor", () => {
			expect(meetsMinRole([0, 5], 3)).toBe(true)
		})

		it("qualifies a member holding exactly the anchor role", () => {
			expect(meetsMinRole([0, 3], 3)).toBe(true)
		})

		it("qualifies on any one role above the anchor even when others are below", () => {
			expect(meetsMinRole([1, 2, 9], 8)).toBe(true)
		})
	})

	describe("rejections", () => {
		it("rejects a member whose highest role is below the anchor", () => {
			expect(meetsMinRole([0, 1, 2], 3)).toBe(false)
		})

		it("rejects a member with only @everyone (position 0) against a real anchor", () => {
			expect(meetsMinRole([0], 4)).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("rejects a member with no roles", () => {
			expect(meetsMinRole([], 3)).toBe(false)
		})

		it("qualifies everyone when the anchor is @everyone (position 0)", () => {
			expect(meetsMinRole([0], 0)).toBe(true)
		})
	})
})
