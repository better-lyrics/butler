import { describe, expect, it } from "vitest"
import { matchesConfirmToken, migrateShortId } from "./confirm-token"

const KEY_ID = `${"a".repeat(58)}1b2c3d`

describe("migrateShortId", () => {
	it("returns the last 6 chars of a 64-hex key id", () => {
		expect(migrateShortId(KEY_ID)).toBe("1b2c3d")
	})

	it("lowercases the short id", () => {
		expect(migrateShortId(`${"A".repeat(58)}1B2C3D`)).toBe("1b2c3d")
	})
})

describe("matchesConfirmToken happy path", () => {
	it("matches the exact short id", () => {
		expect(matchesConfirmToken("1b2c3d", KEY_ID)).toBe(true)
	})
})

describe("matchesConfirmToken edge cases", () => {
	it("is case-insensitive on the typed value", () => {
		expect(matchesConfirmToken("1B2C3D", KEY_ID)).toBe(true)
	})

	it("trims surrounding whitespace from the typed value", () => {
		expect(matchesConfirmToken("  1b2c3d \n", KEY_ID)).toBe(true)
	})

	it("rejects a mismatched value", () => {
		expect(matchesConfirmToken("ffffff", KEY_ID)).toBe(false)
	})

	it("rejects an empty typed value", () => {
		expect(matchesConfirmToken("", KEY_ID)).toBe(false)
	})

	it("rejects a value shorter than the short id", () => {
		expect(matchesConfirmToken("1b2c3", KEY_ID)).toBe(false)
	})

	it("rejects when the key id is empty", () => {
		expect(matchesConfirmToken("", "")).toBe(false)
	})
})
