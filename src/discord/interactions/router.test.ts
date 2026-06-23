import { encodeCustomId } from "@/interactions/custom-id"
import { describe, expect, it } from "vitest"
import { routeInteraction } from "./router"

describe("routeInteraction", () => {
	describe("known actions", () => {
		it('routes a "report.add" id to the report.add handler carrying the videoId', () => {
			const id = encodeCustomId("report.add", ["dQw4w9WgXcQ"])
			expect(routeInteraction(id)).toEqual({
				handler: "report.add",
				args: ["dQw4w9WgXcQ"],
			})
		})
	})

	describe("unknown and unparseable ids", () => {
		it('returns null for the retired "connect" action', () => {
			expect(routeInteraction("connect")).toBeNull()
		})

		it("returns null for an unknown action", () => {
			expect(routeInteraction("report.delete:x")).toBeNull()
		})

		it("returns null for an unparseable (empty) id", () => {
			expect(routeInteraction("")).toBeNull()
		})
	})

	describe("invariants", () => {
		it("preserves args through an encode then route round-trip", () => {
			const args = ["dQw4w9WgXcQ"]
			const route = routeInteraction(encodeCustomId("report.add", args))
			expect(route?.args).toEqual(args)
		})
	})
})
