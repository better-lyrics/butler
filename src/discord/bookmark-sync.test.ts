import type { BookmarkItemType, CouncilBookmark } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { applyBookmarkEdits, bookmarkLookup, planBookmarkEdits } from "./bookmark-sync"

function bookmark(itemType: BookmarkItemType, itemId: number, over: Partial<CouncilBookmark> = {}) {
	return {
		itemType,
		itemId,
		holder: { displayName: "boidu", discordId: "111" },
		expiresAt: 1_790_259_200,
		...over,
	}
}

function row(id: number, over: { state?: string; bookmark?: CouncilBookmark | null } = {}) {
	return { id, state: over.state ?? "pending", bookmark: over.bookmark ?? null }
}

describe("bookmarkLookup", () => {
	it("finds a bookmark by item type and id", () => {
		const find = bookmarkLookup([bookmark("seal", 1), bookmark("edit", 2)])
		expect(find("seal", 1)?.itemId).toBe(1)
		expect(find("edit", 2)?.itemId).toBe(2)
	})

	describe("edge cases", () => {
		it("does not confuse a lyric and a revision with the same id", () => {
			const find = bookmarkLookup([bookmark("edit", 7)])
			expect(find("seal", 7)).toBeNull()
		})

		it("returns null for no bookmarks", () => {
			expect(bookmarkLookup([])("seal", 1)).toBeNull()
		})
	})
})

describe("planBookmarkEdits", () => {
	const desired = (bookmarks: CouncilBookmark[]) => {
		const find = bookmarkLookup(bookmarks)
		return (r: { id: number }) => find("seal", r.id)
	}

	it("edits a card that gains a bookmark", () => {
		const b = bookmark("seal", 1)
		expect(planBookmarkEdits([row(1)], desired([b]))).toEqual([{ row: row(1), bookmark: b }])
	})

	it("edits a card whose bookmark was released", () => {
		const shown = row(1, { bookmark: bookmark("seal", 1) })
		expect(planBookmarkEdits([shown], desired([]))).toEqual([{ row: shown, bookmark: null }])
	})

	it("edits a card when the holder or the expiry changes", () => {
		const shown = row(1, { bookmark: bookmark("seal", 1) })
		const otherHolder = bookmark("seal", 1, { holder: { displayName: "ola", discordId: "222" } })
		const later = bookmark("seal", 1, { expiresAt: 1_790_300_000 })
		expect(planBookmarkEdits([shown], desired([otherHolder]))).toHaveLength(1)
		expect(planBookmarkEdits([shown], desired([later]))).toHaveLength(1)
	})

	describe("invariants", () => {
		it("leaves a card alone when it already shows the current bookmark", () => {
			const b = bookmark("seal", 1)
			expect(planBookmarkEdits([row(1, { bookmark: b })], desired([{ ...b }]))).toEqual([])
		})

		it("never touches a decided card", () => {
			const sealed = row(1, { state: "sealed" })
			expect(planBookmarkEdits([sealed], desired([bookmark("seal", 1)]))).toEqual([])
		})

		it("is empty for no cards", () => {
			expect(planBookmarkEdits([], desired([bookmark("seal", 1)]))).toEqual([])
		})
	})
})

describe("applyBookmarkEdits", () => {
	type Card = { id: number; state: string; messageId: string; bookmark: CouncilBookmark | null }
	const b = bookmark("seal", 1)
	const card = (over: Partial<Card> = {}): Card => ({
		id: 1,
		state: "pending",
		messageId: "m1",
		bookmark: null,
		...over,
	})

	function harness(opts: {
		before?: Card | null
		after?: Card | null
		edited?: boolean
	}) {
		const log: string[] = []
		let reads = 0
		return {
			log,
			deps: {
				current: async () => {
					reads += 1
					const value = reads === 1 ? opts.before : opts.after
					return value === undefined ? card() : value
				},
				edit: async (_: Card, shown: CouncilBookmark | null) => {
					log.push(`edit ${shown ? "bookmark" : "none"}`)
					return opts.edited ?? true
				},
				redraw: async (row: Card) => {
					log.push(`redraw ${row.state}`)
				},
				store: async (_: Card, shown: CouncilBookmark | null) => {
					log.push(`store ${shown ? "bookmark" : "none"}`)
				},
			},
		}
	}

	it("edits the card and records what it now shows", async () => {
		const { log, deps } = harness({})
		await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
		expect(log).toEqual(["edit bookmark", "store bookmark"])
	})

	describe("regressions", () => {
		it("does not record a bookmark the card failed to show, so the next sync retries", async () => {
			const { log, deps } = harness({ edited: false })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual(["edit bookmark"])
		})

		it("skips a card decided before the edit", async () => {
			const { log, deps } = harness({ before: card({ state: "sealed" }) })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual([])
		})

		it("redraws a card decided during the edit, so it never keeps live buttons", async () => {
			const { log, deps } = harness({ after: card({ state: "rejected" }) })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual(["edit bookmark", "redraw rejected"])
		})

		it("leaves a card alone once the board was reposted", async () => {
			const { log, deps } = harness({ before: card({ messageId: "m2" }) })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual([])
		})

		it("does not record onto a reposted card after the edit", async () => {
			const { log, deps } = harness({ after: card({ messageId: "m2" }) })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual(["edit bookmark"])
		})

		it("skips a card that is gone", async () => {
			const { log, deps } = harness({ before: null })
			await applyBookmarkEdits([{ row: card(), bookmark: b }], deps)
			expect(log).toEqual([])
		})
	})

	describe("edge cases", () => {
		it("does nothing for no edits", async () => {
			const { log, deps } = harness({})
			await applyBookmarkEdits([], deps)
			expect(log).toEqual([])
		})

		it("records a cleared bookmark", async () => {
			const { log, deps } = harness({})
			await applyBookmarkEdits([{ row: card({ bookmark: b }), bookmark: null }], deps)
			expect(log).toEqual(["edit none", "store none"])
		})
	})
})
