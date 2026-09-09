import {
	sealAlreadyActive,
	sealBadVideo,
	sealConfirmButtonLabel,
	sealError,
	sealNoVariants,
	sealNotCouncil,
	sealNotFound,
	sealNotOwner,
	sealOverQuota,
	sealSelf,
	sealSuccessHeading,
	sealTargetCouncil,
	sealUnknownUser,
	unsealConfirmButtonLabel,
	unsealSuccessHeading,
} from "@/copy/strings"
import type {
	BoostQuota,
	LyricVariant,
	LyricsVariantsResult,
	QuotaResult,
	SealResult,
	UnsealResult,
} from "@/unison/client"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	type SealCommandDeps,
	type SealPickDeps,
	type SealUnpickDeps,
	handleSeal,
	handleSealPick,
	handleSealUnpick,
	parseVideoIdInput,
} from "./seal"

const KEY_ID = "a".repeat(64)
const okQuota: BoostQuota = { quota: 8, used: 3, remaining: 5, resetsAt: 1_790_000_000 }
const VARIANTS: LyricVariant[] = [
	{
		id: 21,
		song: "Teardrop",
		artist: "Massive Attack",
		format: "ttml",
		score: 42,
		submitterName: "quiet-fern",
	},
	{
		id: 22,
		song: "Teardrop",
		artist: "Massive Attack",
		format: "lrc",
		score: 8,
		submitterName: null,
	},
]

function ephemeral(flags: unknown): boolean {
	if (Array.isArray(flags)) return flags.includes(MessageFlags.Ephemeral)
	return ((flags as number) & MessageFlags.Ephemeral) !== 0
}

function chatInteraction(opts: { sub: string; video?: string | null; userId?: string }) {
	const replies: Array<Record<string, unknown>> = []
	const interaction = {
		user: { id: opts.userId ?? "disc-1" },
		options: {
			getSubcommand: () => opts.sub,
			getString: (_name: string, _required?: boolean) => opts.video ?? null,
		},
		reply: async (p: Record<string, unknown>) => {
			replies.push(p)
		},
	}
	return { interaction, replies }
}

function selectInteraction(opts: { value?: string; userId?: string }) {
	const updates: Array<Record<string, unknown>> = []
	const interaction = {
		user: { id: opts.userId ?? "disc-1" },
		update: async (p: Record<string, unknown>) => {
			updates.push(p)
		},
	}
	return { interaction, updates, lyricsId: opts.value ?? "" }
}

function commandDeps(overrides: Partial<SealCommandDeps> = {}): {
	deps: SealCommandDeps
	calls: { quota: string[]; variants: string[]; resolve: string[] }
} {
	const calls = { quota: [] as string[], variants: [] as string[], resolve: [] as string[] }
	const deps: SealCommandDeps = {
		resolveKeyId: async (discordId) => {
			calls.resolve.push(discordId)
			return KEY_ID
		},
		getBoostQuota: async (keyId) => {
			calls.quota.push(keyId)
			return { status: "ok", quota: okQuota }
		},
		getVariants: async (videoId) => {
			calls.variants.push(videoId)
			return { status: "ok", variants: VARIANTS }
		},
		linkPageUrl: "https://u.test/link",
		...overrides,
	}
	return { deps, calls }
}

const YTM_LINK = "https://music.youtube.com/watch?v=dQw4w9WgXcQ"

