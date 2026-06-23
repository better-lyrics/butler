import { describe, expect, it } from "vitest"
import { assertRoleHierarchy } from "./apply"

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
