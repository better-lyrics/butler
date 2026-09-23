import { describe, expect, it } from "vitest"
import { truncate } from "./truncate"

describe("truncate", () => {
	describe("happy paths", () => {
		it("leaves a short value alone", () => {
			expect(truncate("Rick Astley", 100)).toBe("Rick Astley")
		})

		it("cuts a long value to the limit and marks the cut", () => {
			const out = truncate("x".repeat(150), 100)
			expect(out).toHaveLength(100)
			expect(out.endsWith("…")).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("leaves a value of exactly the limit alone", () => {
			expect(truncate("x".repeat(100), 100)).toBe("x".repeat(100))
		})

		it("returns an empty string unchanged", () => {
			expect(truncate("", 10)).toBe("")
		})

		it("reduces to the ellipsis alone at a limit of one", () => {
			expect(truncate("abc", 1)).toBe("…")
		})
	})

	describe("invariants", () => {
		it("never returns more than the limit", () => {
			for (let length = 0; length <= 300; length += 7) {
				expect(truncate("y".repeat(length), 120).length).toBeLessThanOrEqual(120)
			}
		})
	})
})
