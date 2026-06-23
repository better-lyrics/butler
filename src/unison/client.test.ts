import type { BotRequestBody } from "@/requests/payload"
import { beforeEach, describe, expect, it } from "vitest"
import { createUnisonClient } from "./client"

interface RecordedRequest {
	url: string
	method: string
	headers: Headers
	body: string | null
}

function makeFetch(response: Response) {
	const calls: RecordedRequest[] = []
	const fn: typeof fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input.toString()
		calls.push({
			url,
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

describe("createUnisonClient getLeaderboard", () => {
	it("issues a GET to the leaderboard users endpoint and parses curators", async () => {
		const curators = [
			{
				keyId: "key-1",
				reputation: 100,
				score: 42,
				submissionCount: 7,
				totalUpvotes: 30,
				fulfilledCount: 5,
				fulfilledDemand: 12,
				rank: 1,
				displayName: "Alice",
			},
		]
		const payload = { success: true, data: { curators } }
		const { fn, calls } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getLeaderboard()

		expect(calls).toHaveLength(1)
		expect(calls[0]?.url).toBe("https://unison.test/api/leaderboard/users")
		expect(calls[0]?.method).toBe("GET")
		expect(result).toEqual(curators)
	})

	it("throws on a non-ok response so a failed fetch never strips every role", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await expect(client.getLeaderboard()).rejects.toThrow()
	})
})

describe("createUnisonClient getBotLinks", () => {
	it("issues a GET with bearer auth and parses the envelope into camelCase", async () => {
		const payload = {
			success: true,
			data: {
				links: [
					{ discord_id: "disc-1", key_id: "key-1" },
					{ discord_id: "disc-2", key_id: "key-2" },
				],
			},
		}
		const { fn, calls } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getBotLinks()

		expect(calls[0]?.url).toBe("https://unison.test/api/links/bot/all")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual([
			{ discordId: "disc-1", keyId: "key-1" },
			{ discordId: "disc-2", keyId: "key-2" },
		])
	})

	it("throws on a non-ok response", async () => {
		const { fn } = makeFetch(new Response("nope", { status: 401 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await expect(client.getBotLinks()).rejects.toThrow()
	})
})

describe("createUnisonClient getBotBlacklist", () => {
	it("issues a GET with bearer auth and parses the key ids into a Set", async () => {
		const payload = { success: true, data: { keyIds: ["key-9", "key-10"] } }
		const { fn, calls } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getBotBlacklist()

		expect(calls[0]?.url).toBe("https://unison.test/api/links/bot/blacklist")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toBeInstanceOf(Set)
		expect([...result]).toEqual(["key-9", "key-10"])
	})

	it("throws on a non-ok response", async () => {
		const { fn } = makeFetch(new Response("nope", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await expect(client.getBotBlacklist()).rejects.toThrow()
	})
})

describe("createUnisonClient submitBotRequest", () => {
	it("posts the request body with discordId, auth header, and parses a created result", async () => {
		const body: BotRequestBody = {
			videoId: "vid-1",
			song: "Song",
			artist: "Artist",
			thumbnailUrl: "https://img.test/t.jpg",
			discordId: "disc-1",
		}
		const responseBody = {
			success: true,
			data: { status: "created", demand: 4, requestCount: 1 },
		}
		const { fn, calls } = makeFetch(Response.json(responseBody, { status: 201 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.submitBotRequest(body)

		expect(calls[0]?.url).toBe("https://unison.test/api/requests/bot")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(calls[0]?.headers.get("Content-Type")).toBe("application/json")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual(body)
		expect(JSON.parse(calls[0]?.body ?? "{}").discordId).toBe("disc-1")
		expect(result).toEqual({ status: "created", demand: 4, requestCount: 1 })
	})

	it("parses an already_requested result", async () => {
		const body: BotRequestBody = {
			videoId: "vid-2",
			song: "Song",
			artist: "Artist",
			thumbnailUrl: null,
			discordId: "disc-2",
		}
		const responseBody = {
			success: true,
			data: { status: "already_requested", demand: 9, requestCount: 3 },
		}
		const { fn } = makeFetch(Response.json(responseBody, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.submitBotRequest(body)

		expect(result).toEqual({ status: "already_requested", demand: 9, requestCount: 3 })
	})

	it("parses an already_available result without demand", async () => {
		const body: BotRequestBody = {
			videoId: "vid-3",
			song: "Song",
			artist: "Artist",
			thumbnailUrl: null,
			discordId: "disc-3",
		}
		const responseBody = { success: true, data: { status: "already_available" } }
		const { fn } = makeFetch(Response.json(responseBody, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.submitBotRequest(body)

		expect(result).toEqual({ status: "already_available" })
	})

	it("maps an unexpected 2xx status to an error result", async () => {
		const body: BotRequestBody = {
			videoId: "vid-5",
			song: "Song",
			artist: "Artist",
			thumbnailUrl: null,
			discordId: "disc-5",
		}
		const responseBody = { success: true, data: { status: "queued" } }
		const { fn } = makeFetch(Response.json(responseBody, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.submitBotRequest(body)

		expect(result).toEqual({ status: "error", code: 200 })
	})
})

describe("createUnisonClient submitBotRequest error responses", () => {
	const body: BotRequestBody = {
		videoId: "vid-4",
		song: "Song",
		artist: "Artist",
		thumbnailUrl: null,
		discordId: "disc-4",
	}

	let client: ReturnType<typeof createUnisonClient>

	beforeEach(() => {
		client = createUnisonClient({ baseUrl, botSecret, fetch: fetch })
	})

	it("maps a 400 to an error result", async () => {
		const { fn } = makeFetch(new Response("bad", { status: 400 }))
		client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		const result = await client.submitBotRequest(body)
		expect(result).toEqual({ status: "error", code: 400 })
	})

	it("maps a 401 to an error result", async () => {
		const { fn } = makeFetch(new Response("unauthorized", { status: 401 }))
		client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		const result = await client.submitBotRequest(body)
		expect(result).toEqual({ status: "error", code: 401 })
	})

	it("maps a 429 to an error result", async () => {
		const { fn } = makeFetch(new Response("rate limited", { status: 429 }))
		client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		const result = await client.submitBotRequest(body)
		expect(result).toEqual({ status: "error", code: 429 })
	})
})
