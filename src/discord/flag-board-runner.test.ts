import { flagKept, flagRemoveButtonLabel, flagRemoved, flagResolved } from "@/copy/strings"
import { getFlagBoardRow, markFlagDecided, recordFlagPost } from "@/db/flag-board"
import { applySchema } from "@/db/pool"
import { flagCase } from "@/unison/__fixtures__/flag"
import type { FlagCard, FlagsResult } from "@/unison/client"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import type { CardPayload } from "./components/connect-card"
import { type FlagBoardRunnerDeps, createFlagBoardRunner } from "./flag-board-runner"

interface Node {
	type?: number
	content?: string
	label?: string
	components?: Node[]
}

function texts(payload: CardPayload): string {
	const out: string[] = []
	const walk = (n: Node) => {
		if (n.type === 10) out.push(n.content ?? "")
		if (n.type === 2) out.push(`[${n.label ?? ""}]`)
		for (const c of n.components ?? []) walk(c)
	}
	for (const c of payload.components) walk(c.toJSON() as Node)
	return out.join("\n")
}

const isOpenCard = (payload: CardPayload) => texts(payload).includes(`[${flagRemoveButtonLabel}]`)

interface Edit {
	messageId: string
	payload: CardPayload
}

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function harness(pool: Pool, opts: { flags?: FlagsResult; channelId?: string | null } = {}) {
	const edits: Edit[] = []
	const posts: CardPayload[] = []
	const state = {
		flags: opts.flags ?? ({ status: "ok", needed: 3, cards: [] } as FlagsResult),
		editResult: true as boolean | (() => Promise<boolean>),
		postResult: "m-new" as string | null,
		getFlagsCalls: 0,
	}
	const deps: FlagBoardRunnerDeps = {
		pool,
		guildId: "g1",
		unison: {
			getFlags: async () => {
				state.getFlagsCalls++
				return state.flags
			},
		},
		councilChannelId: async () => (opts.channelId === undefined ? "c1" : opts.channelId),
		editBoardMessage: async (_channelId, messageId, payload) => {
			const result =
				typeof state.editResult === "function" ? await state.editResult() : state.editResult
			if (result) edits.push({ messageId, payload })
			return result
		},
		postToChannel: async (channelId, payload) => {
			posts.push(payload)
			return state.postResult === null ? null : { channelId, messageId: state.postResult }
		},
	}
	return { runner: createFlagBoardRunner(deps), edits, posts, state }
}

async function track(pool: Pool, card: FlagCard = flagCase()) {
	await recordFlagPost(pool, "g1", {
		caseId: String(card.id),
		messageId: `m-${card.id}`,
		channelId: "c1",
		card,
	})
}

const ok = (cards: FlagCard[], needed = 3): FlagsResult => ({ status: "ok", needed, cards })

