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

	it("carries the gamification fields on each curator row", async () => {
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
				community: false,
				discordLinked: true,
				tier: "master",
				level: 14,
				xp: 5200,
				xpForNext: 800,
				badgeCount: 3,
				topBadge: { key: "most-loved", name: "Most Loved", tier: 2 },
				featured: [
					{ key: "most-loved", name: "Most Loved", tier: 2 },
					{ key: "sharp-ear", name: "Sharp Ear" },
				],
				displayName: "Alice",
			},
			{
				keyId: "key-community",
				reputation: 999,
				score: 9000,
				submissionCount: 0,
				totalUpvotes: 0,
				fulfilledCount: 0,
				fulfilledDemand: 0,
				rank: 0,
				community: true,
				discordLinked: false,
				tier: null,
				level: 0,
				xp: 0,
				xpForNext: null,
				badgeCount: 0,
				topBadge: null,
				featured: [],
				displayName: "Better Lyrics",
			},
		]
		const payload = { success: true, data: { curators } }
		const { fn } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getLeaderboard()

		expect(result).toEqual(curators)
		expect(result[0]?.tier).toBe("master")
		expect(result[0]?.topBadge).toEqual({ key: "most-loved", name: "Most Loved", tier: 2 })
		expect(result[1]?.tier).toBeNull()
		expect(result[1]?.xpForNext).toBeNull()
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

describe("createUnisonClient getUserBadges", () => {
	it("issues a public GET and returns the user gamification payload", async () => {
		const keyId = "a".repeat(64)
		const data = {
			keyId,
			level: 12,
			xp: 3400,
			xpForNext: 600,
			tier: "master",
			tierRank: 7,
			badges: [
				{ key: "most-loved", earned: true, earnedAt: 1_700_000_000_000, tier: 2, featured: true },
				{ key: "sharp-ear", earned: false, progress: { current: 3, next: 10 }, featured: false },
			],
			featured: ["most-loved"],
			counts: { earned: 1, total: 20 },
			topExpertise: [{ scope: "artist", name: "Radiohead", rank: 1 }],
		}
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getUserBadges(keyId)

		expect(calls[0]?.url).toBe(`https://unison.test/api/users/${keyId}/badges`)
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBeNull()
		expect(result).toEqual(data)
	})

	it("throws on a non-ok response", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await expect(client.getUserBadges("a".repeat(64))).rejects.toThrow()
	})
})

