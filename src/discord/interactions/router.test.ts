import { encodeCustomId } from "@/interactions/custom-id"
import { describe, expect, it } from "vitest"
import { routeInteraction } from "./router"

describe("routeInteraction", () => {
	describe("known actions", () => {
		it('routes a "revision.approve" button id carrying the lyrics and revision ids', () => {
			expect(routeInteraction(encodeCustomId("revision.approve", ["4210", "918"]))).toEqual({
				handler: "revision.approve",
				args: ["4210", "918"],
			})
		})

		it('routes a "revision.approve.confirm" button id carrying the lyrics and revision ids', () => {
			expect(routeInteraction(encodeCustomId("revision.approve.confirm", ["4210", "918"]))).toEqual(
				{
					handler: "revision.approve.confirm",
					args: ["4210", "918"],
				}
			)
		})

		it('routes a "revision.approve.cancel" button id with no args', () => {
			expect(routeInteraction(encodeCustomId("revision.approve.cancel", []))).toEqual({
				handler: "revision.approve.cancel",
				args: [],
			})
		})

		it('routes a "revision.reject" button id carrying the lyrics and revision ids', () => {
			expect(routeInteraction(encodeCustomId("revision.reject", ["4210", "918"]))).toEqual({
				handler: "revision.reject",
				args: ["4210", "918"],
			})
		})

		it('routes a "revision.reject.submit" modal id carrying the lyrics and revision ids', () => {
			expect(routeInteraction(encodeCustomId("revision.reject.submit", ["4210", "918"]))).toEqual({
				handler: "revision.reject.submit",
				args: ["4210", "918"],
			})
		})

		it('routes a "report.add" id to the report.add handler carrying the videoId', () => {
			const id = encodeCustomId("report.add", ["dQw4w9WgXcQ"])
			expect(routeInteraction(id)).toEqual({
				handler: "report.add",
				args: ["dQw4w9WgXcQ"],
			})
		})

		it('routes a "migrate.continue" id carrying the session id', () => {
			expect(routeInteraction(encodeCustomId("migrate.continue", ["sess-1"]))).toEqual({
				handler: "migrate.continue",
				args: ["sess-1"],
			})
		})

		it('routes a "migrate.nick" id carrying the session id and choice', () => {
			expect(routeInteraction(encodeCustomId("migrate.nick", ["sess-1", "new"]))).toEqual({
				handler: "migrate.nick",
				args: ["sess-1", "new"],
			})
		})

		it('routes a "migrate.confirm" id carrying the session id and choice', () => {
			expect(routeInteraction(encodeCustomId("migrate.confirm", ["sess-1", "old"]))).toEqual({
				handler: "migrate.confirm",
				args: ["sess-1", "old"],
			})
		})

		it('routes a "migrate.commit" modal id carrying the session id and choice', () => {
			expect(routeInteraction(encodeCustomId("migrate.commit", ["sess-1", "new"]))).toEqual({
				handler: "migrate.commit",
				args: ["sess-1", "new"],
			})
		})

		it('routes a "seal.pick" select id with no args', () => {
			expect(routeInteraction(encodeCustomId("seal.pick", []))).toEqual({
				handler: "seal.pick",
				args: [],
			})
		})

		it('routes a "seal.unpick" select id with no args', () => {
			expect(routeInteraction(encodeCustomId("seal.unpick", []))).toEqual({
				handler: "seal.unpick",
				args: [],
			})
		})

		it('routes a "queue.seal" button id carrying the lyrics id', () => {
			expect(routeInteraction(encodeCustomId("queue.seal", ["4210"]))).toEqual({
				handler: "queue.seal",
				args: ["4210"],
			})
		})

		it('routes a "queue.reject.submit" modal id carrying the lyrics id', () => {
			expect(routeInteraction(encodeCustomId("queue.reject.submit", ["4210"]))).toEqual({
				handler: "queue.reject.submit",
				args: ["4210"],
			})
		})

		it('routes a "queue.seal.cancel" button id with no args', () => {
			expect(routeInteraction(encodeCustomId("queue.seal.cancel", []))).toEqual({
				handler: "queue.seal.cancel",
				args: [],
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
		it("round-trips the largest revision ids through encode then route", () => {
			const max = String(Number.MAX_SAFE_INTEGER)
			const actions = [
				"revision.approve",
				"revision.approve.confirm",
				"revision.reject",
				"revision.reject.submit",
			]
			for (const action of actions) {
				const id = encodeCustomId(action, [max, max])
				expect(id.length).toBeLessThanOrEqual(100)
				expect(routeInteraction(id)).toEqual({ handler: action, args: [max, max] })
			}
		})

		it("does not route a revision action by prefix alone", () => {
			expect(routeInteraction("revision:4210:918")).toBeNull()
			expect(routeInteraction("revision.approve.extra:4210:918")).toBeNull()
		})

		it("preserves args through an encode then route round-trip", () => {
			const args = ["dQw4w9WgXcQ"]
			const route = routeInteraction(encodeCustomId("report.add", args))
			expect(route?.args).toEqual(args)
		})
	})
})
