import { describe, expect, it } from "vitest"
import { labelFrom, slugifyAvatarId } from "./slug"

describe("slugifyAvatarId", () => {
	it("lowercases and hyphenates spaces", () => {
		expect(slugifyAvatarId("El Gato")).toBe("el-gato")
	})

	it("treats underscores as separators", () => {
		expect(slugifyAvatarId("Oia_Uia_Cat")).toBe("oia-uia-cat")
	})

	describe("edge cases", () => {
		it("strips punctuation and non-ascii", () => {
			expect(slugifyAvatarId("Café & Cats!")).toBe("caf-cats")
		})

		it("collapses repeated and trims leading/trailing separators", () => {
			expect(slugifyAvatarId("  --Silly__  Tabby-- ")).toBe("silly-tabby")
		})

		it("returns an empty string when nothing survives", () => {
			expect(slugifyAvatarId("!!! ___ ---")).toBe("")
			expect(slugifyAvatarId("")).toBe("")
		})

		it("keeps digits", () => {
			expect(slugifyAvatarId("Bow Kitten 5")).toBe("bow-kitten-5")
		})
	})
})

describe("labelFrom", () => {
	it("title-cases words", () => {
		expect(labelFrom("oia-uia-cat")).toBe("Oia Uia Cat")
	})

	it("normalizes mixed case and separators", () => {
		expect(labelFrom("EL_gato")).toBe("El Gato")
	})

	it("returns an empty string for separator-only input", () => {
		expect(labelFrom("---")).toBe("")
	})
})
