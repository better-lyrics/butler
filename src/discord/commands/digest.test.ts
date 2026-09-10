import {
	configGuildOnly,
	digestDisabled,
	digestEmpty,
	digestNoChannel,
	digestNoPermission,
	digestPosted,
	queueError,
} from "@/copy/strings"
import { PermissionFlagsBits } from "discord.js"
import { describe, expect, it } from "vitest"
import { type DigestResult, handleDigest } from "./digest"

function interaction(opts: { guildId?: string | null; admin?: boolean; noPerms?: boolean } = {}) {
	const deferred: unknown[] = []
	const edits: unknown[] = []
	const replies: unknown[] = []
	return {
		int: {
			guildId: opts.guildId === undefined ? "g1" : opts.guildId,
			memberPermissions: opts.noPerms
				? null
				: {
						has: (flag: bigint) =>
							flag === PermissionFlagsBits.ManageGuild ? (opts.admin ?? true) : false,
					},
			deferReply: async (p: unknown) => {
				deferred.push(p)
			},
			editReply: async (p: unknown) => {
				edits.push(p)
			},
			reply: async (p: unknown) => {
				replies.push(p)
			},
		},
		deferred,
		edits,
		replies,
	}
}

function deps(result: DigestResult) {
	const calls: number[] = []
	return {
		calls,
		deps: {
			runDigest: async () => {
				calls.push(1)
				return result
			},
		},
	}
}

function content(payload: unknown): string {
	return (payload as { content?: string }).content ?? ""
}

describe("handleDigest", () => {
	describe("gates", () => {
		it("refuses outside a guild and never runs", async () => {
			const { int, replies } = interaction({ guildId: null })
			const { deps: d, calls } = deps("posted")
			await handleDigest(int, d)
			expect(content(replies[0])).toBe(configGuildOnly)
			expect(calls).toHaveLength(0)
		})

		it("refuses a non-admin and never runs", async () => {
			const { int, replies } = interaction({ admin: false })
			const { deps: d, calls } = deps("posted")
			await handleDigest(int, d)
			expect(content(replies[0])).toBe(digestNoPermission)
			expect(calls).toHaveLength(0)
		})
	})

	describe("results", () => {
		const cases: Array<[DigestResult, string]> = [
			["posted", digestPosted],
			["empty", digestEmpty],
			["no_channel", digestNoChannel],
			["disabled", digestDisabled],
			["skipped", queueError],
		]

		for (const [result, copy] of cases) {
			it(`defers, then edits with the ${result} copy`, async () => {
				const { int, deferred, edits } = interaction()
				await handleDigest(int, deps(result).deps)
				expect(deferred).toHaveLength(1)
				expect(content(edits[0])).toBe(copy)
			})
		}
	})

	describe("edge cases", () => {
		it("refuses when member permissions are unavailable and never runs", async () => {
			const { int, replies } = interaction({ noPerms: true })
			const { deps: d, calls } = deps("posted")
			await handleDigest(int, d)
			expect(content(replies[0])).toBe(digestNoPermission)
			expect(calls).toHaveLength(0)
		})

		it("treats an empty guild id as no guild and never runs", async () => {
			const { int, replies } = interaction({ guildId: "" })
			const { deps: d, calls } = deps("posted")
			await handleDigest(int, d)
			expect(content(replies[0])).toBe(configGuildOnly)
			expect(calls).toHaveLength(0)
		})
	})

	describe("invariants", () => {
		const results: DigestResult[] = ["posted", "empty", "no_channel", "disabled", "skipped"]

		it("maps every result to a non-empty message", async () => {
			for (const result of results) {
				const { int, edits } = interaction()
				await handleDigest(int, deps(result).deps)
				expect(content(edits[0]).length).toBeGreaterThan(0)
			}
		})

		it("always acknowledges through defer then edit, never a direct reply", async () => {
			for (const result of results) {
				const { int, deferred, edits, replies } = interaction()
				await handleDigest(int, deps(result).deps)
				expect(deferred).toHaveLength(1)
				expect(edits).toHaveLength(1)
				expect(replies).toHaveLength(0)
			}
		})
	})
})
