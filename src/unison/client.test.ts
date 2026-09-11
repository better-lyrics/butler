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

const keyId = "a".repeat(64)
const quota = { quota: 8, used: 3, remaining: 5, resetsAt: 1_790_000_000 }

describe("createUnisonClient getLyricsVariants", () => {
	function variantRow(overrides: Record<string, unknown> = {}) {
		return {
			id: 21,
			videoId: "dQw4w9WgXcQ",
			song: "Never Gonna Give You Up",
			artist: "Rick Astley",
			format: "ttml",
			syncType: "line",
			score: 42,
			effectiveScore: 40,
			voteCount: 12,
			confidence: "high",
			submitter: { keyId: "b".repeat(64), reputation: 900, displayName: "quiet-fern" },
			...overrides,
		}
	}

	it("issues a public GET (no auth) and maps rows to the trimmed variant shape", async () => {
		const data = [variantRow({ id: 21 }), variantRow({ id: 22, submitter: null })]
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getLyricsVariants("dQw4w9WgXcQ")

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/variants/dQw4w9WgXcQ")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBeNull()
		expect(result).toEqual({
			status: "ok",
			variants: [
				{
					id: 21,
					song: "Never Gonna Give You Up",
					artist: "Rick Astley",
					format: "ttml",
					score: 42,
					submitterName: "quiet-fern",
				},
				{
					id: 22,
					song: "Never Gonna Give You Up",
					artist: "Rick Astley",
					format: "ttml",
					score: 42,
					submitterName: null,
				},
			],
		})
	})

	it("percent-encodes the videoId into the path", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, data: [] }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		await client.getLyricsVariants("weird/id?x")
		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/variants/weird%2Fid%3Fx")
	})

	it("maps a 404 to not_found", async () => {
		const { fn } = makeFetch(new Response("nope", { status: 404 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getLyricsVariants("missing")).toEqual({ status: "not_found" })
	})

	it("maps another non-ok response to an error result", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getLyricsVariants("vid")).toEqual({ status: "error", code: 500 })
	})

	it("maps a 200 whose data is not an array to an error", async () => {
		const { fn } = makeFetch(Response.json({ success: true, data: { nope: 1 } }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getLyricsVariants("vid")).toEqual({ status: "error", code: 200 })
	})

	it("returns an empty variant list for a 200 with an empty array", async () => {
		const { fn } = makeFetch(Response.json({ success: true, data: [] }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getLyricsVariants("vid")).toEqual({ status: "ok", variants: [] })
	})
})

