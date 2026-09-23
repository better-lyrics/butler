import { describe, expect, it } from "vitest"
import { parseJsonb } from "./jsonb"

describe("parseJsonb", () => {
	describe("happy paths", () => {
		it("parses the raw string pg-mem hands back", () => {
			expect(parseJsonb<{ id: number }>('{"id":4210}')).toEqual({ id: 4210 })
		})

		it("passes through the object real pg hands back", () => {
			const value = { id: 4210 }
			expect(parseJsonb<{ id: number }>(value)).toBe(value)
		})
	})

	describe("edge cases", () => {
		it("keeps unicode intact", () => {
			expect(parseJsonb<{ song: string }>('{"song":"夜に駆ける"}')).toEqual({ song: "夜に駆ける" })
		})

		it("parses a JSON array", () => {
			expect(parseJsonb<number[]>("[1,2,3]")).toEqual([1, 2, 3])
		})
	})

	describe("error paths", () => {
		it("throws on a malformed string", () => {
			expect(() => parseJsonb("{")).toThrow(SyntaxError)
		})
	})
})