describe("flag board runner", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("sync happy paths", () => {
		it("posts a new open case and records it", async () => {
			const { runner, posts } = harness(pool, { flags: ok([flagCase()]) })
			await runner.sync()
			expect(posts).toHaveLength(1)
			expect(isOpenCard(posts[0] as CardPayload)).toBe(true)
			expect(await getFlagBoardRow(pool, "g1", "77")).toMatchObject({
				messageId: "m-new",
				channelId: "c1",
				state: "pending",
			})
		})

		it("redraws a card whose tally changed and stores the new card", async () => {
			await track(pool)
			const newer = flagCase({ removals: 2, keeps: 1 })
			const { runner, edits } = harness(pool, { flags: ok([newer]) })
			await runner.sync()
			expect(edits.map((e) => e.messageId)).toEqual(["m-77"])
			expect(texts((edits[0] as Edit).payload)).toContain("Remove 2/3 · Keep 1")
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(newer)
		})

		it("resolves a case decided elsewhere and marks the row", async () => {
			await track(pool)
			const kept = flagCase({ status: "kept", keeps: 3 })
			const { runner, edits } = harness(pool, { flags: ok([kept]) })
			await runner.sync()
			expect(texts((edits[0] as Edit).payload)).toContain(flagKept)
			expect(await getFlagBoardRow(pool, "g1", "77")).toMatchObject({ state: "kept", card: kept })
		})

		it("resolves and forgets a case that is gone", async () => {
			await track(pool)
			const { runner, edits } = harness(pool, { flags: ok([]) })
			await runner.sync()
			expect(texts((edits[0] as Edit).payload)).toContain(flagResolved)
			expect(await getFlagBoardRow(pool, "g1", "77")).toBeNull()
		})
	})

	describe("sync edge cases", () => {
		it("does nothing without a council channel", async () => {
			const { runner, posts, state } = harness(pool, { flags: ok([flagCase()]), channelId: null })
			await runner.sync()
			expect(state.getFlagsCalls).toBe(0)
			expect(posts).toEqual([])
		})

		it("does nothing when the flag list fails", async () => {
			await track(pool)
			const { runner, edits, posts } = harness(pool, { flags: { status: "error", code: 500 } })
			await runner.sync()
			expect(edits).toEqual([])
			expect(posts).toEqual([])
			expect(await getFlagBoardRow(pool, "g1", "77")).not.toBeNull()
		})
	})

	describe("sync error paths", () => {
		it("skips recording a card whose post failed", async () => {
			const { runner, state } = harness(pool, { flags: ok([flagCase()]) })
			state.postResult = null
			await runner.sync()
			expect(await getFlagBoardRow(pool, "g1", "77")).toBeNull()
		})

		it("keeps the old card when a tally redraw fails so the next sync retries", async () => {
			await track(pool)
			const { runner, state } = harness(pool, { flags: ok([flagCase({ removals: 2 })]) })
			state.editResult = false
			await runner.sync()
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(flagCase())
		})

		it("leaves the row pending when the outcome edit fails", async () => {
			await track(pool)
			const { runner, state } = harness(pool, { flags: ok([flagCase({ status: "removed" })]) })
			state.editResult = false
			await runner.sync()
			expect((await getFlagBoardRow(pool, "g1", "77"))?.state).toBe("pending")
		})

		it("keeps tracking a gone case whose outcome edit failed", async () => {
			await track(pool)
			const { runner, state } = harness(pool, { flags: ok([]) })
			state.editResult = false
			await runner.sync()
			expect(await getFlagBoardRow(pool, "g1", "77")).not.toBeNull()
		})
	})

	describe("refresh", () => {
		it("redraws a pending card from the stored card and the vote tally without calling Unison", async () => {
			await track(pool)
			const { runner, edits, state } = harness(pool)
			await runner.refresh("77", { removals: 2, keeps: 1, needed: 4 })
			expect(state.getFlagsCalls).toBe(0)
			expect(texts((edits[0] as Edit).payload)).toContain("Remove 2/4 · Keep 1")
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toMatchObject({
				removals: 2,
				keeps: 1,
			})
		})

		it("does not redraw a decided row", async () => {
			await track(pool)
			await markFlagDecided(pool, "g1", "77", { state: "removed", card: null })
			const { runner, edits } = harness(pool)
			await runner.refresh("77", { removals: 2, keeps: 1, needed: 3 })
			expect(edits).toEqual([])
		})

		it("does nothing for an untracked case", async () => {
			const { runner, edits } = harness(pool)
			await runner.refresh("404", { removals: 2, keeps: 1, needed: 3 })
			expect(edits).toEqual([])
		})

		it("keeps the old card when the redraw fails", async () => {
			await track(pool)
			const { runner, state } = harness(pool)
			state.editResult = false
			await runner.refresh("77", { removals: 2, keeps: 1, needed: 3 })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(flagCase())
		})
	})

	describe("resolve", () => {
		it("edits the outcome card and then marks the row decided with the vote tally", async () => {
			await track(pool)
			const { runner, edits, state } = harness(pool)
			await runner.resolve("77", { kind: "removed" }, { removals: 3, keeps: 0, needed: 3 })
			expect(state.getFlagsCalls).toBe(0)
			expect(texts((edits[0] as Edit).payload)).toContain(flagRemoved)
			expect(isOpenCard((edits[0] as Edit).payload)).toBe(false)
			expect(await getFlagBoardRow(pool, "g1", "77")).toMatchObject({
				state: "removed",
				card: { status: "removed", removals: 3, keeps: 0 },
			})
		})

		it("leaves the row pending when the edit fails so the next sync resolves it", async () => {
			await track(pool)
			const { runner, state } = harness(pool)
			state.editResult = false
			await runner.resolve("77", { kind: "kept" }, { removals: 0, keeps: 3, needed: 3 })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.state).toBe("pending")
		})

		it("does nothing for an untracked case", async () => {
			const { runner, edits } = harness(pool)
			await runner.resolve("404", { kind: "kept" }, { removals: 0, keeps: 3, needed: 3 })
			expect(edits).toEqual([])
		})
	})

	describe("invariants", () => {
		it("a sync racing a button decision never redraws the decided card as open", async () => {
			await track(pool)
			const h = harness(pool, { flags: ok([flagCase({ removals: 2 })]) })
			let release: (value: boolean) => void = () => {}
			h.state.editResult = () =>
				new Promise<boolean>((resolve) => {
					release = resolve
				})
			const resolving = h.runner.resolve(
				"77",
				{ kind: "removed" },
				{ removals: 3, keeps: 0, needed: 3 }
			)
			await new Promise((r) => setTimeout(r, 20))
			const syncing = h.runner.sync()
			await new Promise((r) => setTimeout(r, 20))
			h.state.editResult = true
			release(true)
			await Promise.all([resolving, syncing])
			expect(h.edits.map((e) => isOpenCard(e.payload))).toEqual([false])
			expect((await getFlagBoardRow(pool, "g1", "77"))?.state).toBe("removed")
		})

		it("a refresh racing a button decision never redraws the decided card as open", async () => {
			await track(pool)
			const h = harness(pool)
			let release: (value: boolean) => void = () => {}
			h.state.editResult = () =>
				new Promise<boolean>((resolve) => {
					release = resolve
				})
			const resolving = h.runner.resolve(
				"77",
				{ kind: "kept" },
				{ removals: 0, keeps: 3, needed: 3 }
			)
			await new Promise((r) => setTimeout(r, 20))
			const refreshing = h.runner.refresh("77", { removals: 1, keeps: 2, needed: 3 })
			await new Promise((r) => setTimeout(r, 20))
			h.state.editResult = true
			release(true)
			await Promise.all([resolving, refreshing])
			expect(h.edits.map((e) => isOpenCard(e.payload))).toEqual([false])
		})

		it("treats a throwing edit as failed and does not block later work on the case", async () => {
			await track(pool)
			const h = harness(pool)
			h.state.editResult = async () => {
				throw new Error("discord down")
			}
			await h.runner.refresh("77", { removals: 1, keeps: 0, needed: 3 })
			expect((await getFlagBoardRow(pool, "g1", "77"))?.card).toEqual(flagCase())
			h.state.editResult = true
			await h.runner.refresh("77", { removals: 2, keeps: 0, needed: 3 })
			expect(h.edits).toHaveLength(1)
		})
	})
})