describe("createUnisonClient boostLyrics", () => {
	it("posts the keyId with bearer auth and parses a sealed result carrying quota", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, quota }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.boostLyrics("42", keyId)

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/42/boost/bot")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(calls[0]?.headers.get("Content-Type")).toBe("application/json")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId })
		expect(result).toEqual({ status: "sealed", quota })
	})

	it("never puts the keyId in the url", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, quota }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		await client.boostLyrics("42", keyId)
		expect(calls[0]?.url).not.toContain(keyId)
	})

	it("maps 403 NOT_COMMITTEE to not_council", async () => {
		const { fn } = makeFetch(errorResponse(403, "NOT_COMMITTEE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "not_council" })
	})

	it("maps 404 NOT_FOUND to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "not_found" })
	})

	it("maps 400 BOOST_SELF to self", async () => {
		const { fn } = makeFetch(errorResponse(400, "BOOST_SELF"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "self" })
	})

	it("maps 400 BOOST_TARGET_COMMITTEE to target_council", async () => {
		const { fn } = makeFetch(errorResponse(400, "BOOST_TARGET_COMMITTEE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "target_council" })
	})

	it("maps 429 BOOST_QUOTA_EXCEEDED to over_quota", async () => {
		const { fn } = makeFetch(errorResponse(429, "BOOST_QUOTA_EXCEEDED"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "over_quota" })
	})

	it("maps 409 BOOST_ALREADY_ACTIVE to already_sealed", async () => {
		const { fn } = makeFetch(errorResponse(409, "BOOST_ALREADY_ACTIVE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "already_sealed" })
	})

	it("maps an unknown error code to a generic error carrying the http status", async () => {
		const { fn } = makeFetch(errorResponse(418, "SURPRISE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "error", code: 418 })
	})

	it("maps a 200 that omits the quota to an error rather than a bad seal", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.boostLyrics("42", keyId)).toEqual({ status: "error", code: 200 })
	})
})

describe("createUnisonClient unboostLyrics", () => {
	it("sends a DELETE with the keyId body and bearer auth and parses unsealed", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.unboostLyrics("42", keyId)

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/42/boost/bot")
		expect(calls[0]?.method).toBe("DELETE")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId })
		expect(result).toEqual({ status: "unsealed" })
	})

	it("maps 403 BOOST_NOT_OWNER to not_owner", async () => {
		const { fn } = makeFetch(errorResponse(403, "BOOST_NOT_OWNER"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.unboostLyrics("42", keyId)).toEqual({ status: "not_owner" })
	})

	it("maps 403 NOT_COMMITTEE to not_council", async () => {
		const { fn } = makeFetch(errorResponse(403, "NOT_COMMITTEE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.unboostLyrics("42", keyId)).toEqual({ status: "not_council" })
	})

	it("maps 404 NOT_FOUND to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.unboostLyrics("42", keyId)).toEqual({ status: "not_found" })
	})

	it("maps an unknown error code to a generic error carrying the http status", async () => {
		const { fn } = makeFetch(errorResponse(500, "SURPRISE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.unboostLyrics("42", keyId)).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient getBoostQuota", () => {
	it("gets the bot quota with the keyId as a query param and bearer auth", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, quota }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getBoostQuota(keyId)

		expect(calls[0]?.url).toBe(`https://unison.test/api/lyrics/boost/quota/bot?keyId=${keyId}`)
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual({ status: "ok", quota })
	})

	it("maps 403 NOT_COMMITTEE to not_council", async () => {
		const { fn } = makeFetch(errorResponse(403, "NOT_COMMITTEE"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getBoostQuota(keyId)).toEqual({ status: "not_council" })
	})

	it("maps 404 NOT_FOUND (keyId has no unison user) to unknown_user", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getBoostQuota(keyId)).toEqual({ status: "unknown_user" })
	})

	it("maps another non-ok response to an error result", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getBoostQuota(keyId)).toEqual({ status: "error", code: 500 })
	})

	it("maps a 200 that omits the quota to an error", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getBoostQuota(keyId)).toEqual({ status: "error", code: 200 })
	})
})