describe("createUnisonClient getBadgeCatalogue", () => {
	it("issues a public GET and returns the catalogue with its display block", async () => {
		const data = {
			badges: [
				{
					key: "most-loved",
					name: "Most Loved",
					description: "A lyric you submitted earned a high score with strong community support.",
					category: "acclaim",
					kind: "medal",
					image: {
						color: "/badges/most-loved/image.svg?variant=color",
						mono: "/badges/most-loved/image.svg?variant=mono",
					},
				},
				{
					key: "prolific",
					name: "Prolific",
					description: "Submitted many accepted lyrics.",
					category: "output",
					kind: "medal",
					rarity: 0.05,
					secret: false,
					tiers: [
						{
							level: 1,
							threshold: 10,
							image: {
								color: "/badges/prolific/image.svg?variant=color&tier=1",
								mono: "/badges/prolific/image.svg?variant=mono",
							},
						},
					],
					image: {
						color: "/badges/prolific/image.svg?variant=color",
						mono: "/badges/prolific/image.svg?variant=mono",
					},
				},
			],
			display: {
				inlineGlyphs: 1,
				featuredMax: 5,
				rarityThreshold: 0.1,
				categoryOrder: ["tier", "output", "acclaim", "special"],
			},
		}
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getBadgeCatalogue()

		expect(calls[0]?.url).toBe("https://unison.test/api/badges")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBeNull()
		expect(result).toEqual(data)
		expect(result.badges[0]?.kind).toBe("medal")
		expect(result.display.featuredMax).toBe(5)
	})

	it("throws on a non-ok response", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 503 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await expect(client.getBadgeCatalogue()).rejects.toThrow()
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

function errorResponse(status: number, code: string) {
	return Response.json({ success: false, error: "nope", code, hint: "try again" }, { status })
}

describe("createUnisonClient startMigration", () => {
	it("posts the discord id with bearer auth and parses a started result", async () => {
		const payload = {
			success: true,
			data: {
				status: "awaiting_new_key",
				sessionId: "sess-1",
				signUrl: "https://unison.test/link/migrate/sess-1",
				oldKeyId: `${"a".repeat(58)}1b2c3d`,
			},
		}
		const { fn, calls } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.startMigration("disc-1")

		expect(calls[0]?.url).toBe("https://unison.test/api/migrations/bot/start")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(calls[0]?.headers.get("Content-Type")).toBe("application/json")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ discordId: "disc-1" })
		expect(result).toEqual({
			status: "started",
			sessionId: "sess-1",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
		})
	})

	it("maps 400 NOT_LINKED to not_linked", async () => {
		const { fn } = makeFetch(errorResponse(400, "NOT_LINKED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "not_linked" })
	})

	it("maps 403 LINK_BLACKLISTED to blacklisted", async () => {
		const { fn } = makeFetch(errorResponse(403, "LINK_BLACKLISTED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "blacklisted" })
	})

	it("maps 409 MIGRATION_ALREADY_ACTIVE to already_active", async () => {
		const { fn } = makeFetch(errorResponse(409, "MIGRATION_ALREADY_ACTIVE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "already_active" })
	})

	it("maps 503 LINKING_DISABLED to linking_disabled", async () => {
		const { fn } = makeFetch(errorResponse(503, "LINKING_DISABLED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "linking_disabled" })
	})

	it("maps an unknown error code to a generic error carrying the http status", async () => {
		const { fn } = makeFetch(errorResponse(418, "SURPRISE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "error", code: 418 })
	})

	it("maps a 200 missing fields to an error so a bad move never proceeds", async () => {
		const payload = { success: true, data: { status: "awaiting_new_key", sessionId: "sess-1" } }
		const { fn } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "error", code: 200 })
	})

	it("maps a 200 whose envelope omits data to an error instead of throwing", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "error", code: 200 })
	})

	it("maps a non-json error body to a generic error", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startMigration("disc-1")).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient getMigrationStatus", () => {
	it("gets the session with bearer auth and parses a ready status with counts", async () => {
		const data = {
			status: "ready",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
			newKeyId: `${"b".repeat(58)}9e8f7a`,
			oldNickname: "OldName",
			newNickname: "NewName",
			oldDisplayName: "OldName",
			newDisplayName: "NewName",
			counts: { submissions: 12, votes: 40, reports: 3, fulfillments: 5, collisions: 2 },
		}
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getMigrationStatus("sess-1")

		expect(calls[0]?.url).toBe("https://unison.test/api/migrations/bot/sess-1")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual({ status: "ok", data })
	})

	it("parses an awaiting_new_key status with null key and counts", async () => {
		const data = {
			status: "awaiting_new_key",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
			newKeyId: null,
			oldNickname: "OldName",
			newNickname: null,
			counts: null,
		}
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-1")).toEqual({ status: "ok", data })
	})

	it("passes through a failed status (e.g. same key)", async () => {
		const data = {
			status: "failed",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
			newKeyId: null,
			oldNickname: "OldName",
			newNickname: null,
			counts: null,
		}
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-1")).toEqual({ status: "ok", data })
	})

	it("maps a 200 whose envelope omits data to an error so a malformed response never crashes a handler", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-1")).toEqual({ status: "error", code: 200 })
	})

	it("passes through an expired status for a missing session (unison answers 200, never 404)", async () => {
		const data = {
			status: "expired",
			oldKeyId: `${"a".repeat(58)}1b2c3d`,
			newKeyId: null,
			oldNickname: null,
			newNickname: null,
			oldDisplayName: "OldName",
			newDisplayName: "",
			counts: null,
		}
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-x")).toEqual({ status: "ok", data })
	})

	it("maps a 404 to a generic error since a missing session returns 200 with expired, never 404", async () => {
		const { fn } = makeFetch(new Response("gone", { status: 404 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-x")).toEqual({ status: "error", code: 404 })
	})

	it("maps another non-ok response to an error result", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getMigrationStatus("sess-1")).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient commitMigration", () => {
	it("posts the discord id and nickname choice with bearer auth and parses a committed result", async () => {
		const moved = {
			submissions: 12,
			votes: 38,
			reports: 3,
			fulfillments: 5,
			collisionsDropped: 2,
		}
		const payload = { success: true, data: { migrationId: 42, moved } }
		const { fn, calls } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.commitMigration("sess-1", "disc-1", "new")

		expect(calls[0]?.url).toBe("https://unison.test/api/migrations/bot/sess-1/commit")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ discordId: "disc-1", keepNickname: "new" })
		expect(result).toEqual({ status: "committed", migrationId: 42, moved })
	})

	it("regression: treats a committed migration whose migrationId is 0 as committed, not an error", async () => {
		const moved = {
			submissions: 1,
			votes: 0,
			reports: 0,
			fulfillments: 0,
			collisionsDropped: 0,
		}
		const payload = { success: true, data: { migrationId: 0, moved } }
		const { fn } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({
			status: "committed",
			migrationId: 0,
			moved,
		})
	})

	it("maps 410 MIGRATION_EXPIRED to expired", async () => {
		const { fn } = makeFetch(errorResponse(410, "MIGRATION_EXPIRED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({ status: "expired" })
	})

	it("maps 409 MIGRATION_ALREADY_COMMITTED to already_committed", async () => {
		const { fn } = makeFetch(errorResponse(409, "MIGRATION_ALREADY_COMMITTED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({
			status: "already_committed",
		})
	})

	it("maps 409 MIGRATION_NOT_READY to not_ready (distinguished from already_committed by code)", async () => {
		const { fn } = makeFetch(errorResponse(409, "MIGRATION_NOT_READY"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({ status: "not_ready" })
	})

	it("maps 403 MIGRATION_NOT_OWNER to not_owner", async () => {
		const { fn } = makeFetch(errorResponse(403, "MIGRATION_NOT_OWNER"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({ status: "not_owner" })
	})

	it("maps 500 MIGRATION_FAILED to a generic error", async () => {
		const { fn } = makeFetch(errorResponse(500, "MIGRATION_FAILED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({
			status: "error",
			code: 500,
		})
	})

	it("maps a committed response missing moved counts to an error", async () => {
		const payload = { success: true, data: { migrationId: 42 } }
		const { fn } = makeFetch(Response.json(payload, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({
			status: "error",
			code: 200,
		})
	})

	it("maps a 200 whose envelope omits data to an error instead of throwing", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.commitMigration("sess-1", "disc-1", "old")).toEqual({
			status: "error",
			code: 200,
		})
	})
})
