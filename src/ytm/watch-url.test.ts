import { describe, expect, it } from "vitest"
import { ytmWatchUrl } from "./watch-url"

describe("ytmWatchUrl", () => {
	describe("happy paths", () => {
		it("builds a YT Music watch link", () => {
			expect(ytmWatchUrl("dQw4w9WgXcQ")).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ")
		})
	})

	describe("edge cases", () => {
		it("encodes characters that would break the query", () => {
			expect(ytmWatchUrl("a&b=c")).toBe("https://music.youtube.com/watch?v=a%26b%3Dc")
		})

		it("still returns a valid URL for an empty id", () => {
			expect(ytmWatchUrl("")).toBe("https://music.youtube.com/watch?v=")
		})
	})
})
