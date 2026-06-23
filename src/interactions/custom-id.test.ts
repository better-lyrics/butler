import { describe, expect, it } from "vitest"
import { decodeCustomId, encodeCustomId } from "./custom-id"

describe("custom id codec", () => {
	it("round-trips action and args", () => {
		const id = encodeCustomId("report.add", ["dQw4w9WgXcQ"])
		expect(decodeCustomId(id)).toEqual({ action: "report.add", args: ["dQw4w9WgXcQ"] })
	})
	it("round-trips an action with no args", () => {
		expect(decodeCustomId(encodeCustomId("connect", []))).toEqual({ action: "connect", args: [] })
	})
	describe("edges", () => {
		it("throws if the encoded id exceeds 100 chars", () => {
			expect(() => encodeCustomId("report.add", ["x".repeat(120)])).toThrow()
		})
		it("returns null for an unparseable id", () => {
			expect(decodeCustomId("")).toBeNull()
		})
	})
	describe("round-trip invariants", () => {
		it("round-trips an action with multiple args", () => {
			const id = encodeCustomId("queue.move", ["from", "to", "guild123"])
			expect(decodeCustomId(id)).toEqual({
				action: "queue.move",
				args: ["from", "to", "guild123"],
			})
		})
		it("preserves the exact arg count on round-trip", () => {
			const args = ["a", "b", "c", "d"]
			const decoded = decodeCustomId(encodeCustomId("act", args))
			expect(decoded?.args).toHaveLength(args.length)
		})
		it("accepts an encoded id exactly at the 100-char limit", () => {
			const action = "a"
			const arg = "x".repeat(98)
			const id = encodeCustomId(action, [arg])
			expect(id).toHaveLength(100)
			expect(decodeCustomId(id)).toEqual({ action, args: [arg] })
		})
	})
	describe("decode edges", () => {
		it("decodes an id with a trailing colon as a trailing empty arg", () => {
			expect(decodeCustomId("connect:")).toEqual({ action: "connect", args: [""] })
		})
		it("decodes an action containing no colons as a bare action with no args", () => {
			expect(decodeCustomId("connect")).toEqual({ action: "connect", args: [] })
		})
		it("decodes consecutive colons as empty args between segments", () => {
			expect(decodeCustomId("act::x")).toEqual({ action: "act", args: ["", "x"] })
		})
	})
})