describe("parseVideoIdInput", () => {
	describe("happy paths", () => {
		it("pulls the id out of a YouTube Music watch link", () => {
			expect(parseVideoIdInput(YTM_LINK)).toBe("dQw4w9WgXcQ")
		})

		it("accepts a bare 11-character video id", () => {
			expect(parseVideoIdInput("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
		})

		it("trims surrounding whitespace", () => {
			expect(parseVideoIdInput("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ")
		})
	})

	describe("edge cases", () => {
		it("rejects a too-short id", () => {
			expect(parseVideoIdInput("abc")).toBeNull()
		})

		it("rejects free text that is not a link or id", () => {
			expect(parseVideoIdInput("some random song title")).toBeNull()
		})

		it("rejects the empty string", () => {
			expect(parseVideoIdInput("")).toBeNull()
		})
	})
})

describe("handleSeal unlinked", () => {
	it("shows the link flow and never calls unison when the user has no key", async () => {
		const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
		const { deps, calls } = commandDeps({ resolveKeyId: async () => null })
		await handleSeal(interaction, deps)
		expect(JSON.stringify(replies[0])).toContain("https://u.test/link")
		expect(ephemeral(replies[0]?.flags)).toBe(true)
		expect(calls.quota).toEqual([])
		expect(calls.variants).toEqual([])
	})
})

describe("handleSeal council gate", () => {
	it("refuses a linked non-council user and never lists variants", async () => {
		const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
		const { deps, calls } = commandDeps({
			getBoostQuota: async () => ({ status: "not_council" }),
		})
		await handleSeal(interaction, deps)
		expect(replies[0]?.content).toBe(sealNotCouncil)
		expect(calls.variants).toEqual([])
	})

	it("gates remove on council membership too", async () => {
		const { interaction, replies } = chatInteraction({ sub: "remove", video: YTM_LINK })
		const { deps, calls } = commandDeps({
			getBoostQuota: async () => ({ status: "not_council" }),
		})
		await handleSeal(interaction, deps)
		expect(replies[0]?.content).toBe(sealNotCouncil)
		expect(calls.variants).toEqual([])
	})

	it("shows a generic error when the quota lookup fails", async () => {
		const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
		const { deps } = commandDeps({ getBoostQuota: async () => ({ status: "error", code: 500 }) })
		await handleSeal(interaction, deps)
		expect(replies[0]?.content).toBe(sealError)
	})

	it("tells the user to relink when their key no longer resolves to a unison account", async () => {
		const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
		const { deps, calls } = commandDeps({ getBoostQuota: async () => ({ status: "unknown_user" }) })
		await handleSeal(interaction, deps)
		expect(replies[0]?.content).toBe(sealUnknownUser)
		expect(calls.variants).toEqual([])
	})
})

describe("handleSeal quota subcommand", () => {
	it("shows the quota card with used, remaining, and a reset timestamp", async () => {
		const { interaction, replies } = chatInteraction({ sub: "quota" })
		const { deps, calls } = commandDeps()
		await handleSeal(interaction, deps)
		const blob = JSON.stringify(replies[0])
		expect(blob).toContain("3 of 8 seals used this month")
		expect(blob).toContain("5 left")
		expect(blob).toContain("<t:1790000000:R>")
		expect(ephemeral(replies[0]?.flags)).toBe(true)
		expect(calls.variants).toEqual([])
	})

	it("refuses the quota subcommand for a non-council user", async () => {
		const { interaction, replies } = chatInteraction({ sub: "quota" })
		const { deps } = commandDeps({ getBoostQuota: async () => ({ status: "not_council" }) })
		await handleSeal(interaction, deps)
		expect(replies[0]?.content).toBe(sealNotCouncil)
	})
})

describe("handleSeal add", () => {
	describe("happy paths", () => {
		it("replies with the seal picker carrying a seal.pick menu and both variants", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
			const { deps, calls } = commandDeps()
			await handleSeal(interaction, deps)
			const blob = JSON.stringify(replies[0])
			expect(blob).toContain("seal.pick")
			expect(blob).toContain("Teardrop")
			expect(ephemeral(replies[0]?.flags)).toBe(true)
			expect(calls.variants).toEqual(["dQw4w9WgXcQ"])
		})

		it("accepts a bare video id as the target", async () => {
			const { interaction } = chatInteraction({ sub: "add", video: "dQw4w9WgXcQ" })
			const { deps, calls } = commandDeps()
			await handleSeal(interaction, deps)
			expect(calls.variants).toEqual(["dQw4w9WgXcQ"])
		})
	})

	describe("error paths", () => {
		it("short-circuits with the over-quota message and never lists variants when nothing is left", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
			const spent: BoostQuota = { quota: 4, used: 4, remaining: 0, resetsAt: 1_790_000_000 }
			const { deps, calls } = commandDeps({
				getBoostQuota: async () => ({ status: "ok", quota: spent }),
			})
			await handleSeal(interaction, deps)
			expect(replies[0]?.content).toBe(sealOverQuota)
			expect(calls.variants).toEqual([])
		})

		it("rejects an unparseable video reference", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: "not a link" })
			const { deps, calls } = commandDeps()
			await handleSeal(interaction, deps)
			expect(replies[0]?.content).toBe(sealBadVideo)
			expect(calls.variants).toEqual([])
		})

		it("reports when the video has no lyrics on record", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
			const { deps } = commandDeps({ getVariants: async () => ({ status: "not_found" }) })
			await handleSeal(interaction, deps)
			expect(replies[0]?.content).toBe(sealNoVariants)
		})

		it("reports no variants when the list comes back empty", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
			const { deps } = commandDeps({
				getVariants: async () => ({ status: "ok", variants: [] }),
			})
			await handleSeal(interaction, deps)
			expect(replies[0]?.content).toBe(sealNoVariants)
		})

		it("shows a generic error when the variant lookup fails", async () => {
			const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
			const failing: LyricsVariantsResult = { status: "error", code: 500 }
			const { deps } = commandDeps({ getVariants: async () => failing })
			await handleSeal(interaction, deps)
			expect(replies[0]?.content).toBe(sealError)
		})
	})
})

