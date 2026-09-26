import { DiscordAPIError, HTTPError, RESTJSONErrorCodes } from "discord.js"
import { describe, expect, it } from "vitest"
import { unlessGoneFromGuild } from "./gone-from-guild"

const MEMBER_URL =
	"https://discord.com/api/v10/guilds/1100000000000000000/members/123456789012345678"

function discordError(code: number, message: string, status = 404) {
	return new DiscordAPIError({ code, message }, code, status, "GET", MEMBER_URL, {})
}

const unknownMember = () => discordError(RESTJSONErrorCodes.UnknownMember, "Unknown Member")
const unknownUser = () => discordError(RESTJSONErrorCodes.UnknownUser, "Unknown User")

describe("unlessGoneFromGuild", () => {
	it("passes a resolved value through", async () => {
		const member = { id: "123456789012345678" }
		expect(await unlessGoneFromGuild(Promise.resolve(member))).toBe(member)
	})

	it("returns null when Discord reports Unknown Member", async () => {
		expect(await unlessGoneFromGuild(Promise.reject(unknownMember()))).toBeNull()
	})

	it("returns null when Discord reports Unknown User", async () => {
		expect(await unlessGoneFromGuild(Promise.reject(unknownUser()))).toBeNull()
	})

	describe("edge cases", () => {
		it("passes an undefined result through as undefined, not null", async () => {
			expect(await unlessGoneFromGuild(Promise.resolve(undefined))).toBeUndefined()
		})
	})

	describe("regressions", () => {
		it("regression: a Discord 5xx is not treated as the member having left", async () => {
			const outage = new HTTPError(503, "Service Unavailable", "GET", MEMBER_URL, {})
			await expect(unlessGoneFromGuild(Promise.reject(outage))).rejects.toBe(outage)
		})

		it("regression: an aborted request is not treated as the member having left", async () => {
			const abort = new DOMException("This operation was aborted", "AbortError")
			await expect(unlessGoneFromGuild(Promise.reject(abort))).rejects.toBe(abort)
		})
	})

	describe("error paths", () => {
		it("rethrows a different Discord API error on the same route", async () => {
			const missingAccess = discordError(RESTJSONErrorCodes.MissingAccess, "Missing Access", 403)
			await expect(unlessGoneFromGuild(Promise.reject(missingAccess))).rejects.toBe(missingAccess)
		})

		it("rethrows a 404 that is not about the member", async () => {
			const unknownGuild = discordError(RESTJSONErrorCodes.UnknownGuild, "Unknown Guild")
			await expect(unlessGoneFromGuild(Promise.reject(unknownGuild))).rejects.toBe(unknownGuild)
		})

		it("rethrows a plain error that happens to carry the Unknown Member code", async () => {
			const lookalike = Object.assign(new Error("Unknown Member"), { code: 10007 })
			await expect(unlessGoneFromGuild(Promise.reject(lookalike))).rejects.toBe(lookalike)
		})
	})

	describe("invariants", () => {
		it("rethrows the exact error instance it received", async () => {
			const err = new TypeError("fetch failed")
			await expect(unlessGoneFromGuild(Promise.reject(err))).rejects.toBe(err)
		})
	})
})