describe("createUnisonClient addCouncilMember", () => {
	it("posts the keyId with bearer auth and parses an added result", async () => {
		const { fn, calls } = makeFetch(
			Response.json({ success: true, data: { keyId } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.addCouncilMember(keyId)

		expect(calls[0]?.url).toBe("https://unison.test/api/committee/bot")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(calls[0]?.headers.get("Content-Type")).toBe("application/json")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId })
		expect(result).toEqual({ status: "added" })
	})

	it("maps 404 NOT_FOUND to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.addCouncilMember(keyId)).toEqual({ status: "not_found" })
	})

	it("maps an unknown non-ok response to a generic error carrying the http status", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.addCouncilMember(keyId)).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient removeCouncilMember", () => {
	it("sends a DELETE with the keyId body and bearer auth and parses removed", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.removeCouncilMember(keyId)

		expect(calls[0]?.url).toBe("https://unison.test/api/committee/bot")
		expect(calls[0]?.method).toBe("DELETE")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId })
		expect(result).toEqual({ status: "removed" })
	})

	it("maps 404 NOT_FOUND to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.removeCouncilMember(keyId)).toEqual({ status: "not_found" })
	})

	it("maps an unknown non-ok response to a generic error", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.removeCouncilMember(keyId)).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient getCouncil", () => {
	it("gets the council with bearer auth and parses the keyId list", async () => {
		const keyIds = ["a".repeat(64), "b".repeat(64)]
		const { fn, calls } = makeFetch(
			Response.json({ success: true, data: { keyIds } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getCouncil()

		expect(calls[0]?.url).toBe("https://unison.test/api/committee/bot")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual({ status: "ok", keyIds })
	})

	it("returns an empty council for a 200 with an empty list", async () => {
		const { fn } = makeFetch(
			Response.json({ success: true, data: { keyIds: [] } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getCouncil()).toEqual({ status: "ok", keyIds: [] })
	})

	it("maps a 200 whose data is not a keyId array to an error", async () => {
		const { fn } = makeFetch(Response.json({ success: true, data: {} }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getCouncil()).toEqual({ status: "error", code: 200 })
	})

	it("maps a non-ok response to an error result", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getCouncil()).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient getLyricsQueue", () => {
	const queueRow = {
		id: 4210,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		format: "ttml",
		score: 87,
		voteCount: 41,
		submitter: { displayName: "Alice" },
		ttmlSignals: ["line-synced", "unbracketed-bg"],
	}

	it("issues a GET with sort and limit query and bearer auth, parsing entries", async () => {
		const { fn, calls } = makeFetch(
			Response.json({ success: true, data: [queueRow] }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getLyricsQueue("most-voted", 5)

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/queue/bot?sort=most-voted&limit=5")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual({
			status: "ok",
			entries: [
				{
					id: 4210,
					videoId: "dQw4w9WgXcQ",
					song: "Never Gonna Give You Up",
					artist: "Rick Astley",
					format: "ttml",
					score: 87,
					voteCount: 41,
					submitterName: "Alice",
					ttmlSignals: ["line-synced", "unbracketed-bg"],
				},
			],
		})
	})

	it("omits the query string when no sort or limit is given", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, data: [] }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await client.getLyricsQueue()

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/queue/bot")
	})

	describe("edge cases", () => {
		it("defaults a missing submitter to null and missing signals to an empty array", async () => {
			const row = { ...queueRow, submitter: null, ttmlSignals: undefined }
			const { fn } = makeFetch(Response.json({ success: true, data: [row] }, { status: 200 }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

			const result = await client.getLyricsQueue()

			expect(result).toMatchObject({
				status: "ok",
				entries: [{ submitterName: null, ttmlSignals: [] }],
			})
		})

		it("returns an empty entries list without error", async () => {
			const { fn } = makeFetch(Response.json({ success: true, data: [] }, { status: 200 }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.getLyricsQueue()).toEqual({ status: "ok", entries: [] })
		})
	})

	describe("error paths", () => {
		it("maps a non-ok response to an error result", async () => {
			const { fn } = makeFetch(new Response("boom", { status: 500 }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.getLyricsQueue()).toEqual({ status: "error", code: 500 })
		})

		it("maps a malformed body (data not an array) to an error result", async () => {
			const { fn } = makeFetch(Response.json({ success: true, data: {} }, { status: 200 }))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.getLyricsQueue()).toEqual({ status: "error", code: 200 })
		})
	})
})

describe("createUnisonClient rejectLyric", () => {
	const KEY_ID = "a".repeat(64)

	it("posts keyId and note with bearer auth and encodes the lyrics id", async () => {
		const { fn, calls } = makeFetch(new Response(null, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.rejectLyric("4210", KEY_ID, "wrong sync throughout")

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/4210/reject/bot")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			keyId: KEY_ID,
			note: "wrong sync throughout",
		})
		expect(result).toEqual({ status: "rejected" })
	})

	it("omits note from the body when none is given", async () => {
		const { fn, calls } = makeFetch(new Response(null, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		await client.rejectLyric("77", KEY_ID)

		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId: KEY_ID })
	})

	describe("error paths", () => {
		it("maps NOT_COMMITTEE to not_council", async () => {
			const { fn } = makeFetch(errorResponse(403, "NOT_COMMITTEE"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.rejectLyric("1", KEY_ID)).toEqual({ status: "not_council" })
		})

		it("maps NOT_FOUND to not_found", async () => {
			const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.rejectLyric("1", KEY_ID)).toEqual({ status: "not_found" })
		})

		it("maps REJECT_ALREADY_ACTIVE to already_rejected", async () => {
			const { fn } = makeFetch(errorResponse(409, "REJECT_ALREADY_ACTIVE"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.rejectLyric("1", KEY_ID)).toEqual({ status: "already_rejected" })
		})

		it("maps an unknown error code to a generic error", async () => {
			const { fn } = makeFetch(errorResponse(500, "SOMETHING_ELSE"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.rejectLyric("1", KEY_ID)).toEqual({ status: "error", code: 500 })
		})
	})
})

describe("createUnisonClient unrejectLyric", () => {
	const KEY_ID = "b".repeat(64)

	it("deletes with keyId body and bearer auth", async () => {
		const { fn, calls } = makeFetch(new Response(null, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.unrejectLyric("4210", KEY_ID)

		expect(calls[0]?.url).toBe("https://unison.test/api/lyrics/4210/reject/bot")
		expect(calls[0]?.method).toBe("DELETE")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId: KEY_ID })
		expect(result).toEqual({ status: "unrejected" })
	})

	describe("error paths", () => {
		it("maps NOT_COMMITTEE to not_council", async () => {
			const { fn } = makeFetch(errorResponse(403, "NOT_COMMITTEE"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.unrejectLyric("1", KEY_ID)).toEqual({ status: "not_council" })
		})

		it("maps NOT_FOUND to not_found", async () => {
			const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.unrejectLyric("1", KEY_ID)).toEqual({ status: "not_found" })
		})

		it("maps an unknown error code to a generic error", async () => {
			const { fn } = makeFetch(errorResponse(500, "NOPE"))
			const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
			expect(await client.unrejectLyric("1", KEY_ID)).toEqual({ status: "error", code: 500 })
		})
	})
})

describe("createUnisonClient startExam", () => {
	it("posts keyId and discordId with bearer auth and parses an eligible result", async () => {
		const data = {
			status: "eligible",
			examUrl: "https://unison.test/exam?t=tok-1",
			expiresAt: 1_790_000_000,
		}
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.startExam(keyId, "disc-1")

		expect(calls[0]?.url).toBe("https://unison.test/api/exam/bot/start")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(calls[0]?.headers.get("Content-Type")).toBe("application/json")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ keyId, discordId: "disc-1" })
		expect(result).toEqual({
			status: "eligible",
			examUrl: "https://unison.test/exam?t=tok-1",
			expiresAt: 1_790_000_000,
		})
	})

	it("never puts the keyId in the url", async () => {
		const data = { status: "eligible", examUrl: "https://unison.test/exam?t=tok-1", expiresAt: 1 }
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		await client.startExam(keyId, "disc-1")
		expect(calls[0]?.url).not.toContain(keyId)
	})

	it("parses an already_attempted result carrying state, score and submittedAt", async () => {
		const data = {
			status: "already_attempted",
			attempt: { state: "pending_review", score: 88, submittedAt: 1_789_000_000 },
		}
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({
			status: "already_attempted",
			attempt: { state: "pending_review", score: 88, submittedAt: 1_789_000_000 },
		})
	})

	it("defaults a missing score and submittedAt to null for an in-progress attempt", async () => {
		const data = { status: "already_attempted", attempt: { state: "in_progress" } }
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({
			status: "already_attempted",
			attempt: { state: "in_progress", score: null, submittedAt: null },
		})
	})

	it("maps 404 NOT_FOUND (keyId unknown to unison) to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({ status: "not_found" })
	})

	it("maps an eligible 200 missing the examUrl to an error so no broken link is shown", async () => {
		const data = { status: "eligible", expiresAt: 1 }
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({ status: "error", code: 200 })
	})

	it("maps an already_attempted 200 with an unknown state to an error", async () => {
		const data = { status: "already_attempted", attempt: { state: "banana" } }
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({ status: "error", code: 200 })
	})

	it("maps a 200 whose envelope omits data to an error instead of throwing", async () => {
		const { fn } = makeFetch(Response.json({ success: true }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({ status: "error", code: 200 })
	})

	it("maps a non-json error body to a generic error", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.startExam(keyId, "disc-1")).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient getExamApplicants", () => {
	function applicantRow(overrides: Record<string, unknown> = {}) {
		return {
			applicantId: "sess-1",
			discordId: "disc-1",
			keyId,
			displayName: "quiet-fern",
			score: 88,
			maxScore: 100,
			cutoff: 85,
			breakdown: [
				{ section: "timing", score: 4, max: 5 },
				{ section: "standards", score: 5, max: 5 },
			],
			submittedAt: 1_789_000_000,
			state: "pending_review",
			...overrides,
		}
	}

	it("gets the applicants with bearer auth and no query param by default", async () => {
		const data = { applicants: [applicantRow()] }
		const { fn, calls } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.getExamApplicants()

		expect(calls[0]?.url).toBe("https://unison.test/api/exam/bot/applicants")
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(result).toEqual({ status: "ok", applicants: [applicantRow()] })
	})

	it("sets the includeBelowCutoff query param when asked for near-misses", async () => {
		const { fn, calls } = makeFetch(
			Response.json({ success: true, data: { applicants: [] } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		await client.getExamApplicants(true)
		expect(calls[0]?.url).toBe(
			"https://unison.test/api/exam/bot/applicants?includeBelowCutoff=true"
		)
	})

	it("returns an empty list without error", async () => {
		const { fn } = makeFetch(
			Response.json({ success: true, data: { applicants: [] } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getExamApplicants()).toEqual({ status: "ok", applicants: [] })
	})

	it("defaults a missing breakdown to an empty array", async () => {
		const data = { applicants: [applicantRow({ breakdown: undefined })] }
		const { fn } = makeFetch(Response.json({ success: true, data }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		const result = await client.getExamApplicants()
		expect(result).toMatchObject({ status: "ok", applicants: [{ breakdown: [] }] })
	})

	it("maps a malformed body (applicants not an array) to an error", async () => {
		const { fn } = makeFetch(
			Response.json({ success: true, data: { applicants: {} } }, { status: 200 })
		)
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getExamApplicants()).toEqual({ status: "error", code: 200 })
	})

	it("maps a non-ok response to an error result", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.getExamApplicants()).toEqual({ status: "error", code: 500 })
	})
})

describe("createUnisonClient decideExamApplicant", () => {
	it("posts the decision and decider with bearer auth and encodes the applicant id", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, data: {} }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })

		const result = await client.decideExamApplicant("sess 1", "approve", "admin-1")

		expect(calls[0]?.url).toBe("https://unison.test/api/exam/bot/applicants/sess%201/decision")
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer super-secret")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			decision: "approve",
			deciderDiscordId: "admin-1",
		})
		expect(result).toEqual({ status: "recorded" })
	})

	it("records a reject decision", async () => {
		const { fn, calls } = makeFetch(Response.json({ success: true, data: {} }, { status: 200 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		const result = await client.decideExamApplicant("sess-2", "reject", "admin-1")
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			decision: "reject",
			deciderDiscordId: "admin-1",
		})
		expect(result).toEqual({ status: "recorded" })
	})

	it("maps 404 NOT_FOUND to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.decideExamApplicant("sess-x", "approve", "admin-1")).toEqual({
			status: "not_found",
		})
	})

	it("maps 404 EXAM_SESSION_NOT_FOUND (unison's decision code) to not_found", async () => {
		const { fn } = makeFetch(errorResponse(404, "EXAM_SESSION_NOT_FOUND"))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.decideExamApplicant("sess-x", "reject", "admin-1")).toEqual({
			status: "not_found",
		})
	})

	it("maps an unknown non-ok response to a generic error", async () => {
		const { fn } = makeFetch(new Response("boom", { status: 500 }))
		const client = createUnisonClient({ baseUrl, botSecret, fetch: fn })
		expect(await client.decideExamApplicant("sess-1", "approve", "admin-1")).toEqual({
			status: "error",
			code: 500,
		})
	})
})
