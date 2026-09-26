import { describe, expect, it } from "vitest"
import { createUnisonClient } from "./client"

function makeFetch(response: Response) {
	const calls: { url: string; method: string; headers: Headers; body: string | null }[] = []
	const fn: typeof fetch = async (input, init) => {
		calls.push({
			url: typeof input === "string" ? input : input.toString(),
			method: init?.method ?? "GET",
			headers: new Headers(init?.headers),
			body: typeof init?.body === "string" ? init.body : null,
		})
		return response
	}
	return { fn, calls }
}

const baseUrl = "https://unison.test/api/"
const botSecret = "super-secret"
const input = {
	id: "el-gato",
	label: "El Gato",
	createdBy: "k1",
	mime: "image/png",
	bytes: Buffer.from("hello"),
}

describe("createUnisonClient createAvatarPreset", () => {
	it("posts base64 bytes with the bot secret and returns created", async () => {
		const { fn, calls } = makeFetch(
			Response.json(
				{
					success: true,
					data: { id: "el-gato", label: "El Gato", url: "https://cdn/el-gato.webp" },
				},
				{ status: 200 }
			)
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.createAvatarPreset(input)

		expect(calls).toHaveLength(1)
		expect(calls[0]?.url).toBe("https://unison.test/api/avatars/presets")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			id: "el-gato",
			label: "El Gato",
			createdBy: "k1",
			mime: "image/png",
			dataBase64: Buffer.from("hello").toString("base64"),
		})
		expect(result).toEqual({
			status: "created",
			id: "el-gato",
			label: "El Gato",
			url: "https://cdn/el-gato.webp",
		})
	})

	describe("error mapping", () => {
		it.each([
			[409, "AVATAR_PRESET_EXISTS", "exists"],
			[422, "AVATAR_IMAGE_INVALID", "invalid"],
			[503, "CDN_UNAVAILABLE", "cdn_unavailable"],
		])("maps %i %s to %s", async (httpStatus, code, status) => {
			const { fn } = makeFetch(Response.json({ success: false, code }, { status: httpStatus }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.createAvatarPreset(input)).toEqual({ status })
		})

		it("maps an unknown failure to error with the http status", async () => {
			const { fn } = makeFetch(Response.json({ success: false }, { status: 500 }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.createAvatarPreset(input)).toEqual({ status: "error", code: 500 })
		})
	})
})
