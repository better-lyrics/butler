import {
	closeSession,
	getSession,
	openSession,
	saveApplication,
	setApplicationCard,
	setSessionBoard,
} from "@/db/mod-sessions"
import type { Pool } from "pg"
import { beforeEach, describe, expect, it } from "vitest"
import {
	ADMIN,
	ALICE,
	ANSWERS,
	BOB,
	DAY_MS,
	DiscordDouble,
	GUILD,
	MODS_CHANNEL,
	NOW,
	freshPool,
	makeDeps,
	text,
} from "./__fixtures__/harness"
import { closeRound, renderBoard, renderCard } from "./round"

const BOARD = "1400000000000000999"
const ALICE_CARD = "1400000000000000101"
const CLOSES_AT = NOW + 7 * DAY_MS

async function seed(pool: Pool, opts: { board?: boolean; card?: boolean } = {}) {
	const session = await openSession(pool, {
		id: "round-1",
		guildId: GUILD,
		openedBy: ADMIN,
		openedAt: NOW,
		closesAt: CLOSES_AT,
	})
	if (opts.board ?? true) await setSessionBoard(pool, "round-1", MODS_CHANNEL, BOARD)
	await saveApplication(pool, {
		sessionId: "round-1",
		discordId: ALICE,
		displayName: "Alice",
		answers: ANSWERS,
		submittedAt: NOW,
	})
	if (opts.card ?? true) await setApplicationCard(pool, "round-1", ALICE, MODS_CHANNEL, ALICE_CARD)
	if (!session) throw new Error("seed failed")
	return session
}

describe("mod round rendering", () => {
	let pool: Pool
	let discord: DiscordDouble

	beforeEach(async () => {
		pool = await freshPool()
		discord = new DiscordDouble()
	})

	describe("happy paths", () => {
		it("renders the board with every applicant", async () => {
			await seed(pool)
			const { deps } = makeDeps(pool, discord)
			await renderBoard(deps, "round-1")
			expect(text(discord.lastEditOf(BOARD))).toContain(`<@${ALICE}>`)
		})

		it("renders an open card with its support button", async () => {
			await seed(pool)
			const { deps } = makeDeps(pool, discord)
			await renderCard(deps, "round-1", ALICE)
			expect(text(discord.lastEditOf(ALICE_CARD))).toContain(`mods.support:round-1:${ALICE}`)
		})
	})

	describe("edge cases", () => {
		it("skips the board edit when the board was never posted", async () => {
			await seed(pool, { board: false })
			const { deps } = makeDeps(pool, discord)
			await renderBoard(deps, "round-1")
			expect(discord.edits).toEqual([])
		})

		it("skips the card edit when the card was never posted", async () => {
			await seed(pool, { card: false })
			const { deps } = makeDeps(pool, discord)
			await renderCard(deps, "round-1", ALICE)
			expect(discord.edits).toEqual([])
		})

		it("renders cards as closed once the close time passes, before the round is closed", async () => {
			await seed(pool)
			const { deps, clock } = makeDeps(pool, discord)
			clock.now = CLOSES_AT
			await renderCard(deps, "round-1", ALICE)
			expect(text(discord.lastEditOf(ALICE_CARD))).not.toContain("mods.support")
		})
	})

	describe("error paths", () => {
		it("does nothing for an unknown round", async () => {
			const { deps } = makeDeps(pool, discord)
			await renderBoard(deps, "missing")
			await renderCard(deps, "missing", ALICE)
			expect(discord.edits).toEqual([])
		})

		it("does nothing for an applicant who never applied", async () => {
			await seed(pool)
			const { deps } = makeDeps(pool, discord)
			await renderCard(deps, "round-1", BOB)
			expect(discord.edits).toEqual([])
		})

		it("refuses to close a round twice", async () => {
			const session = await seed(pool)
			const { deps, logs } = makeDeps(pool, discord)
			expect(await closeRound(deps, session)).toBe(true)
			expect(await closeRound(deps, session)).toBe(false)
			expect(logs).toHaveLength(1)
		})
	})

	describe("invariants", () => {
		it("a late refresh after close still renders the closed state", async () => {
			const session = await seed(pool)
			const { deps } = makeDeps(pool, discord)
			await closeRound(deps, session)
			await renderCard(deps, "round-1", ALICE)
			await renderBoard(deps, "round-1")
			expect(text(discord.lastEditOf(ALICE_CARD))).not.toContain("mods.support")
			expect(text(discord.lastEditOf(BOARD))).toContain("Mod applications are closed")
		})
	})

	describe("cross-field interactions", () => {
		it("closing moves the round state and freezes both the card and the board together", async () => {
			const session = await seed(pool)
			const { deps } = makeDeps(pool, discord)
			await closeRound(deps, session)
			expect((await getSession(pool, "round-1"))?.state).toBe("closed")
			expect(discord.edits.map((e) => e.messageId).sort()).toEqual([ALICE_CARD, BOARD].sort())
		})

		it("a closed round skips the close pass for the same state", async () => {
			const session = await seed(pool)
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			expect(await closeRound(deps, session)).toBe(false)
			expect(discord.edits).toEqual([])
		})
	})
})
