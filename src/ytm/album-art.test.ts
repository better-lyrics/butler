import { describe, expect, it } from "vitest"
import { pickAlbumArt } from "./album-art"

type Thumb = { url: string; width: number; height: number }

const artTrack: Thumb[] = [
	{ url: "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj", width: 60, height: 60 },
	{ url: "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj", width: 544, height: 544 },
	{ url: "https://i.ytimg.com/vi/ID/maxresdefault.jpg", width: 1280, height: 720 },
]

describe("pickAlbumArt", () => {
	it("picks the largest googleusercontent thumbnail and rewrites size to 1024", () => {
		expect(pickAlbumArt(artTrack, 1024)).toBe(
			"https://lh3.googleusercontent.com/abc=w1024-h1024-l90-rj"
		)
	})
	it("ignores the larger i.ytimg video thumbnail in favor of square art", () => {
		const url = pickAlbumArt(artTrack, 1024)
		expect(url).toContain("googleusercontent.com")
		expect(url).not.toContain("ytimg")
	})
	describe("fallback and edges", () => {
		it("falls back to the video thumbnail when no album art exists", () => {
			const videoOnly: Thumb[] = [
				{ url: "https://i.ytimg.com/vi/ID/maxresdefault.jpg", width: 1280, height: 720 },
			]
			expect(pickAlbumArt(videoOnly, 1024)).toBe("https://i.ytimg.com/vi/ID/maxresdefault.jpg")
		})
		it("returns null for an empty list", () => {
			expect(pickAlbumArt([], 1024)).toBeNull()
		})
		it("returns the raw art url when there is no size param to rewrite", () => {
			const noSize: Thumb[] = [
				{ url: "https://lh3.googleusercontent.com/abc", width: 226, height: 226 },
			]
			expect(pickAlbumArt(noSize, 1024)).toBe("https://lh3.googleusercontent.com/abc")
		})
		it("accepts yt3.googleusercontent.com as well as lh3", () => {
			const yt3: Thumb[] = [
				{ url: "https://yt3.googleusercontent.com/abc=w226-h226", width: 226, height: 226 },
			]
			expect(pickAlbumArt(yt3, 1024)).toBe("https://yt3.googleusercontent.com/abc=w1024-h1024")
		})
	})
})
