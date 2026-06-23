import { describe, expect, it } from "vitest"
import { parseYtmVideoId } from "./parse-url"

describe("parseYtmVideoId", () => {
	it("extracts the videoId from a music.youtube.com watch URL", () => {
		expect(parseYtmVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
	})
	it("ignores extra query params and playlist ids", () => {
		expect(parseYtmVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM")).toBe(
			"dQw4w9WgXcQ"
		)
	})
	it("finds a YTM link embedded in a longer message", () => {
		expect(
			parseYtmVideoId(
				"these lyrics are wrong https://music.youtube.com/watch?v=dQw4w9WgXcQ pls fix"
			)
		).toBe("dQw4w9WgXcQ")
	})
	describe("rejects non-YouTube-Music inputs", () => {
		it("rejects plain youtube.com", () => {
			expect(parseYtmVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull()
		})
		it("rejects youtu.be short links", () => {
			expect(parseYtmVideoId("https://youtu.be/dQw4w9WgXcQ")).toBeNull()
		})
		it("rejects a bare id with no URL", () => {
			expect(parseYtmVideoId("dQw4w9WgXcQ")).toBeNull()
		})
		it("rejects empty and garbage", () => {
			expect(parseYtmVideoId("")).toBeNull()
			expect(parseYtmVideoId("hello world")).toBeNull()
		})
	})
})
