import { describe, expect, it } from "vitest"
import { fetchImageBytes, imageFileName, normalizeMime } from "./download"

describe("fetchImageBytes", () => {
	it("returns the bytes on a successful fetch", async () => {
		const doFetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch
		const bytes = await fetchImageBytes("https://x/i.png", doFetch)
		expect(bytes).not.toBeNull()
		expect([...(bytes as Buffer)]).toEqual([1, 2, 3])
	})

	it("returns null on a non-ok response", async () => {
		const doFetch = (async () => new Response("", { status: 404 })) as typeof fetch
		expect(await fetchImageBytes("https://x/i.png", doFetch)).toBeNull()
	})

	it("returns null when the fetch throws", async () => {
		const doFetch = (async () => {
			throw new Error("network")
		}) as typeof fetch
		expect(await fetchImageBytes("https://x/i.png", doFetch)).toBeNull()
	})
})

describe("imageFileName", () => {
	it("maps mimes to extensions", () => {
		expect(imageFileName("el-gato", "image/png")).toBe("el-gato.png")
		expect(imageFileName("el-gato", "image/jpeg")).toBe("el-gato.jpg")
		expect(imageFileName("el-gato", "image/gif")).toBe("el-gato.gif")
		expect(imageFileName("el-gato", "image/webp; charset=binary")).toBe("el-gato.webp")
	})

	it("falls back to webp for an unknown mime", () => {
		expect(imageFileName("x", null)).toBe("x.webp")
	})
})

describe("normalizeMime", () => {
	it("drops parameters and lowercases", () => {
		expect(normalizeMime("Image/PNG; charset=binary")).toBe("image/png")
	})
})
