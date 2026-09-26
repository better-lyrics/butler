import { describe, expect, it } from "vitest"
import { type DiscordProfile, createUnisonClient } from "./client"
import { pushDiscordProfiles, toDiscordProfile } from "./discord-profiles"

const HASH = "8342729096ea3675442027381ff50dfe"
const ANIMATED = "a_1234567890abcdef1234567890abcdef"

function profilesOf(count: number): DiscordProfile[] {
	return Array.from({ length: count }, (_, i) => ({
		discordId: String(123456789012345678n + BigInt(i)),
		avatar: HASH,
		username: `curator${i}`,
	}))
}

function scriptedUnison(responses: Array<() => Response>) {
	const sent: DiscordProfile[][] = []
	let call = 0
	const fetchImpl: typeof fetch = async (_input, init) => {
		sent.push(JSON.parse(String(init?.body)).profiles)
		const next = responses[Math.min(call++, responses.length - 1)]
		if (!next) throw new Error("no scripted response")
		return next()
	}
	const client = createUnisonClient({
		baseUrl: "https://unison.test",
		botSecret: "bot-secret",
		fetch: fetchImpl,
	})
	return { client, sent }
}

const updated = (n: number) => () => Response.json({ success: true, data: { updated: n } })

describe("toDiscordProfile", () => {
	it("uses the global avatar hash and the display name", () => {
		expect(
			toDiscordProfile({
				id: "123456789012345678",
				avatar: HASH,
				globalName: "Alice",
				username: "alice_42",
			})
		).toEqual({ discordId: "123456789012345678", avatar: HASH, username: "Alice" })
	})

	describe("edge cases", () => {
		it("falls back to the username when the user has no global name", () => {
			const profile = toDiscordProfile({
				id: "1",
				avatar: HASH,
				globalName: null,
				username: "alice_42",
			})
			expect(profile.username).toBe("alice_42")
		})

		it("keeps a null avatar for a user on the default Discord avatar", () => {
			const profile = toDiscordProfile({ id: "1", avatar: null, globalName: "A", username: "a" })
			expect(profile.avatar).toBeNull()
		})

		it("keeps an animated avatar hash verbatim", () => {
			const profile = toDiscordProfile({
				id: "1",
				avatar: ANIMATED,
				globalName: "A",
				username: "a",
			})
			expect(profile.avatar).toBe(ANIMATED)
		})

		it("keeps a unicode display name verbatim", () => {
			const profile = toDiscordProfile({
				id: "1",
				avatar: HASH,
				globalName: "ありす ✿",
				username: "a",
			})
			expect(profile.username).toBe("ありす ✿")
		})
	})
})

describe("pushDiscordProfiles", () => {
	it("sends a small batch in one call and reports the updated count", async () => {
		const { client, sent } = scriptedUnison([updated(1)])
		const outcome = await pushDiscordProfiles(client, profilesOf(2))
		expect(outcome).toEqual({ updated: 1, notDeployed: false, failures: [] })
		expect(sent).toHaveLength(1)
		expect(sent[0]).toHaveLength(2)
	})

	it("chunks at 100 and sums the updated counts", async () => {
		const { client, sent } = scriptedUnison([updated(3), updated(2), updated(1)])
		const outcome = await pushDiscordProfiles(client, profilesOf(250))
		expect(sent.map((c) => c.length)).toEqual([100, 100, 50])
		expect(outcome.updated).toBe(6)
	})

	describe("edge cases", () => {
		it("does not call Unison for an empty list", async () => {
			const { client, sent } = scriptedUnison([updated(0)])
			const outcome = await pushDiscordProfiles(client, [])
			expect(outcome).toEqual({ updated: 0, notDeployed: false, failures: [] })
			expect(sent).toHaveLength(0)
		})

		it("sends exactly 100 profiles in one call", async () => {
			const { client, sent } = scriptedUnison([updated(0)])
			await pushDiscordProfiles(client, profilesOf(100))
			expect(sent.map((c) => c.length)).toEqual([100])
		})

		it("splits 101 profiles into 100 and 1", async () => {
			const { client, sent } = scriptedUnison([updated(0)])
			await pushDiscordProfiles(client, profilesOf(101))
			expect(sent.map((c) => c.length)).toEqual([100, 1])
		})
	})

	describe("invariants", () => {
		it("sends every profile exactly once, in order", async () => {
			const profiles = profilesOf(230)
			const { client, sent } = scriptedUnison([updated(0)])
			await pushDiscordProfiles(client, profiles)
			expect(sent.flat()).toEqual(profiles)
		})

		it("does not mutate the input list", async () => {
			const profiles = profilesOf(150)
			const snapshot = structuredClone(profiles)
			const { client } = scriptedUnison([updated(0)])
			await pushDiscordProfiles(client, profiles)
			expect(profiles).toEqual(snapshot)
		})
	})

	describe("error paths", () => {
		it("stops after the first 404 and flags the route as not deployed", async () => {
			const { client, sent } = scriptedUnison([() => new Response("Not Found", { status: 404 })])
			const outcome = await pushDiscordProfiles(client, profilesOf(250))
			expect(outcome).toEqual({ updated: 0, notDeployed: true, failures: [] })
			expect(sent).toHaveLength(1)
		})

		it("records a failed chunk with context and still sends the rest", async () => {
			const { client, sent } = scriptedUnison([
				() => new Response("boom", { status: 500 }),
				updated(4),
			])
			const outcome = await pushDiscordProfiles(client, profilesOf(150))
			expect(sent).toHaveLength(2)
			expect(outcome.updated).toBe(4)
			expect(outcome.failures).toEqual(["profiles 1-100 of 150: HTTP 500"])
		})

		it("never rejects when the network call throws", async () => {
			const client = createUnisonClient({
				baseUrl: "https://unison.test",
				botSecret: "bot-secret",
				fetch: async () => {
					throw new TypeError("fetch failed")
				},
			})
			const outcome = await pushDiscordProfiles(client, profilesOf(2))
			expect(outcome).toEqual({
				updated: 0,
				notDeployed: false,
				failures: ["profiles 1-2 of 2: TypeError: fetch failed"],
			})
		})
	})
})