describe("handleSeal single variant", () => {
	const one: LyricVariant[] = [
		{
			id: 99,
			song: "Only Version",
			artist: "Someone",
			format: "ttml",
			score: 5,
			submitterName: "lone-fox",
		},
	]

	it("add: shows a confirm button instead of a dropdown when there is one variant", async () => {
		const { interaction, replies } = chatInteraction({ sub: "add", video: YTM_LINK })
		const { deps } = commandDeps({ getVariants: async () => ({ status: "ok", variants: one }) })
		await handleSeal(interaction, deps)
		const blob = JSON.stringify(replies[0])
		expect(blob).toContain(sealConfirmButtonLabel)
		expect(blob).toContain("seal.pick:99")
		expect(blob).toContain("Only Version")
	})

	it("remove: shows a lift-seal confirm button for a single variant", async () => {
		const { interaction, replies } = chatInteraction({ sub: "remove", video: YTM_LINK })
		const { deps } = commandDeps({ getVariants: async () => ({ status: "ok", variants: one }) })
		await handleSeal(interaction, deps)
		const blob = JSON.stringify(replies[0])
		expect(blob).toContain(unsealConfirmButtonLabel)
		expect(blob).toContain("seal.unpick:99")
	})
})

describe("handleSeal remove", () => {
	it("replies with the unseal picker carrying a seal.unpick menu", async () => {
		const { interaction, replies } = chatInteraction({ sub: "remove", video: YTM_LINK })
		const { deps } = commandDeps()
		await handleSeal(interaction, deps)
		expect(JSON.stringify(replies[0])).toContain("seal.unpick")
		expect(ephemeral(replies[0]?.flags)).toBe(true)
	})

	it("lists variants even when the member is out of monthly seals (removing is always allowed)", async () => {
		const { interaction, replies } = chatInteraction({ sub: "remove", video: YTM_LINK })
		const spent: BoostQuota = { quota: 4, used: 4, remaining: 0, resetsAt: 1_790_000_000 }
		const { deps, calls } = commandDeps({
			getBoostQuota: async () => ({ status: "ok", quota: spent }),
		})
		await handleSeal(interaction, deps)
		expect(JSON.stringify(replies[0])).toContain("seal.unpick")
		expect(calls.variants).toEqual(["dQw4w9WgXcQ"])
	})
})

function pickDeps(result: SealResult, overrides: Partial<SealPickDeps> = {}): SealPickDeps {
	return {
		resolveKeyId: async () => KEY_ID,
		boostLyrics: async () => result,
		linkPageUrl: "https://u.test/link",
		...overrides,
	}
}

