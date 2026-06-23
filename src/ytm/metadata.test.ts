import { describe, expect, it } from "vitest"
import artTrack from "./__fixtures__/art-track.json"
import musicVideo from "./__fixtures__/music-video.json"
import { type RawTrackInfo, buildTrackMeta, fetchTrackMeta } from "./metadata"

const ART_VIDEO_ID = "Kp7eSUU9oy8"
const VIDEO_VIDEO_ID = "fJ9rUzIMcZQ"

describe("buildTrackMeta", () => {
	describe("art track", () => {
		it("picks the square googleusercontent art over the i.ytimg thumbnail", () => {
			const meta = buildTrackMeta(ART_VIDEO_ID, artTrack, 1024)
			expect(meta.albumArtUrl).toContain("googleusercontent.com")
			expect(meta.albumArtUrl).not.toContain("ytimg")
		})
		it("rewrites the art url to the requested size", () => {
			const meta = buildTrackMeta(ART_VIDEO_ID, artTrack, 1024)
			expect(meta.albumArtUrl).toContain("=w1024-h1024")
		})
		it("carries album, title, duration, and videoId through", () => {
			const meta = buildTrackMeta(ART_VIDEO_ID, artTrack, 1024)
			expect(meta.album).toBe('"Awaken, My Love!"')
			expect(meta.title).toBe("Redbone")
			expect(meta.durationSec).toBe(326)
			expect(meta.videoId).toBe(ART_VIDEO_ID)
		})
		it("prefers the queue artist over author when present", () => {
			const raw: RawTrackInfo = { ...artTrack, artist: "Donald Glover" }
			const meta = buildTrackMeta(ART_VIDEO_ID, raw, 1024)
			expect(meta.artist).toBe("Donald Glover")
		})
	})

	describe("music video without album art", () => {
		it("falls back to the i.ytimg thumbnail when no square art exists", () => {
			const meta = buildTrackMeta(VIDEO_VIDEO_ID, musicVideo, 1024)
			expect(meta.albumArtUrl).toContain("i.ytimg.com")
		})
		it("falls back to author when the queue artist is null", () => {
			const meta = buildTrackMeta(VIDEO_VIDEO_ID, musicVideo, 1024)
			expect(meta.artist).toBe("Queen Official")
		})
		it("reports a null album when the track has none", () => {
			const meta = buildTrackMeta(VIDEO_VIDEO_ID, musicVideo, 1024)
			expect(meta.album).toBeNull()
		})
	})
})

describe("fetchTrackMeta", () => {
	it("returns a TrackMeta when the source resolves raw info", async () => {
		const source = async () => artTrack as RawTrackInfo
		const meta = await fetchTrackMeta(source, ART_VIDEO_ID, 1024)
		expect(meta).not.toBeNull()
		expect(meta?.title).toBe("Redbone")
		expect(meta?.albumArtUrl).toContain("googleusercontent.com")
	})

	it("returns null when the source resolves null", async () => {
		const source = async () => null
		const meta = await fetchTrackMeta(source, ART_VIDEO_ID, 1024)
		expect(meta).toBeNull()
	})

	it("returns null and never rejects when the source throws", async () => {
		const source = async () => {
			throw new Error("network down")
		}
		await expect(fetchTrackMeta(source, ART_VIDEO_ID, 1024)).resolves.toBeNull()
	})
})
