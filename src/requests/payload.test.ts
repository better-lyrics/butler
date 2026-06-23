import { describe, expect, it } from "vitest"
import { buildBotRequestBody } from "./payload"
import type { TrackMetaForRequest } from "./payload"

const meta: TrackMetaForRequest = {
	videoId: "dQw4w9WgXcQ",
	song: "Never Gonna Give You Up",
	artist: "Rick Astley",
	thumbnailUrl: "https://lh3.googleusercontent.com/abc=w1024-h1024",
}

describe("buildBotRequestBody", () => {
	describe("happy path", () => {
		it("carries metadata through and includes the discordId", () => {
			const body = buildBotRequestBody(meta, "discord_456")
			expect(body).toEqual({
				videoId: "dQw4w9WgXcQ",
				song: "Never Gonna Give You Up",
				artist: "Rick Astley",
				thumbnailUrl: "https://lh3.googleusercontent.com/abc=w1024-h1024",
				discordId: "discord_456",
			})
		})
	})

	describe("thumbnailUrl normalization", () => {
		it("is null when meta.thumbnailUrl is absent", () => {
			const noThumb: TrackMetaForRequest = {
				videoId: "abc",
				song: "Song",
				artist: "Artist",
			}
			expect(buildBotRequestBody(noThumb, "d").thumbnailUrl).toBeNull()
		})
		it("is null when meta.thumbnailUrl is explicitly null", () => {
			const nullThumb: TrackMetaForRequest = {
				videoId: "abc",
				song: "Song",
				artist: "Artist",
				thumbnailUrl: null,
			}
			expect(buildBotRequestBody(nullThumb, "d").thumbnailUrl).toBeNull()
		})
		it("is preserved when meta.thumbnailUrl is present", () => {
			expect(buildBotRequestBody(meta, "d").thumbnailUrl).toBe(
				"https://lh3.googleusercontent.com/abc=w1024-h1024"
			)
		})
	})

	describe("invariants", () => {
		it("carries videoId, song, and artist through unchanged", () => {
			const body = buildBotRequestBody(meta, "d")
			expect(body.videoId).toBe(meta.videoId)
			expect(body.song).toBe(meta.song)
			expect(body.artist).toBe(meta.artist)
		})
		it("always includes the discordId given", () => {
			expect(buildBotRequestBody(meta, "poster-1").discordId).toBe("poster-1")
		})
	})
})