describe("handleSealPick", () => {
	describe("happy paths", () => {
		it("seals the chosen variant and shows the updated quota", async () => {
			const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
			await handleSealPick(interaction, lyricsId, pickDeps({ status: "sealed", quota: okQuota }))
			const blob = JSON.stringify(updates[0])
			expect(blob).toContain(sealSuccessHeading)
			expect(blob).toContain("3 of 8 seals used this month")
			expect(blob).toContain("<t:1790000000:R>")
		})

		it("passes the chosen lyricsId and the resolved keyId to the boost call", async () => {
			const seen: { lyricsId?: string; keyId?: string } = {}
			const { interaction, lyricsId } = selectInteraction({ value: "22" })
			await handleSealPick(
				interaction,
				lyricsId,
				pickDeps(
					{ status: "sealed", quota: okQuota },
					{
						boostLyrics: async (id, keyId) => {
							seen.lyricsId = id
							seen.keyId = keyId
							return { status: "sealed", quota: okQuota }
						},
					}
				)
			)
			expect(seen).toEqual({ lyricsId: "22", keyId: KEY_ID })
		})
	})

	describe("error paths", () => {
		const cases: Array<[SealResult, string]> = [
			[{ status: "not_council" }, sealNotCouncil],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "self" }, sealSelf],
			[{ status: "target_council" }, sealTargetCouncil],
			[{ status: "over_quota" }, sealOverQuota],
			[{ status: "already_sealed" }, sealAlreadyActive],
			[{ status: "error", code: 500 }, sealError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
				await handleSealPick(interaction, lyricsId, pickDeps(result))
				expect(JSON.stringify(updates[0])).toContain(copy)
			})
		}

		it("shows the link flow when the user unlinked between steps", async () => {
			const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
			await handleSealPick(
				interaction,
				lyricsId,
				pickDeps({ status: "sealed", quota: okQuota }, { resolveKeyId: async () => null })
			)
			expect(JSON.stringify(updates[0])).toContain("https://u.test/link")
		})

		it("errors without calling boost when no variant was selected", async () => {
			let called = false
			const { interaction, updates, lyricsId } = selectInteraction({})
			await handleSealPick(
				interaction,
				lyricsId,
				pickDeps(
					{ status: "sealed", quota: okQuota },
					{
						boostLyrics: async () => {
							called = true
							return { status: "sealed", quota: okQuota }
						},
					}
				)
			)
			expect(called).toBe(false)
			expect(JSON.stringify(updates[0])).toContain(sealError)
		})
	})
})

function unpickDeps(result: UnsealResult, overrides: Partial<SealUnpickDeps> = {}): SealUnpickDeps {
	return {
		resolveKeyId: async () => KEY_ID,
		unboostLyrics: async () => result,
		linkPageUrl: "https://u.test/link",
		...overrides,
	}
}

describe("handleSealUnpick", () => {
	describe("happy paths", () => {
		it("lifts the seal and confirms it is off", async () => {
			const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
			await handleSealUnpick(interaction, lyricsId, unpickDeps({ status: "unsealed" }))
			expect(JSON.stringify(updates[0])).toContain(unsealSuccessHeading)
		})
	})

	describe("error paths", () => {
		const cases: Array<[UnsealResult, string]> = [
			[{ status: "not_owner" }, sealNotOwner],
			[{ status: "not_found" }, sealNotFound],
			[{ status: "not_council" }, sealNotCouncil],
			[{ status: "error", code: 500 }, sealError],
		]

		for (const [result, copy] of cases) {
			it(`maps ${result.status} to its message`, async () => {
				const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
				await handleSealUnpick(interaction, lyricsId, unpickDeps(result))
				expect(JSON.stringify(updates[0])).toContain(copy)
			})
		}

		it("shows the link flow when the user unlinked between steps", async () => {
			const { interaction, updates, lyricsId } = selectInteraction({ value: "21" })
			await handleSealUnpick(
				interaction,
				lyricsId,
				unpickDeps({ status: "unsealed" }, { resolveKeyId: async () => null })
			)
			expect(JSON.stringify(updates[0])).toContain("https://u.test/link")
		})
	})
})

describe("invariants", () => {
	it("never leaks the 64-char keyId into any reply or update payload", async () => {
		const chat = chatInteraction({ sub: "add", video: YTM_LINK })
		await handleSeal(chat.interaction, commandDeps().deps)
		expect(JSON.stringify(chat.replies)).not.toContain(KEY_ID)

		const pick = selectInteraction({ value: "21" })
		await handleSealPick(
			pick.interaction,
			pick.lyricsId,
			pickDeps({ status: "sealed", quota: okQuota })
		)
		expect(JSON.stringify(pick.updates)).not.toContain(KEY_ID)

		const quota = chatInteraction({ sub: "quota" })
		await handleSeal(quota.interaction, commandDeps().deps)
		expect(JSON.stringify(quota.replies)).not.toContain(KEY_ID)
	})
})
