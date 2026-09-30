import {
	modsApplyClosed,
	modsApplyIneligible,
	modsApplyNotPosted,
	modsApplyPosted,
	modsApplyUpdated,
	modsVoteAdded,
	modsVoteClosed,
	modsVoteGone,
	modsVoteIneligible,
	modsVoteRemoved,
	modsVoteSelf,
} from "@/copy/strings"
import { setGuildField } from "@/db/guild-config"
import {
	closeSession,
	getApplication,
	openSession,
	saveApplication,
	setSessionBoard,
} from "@/db/mod-sessions"
import {
	ACTIVE_MEMBER_ROLE,
	ADMIN,
	ALICE,
	ANSWERS,
	BOB,
	CARA,
	DAY_MS,
	DiscordDouble,
	GUILD,
	MODS_CHANNEL,
	MODS_ROLE,
	NOW,
	freshPool,
	makeDeps,
	text,
} from "@/discord/mods/__fixtures__/harness"
import { renderBoard, renderCard } from "@/discord/mods/round"
import type { ModalBuilder } from "discord.js"
import type { Pool } from "pg"
import { beforeEach, describe, expect, it } from "vitest"
import { handleModsApply, handleModsApplySubmit, handleModsSupport } from "./mods-apply"

const BOARD_MESSAGE = "1400000000000000999"

async function configure(pool: Pool) {
	await setGuildField(pool, GUILD, "modsChannel", MODS_CHANNEL)
	await setGuildField(pool, GUILD, "modsRole", MODS_ROLE)
	await setGuildField(pool, GUILD, "modsMinRole", ACTIVE_MEMBER_ROLE)
}

async function openRound(pool: Pool, id = "round-1") {
	await openSession(pool, {
		id,
		guildId: GUILD,
		openedBy: ADMIN,
		openedAt: NOW,
		closesAt: NOW + 7 * DAY_MS,
	})
	await setSessionBoard(pool, id, MODS_CHANNEL, BOARD_MESSAGE)
}

function commandInteraction(userId: string, guildId: string | null = GUILD) {
	const replies: unknown[] = []
	const modals: ModalBuilder[] = []
	return {
		replies,
		modals,
		interaction: {
			guildId,
			user: { id: userId },
			reply: async (payload: unknown) => {
				replies.push(payload)
			},
			showModal: async (modal: ModalBuilder) => {
				modals.push(modal)
			},
		},
	}
}

function submitInteraction(userId: string, values: Record<string, string>) {
	const edits: unknown[] = []
	let deferred = false
	return {
		edits,
		deferred: () => deferred,
		interaction: {
			user: { id: userId, username: "alice_lyrics", globalName: "Alice" as string | null },
			fields: { getTextInputValue: (id: string) => values[id] ?? "" },
			deferReply: async () => {
				deferred = true
			},
			editReply: async (payload: unknown) => {
				edits.push(payload)
			},
		},
	}
}

function answersAsFields(answers = ANSWERS): Record<string, string> {
	return {
		why: answers.why,
		hours: answers.hours,
		experience: answers.experience,
		scenario: answers.scenario,
		extra: answers.extra ?? "",
	}
}

function supportInteraction(userId: string) {
	const edits: unknown[] = []
	return {
		edits,
		interaction: {
			user: { id: userId },
			deferReply: async () => {},
			editReply: async (payload: unknown) => {
				edits.push(payload)
			},
		},
	}
}

function content(payload: unknown): string {
	return (payload as { content?: string }).content ?? ""
}

describe("mod applications, member side", () => {
	let pool: Pool
	let discord: DiscordDouble

	beforeEach(async () => {
		pool = await freshPool()
		discord = new DiscordDouble()
		await configure(pool)
	})

	describe("happy paths", () => {
		it("opens a blank application form for an eligible member", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			const { interaction, modals, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(replies).toEqual([])
			const json = modals[0]?.toJSON() as unknown as {
				custom_id: string
				components: { components: { value?: string }[] }[]
			}
			expect(json.custom_id).toBe("mods.apply.submit:round-1")
			expect(json.components[0]?.components[0]?.value).toBeUndefined()
		})

		it("posts a new application card, stores it, and refreshes the board", async () => {
			await openRound(pool)
			const { deps, refreshed, logs } = makeDeps(pool, discord)
			const { interaction, edits, deferred } = submitInteraction(ALICE, answersAsFields())
			await handleModsApplySubmit(interaction, "round-1", deps)
			expect(deferred()).toBe(true)
			expect(content(edits[0])).toBe(modsApplyPosted)
			expect(discord.posted).toHaveLength(1)
			expect(discord.posted[0]?.channelId).toBe(MODS_CHANNEL)
			expect(text(discord.posted[0]?.card)).toContain(ANSWERS.why)
			const saved = await getApplication(pool, "round-1", ALICE)
			expect(saved?.messageId).toBe(discord.posted[0]?.messageId)
			expect(saved?.displayName).toBe("Alice")
			expect(refreshed.boards).toEqual(["round-1"])
			expect(logs).toEqual([{ kind: "mods_applied", discordId: ALICE }])
		})

		it("toggles support and refreshes that card and the board", async () => {
			await openRound(pool)
			await saveApplication(pool, {
				sessionId: "round-1",
				discordId: ALICE,
				displayName: "Alice",
				answers: ANSWERS,
				submittedAt: NOW,
			})
			const { deps, refreshed } = makeDeps(pool, discord)
			const first = supportInteraction(BOB)
			await handleModsSupport(first.interaction, "round-1", ALICE, deps)
			expect(content(first.edits[0])).toBe(modsVoteAdded)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(1)
			const second = supportInteraction(BOB)
			await handleModsSupport(second.interaction, "round-1", ALICE, deps)
			expect(content(second.edits[0])).toBe(modsVoteRemoved)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(0)
			expect(refreshed.cards).toEqual([`round-1:${ALICE}`, `round-1:${ALICE}`])
			expect(refreshed.boards).toEqual(["round-1", "round-1"])
		})
	})

	describe("edge cases", () => {
		it("prefills the form when the member already applied", async () => {
			await openRound(pool)
			await saveApplication(pool, {
				sessionId: "round-1",
				discordId: ALICE,
				displayName: "Alice",
				answers: { ...ANSWERS, extra: "Night owl" },
				submittedAt: NOW,
			})
			const { deps } = makeDeps(pool, discord)
			const { interaction, modals } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(text(modals[0]?.toJSON())).toContain("Night owl")
		})

		it("edits the existing card on a resubmit instead of posting a second one", async () => {
			await openRound(pool)
			const { deps, refreshed, logs } = makeDeps(pool, discord)
			await handleModsApplySubmit(
				submitInteraction(ALICE, answersAsFields()).interaction,
				"round-1",
				deps
			)
			const edit = submitInteraction(ALICE, answersAsFields({ ...ANSWERS, extra: "Night owl" }))
			await handleModsApplySubmit(edit.interaction, "round-1", deps)
			expect(content(edit.edits[0])).toBe(modsApplyUpdated)
			expect(discord.posted).toHaveLength(1)
			const messageId = discord.posted[0]?.messageId ?? ""
			expect(text(discord.lastEditOf(messageId))).toContain("Night owl")
			expect(refreshed.boards).toEqual(["round-1"])
			expect(logs).toHaveLength(1)
		})

		it("falls back to the username when the member has no display name", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			const submit = submitInteraction(ALICE, answersAsFields())
			submit.interaction.user.globalName = null
			await handleModsApplySubmit(submit.interaction, "round-1", deps)
			expect((await getApplication(pool, "round-1", ALICE))?.displayName).toBe("alice_lyrics")
		})
	})

	describe("error paths", () => {
		it("refuses outside a server", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, modals, replies } = commandInteraction(ALICE, null)
			await handleModsApply(interaction, deps)
			expect(modals).toEqual([])
			expect(content(replies[0])).toContain("server")
		})

		it("says applications are closed when no round is running", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, modals, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(modals).toEqual([])
			expect(content(replies[0])).toBe(modsApplyClosed)
		})

		it("says applications are closed once the close time passes", async () => {
			await openRound(pool)
			const { deps, clock } = makeDeps(pool, discord)
			clock.now = NOW + 7 * DAY_MS
			const { interaction, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(content(replies[0])).toBe(modsApplyClosed)
		})

		it("turns away a member below Active Member", async () => {
			await openRound(pool)
			discord.eligible.delete(ALICE)
			const { deps } = makeDeps(pool, discord)
			const { interaction, modals, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(modals).toEqual([])
			expect(content(replies[0])).toBe(modsApplyIneligible)
		})

		it("turns everyone away when the minimum role is not configured", async () => {
			await openRound(pool)
			await setGuildField(pool, GUILD, "modsMinRole", null)
			const { deps } = makeDeps(pool, discord)
			const { interaction, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect(content(replies[0])).toBe(modsApplyIneligible)
		})

		it("regression: a form submitted after voting closed is refused and not saved", async () => {
			await openRound(pool)
			const { deps, clock } = makeDeps(pool, discord)
			clock.now = NOW + 7 * DAY_MS + 1
			const submit = submitInteraction(ALICE, answersAsFields())
			await handleModsApplySubmit(submit.interaction, "round-1", deps)
			expect(content(submit.edits[0])).toBe(modsApplyClosed)
			expect(await getApplication(pool, "round-1", ALICE)).toBeNull()
			expect(discord.posted).toEqual([])
		})

		it("keeps the answers and says so when the card cannot be posted", async () => {
			await openRound(pool)
			discord.failPost = true
			const { deps, refreshed } = makeDeps(pool, discord)
			const submit = submitInteraction(ALICE, answersAsFields())
			await handleModsApplySubmit(submit.interaction, "round-1", deps)
			expect(content(submit.edits[0])).toBe(modsApplyNotPosted)
			expect((await getApplication(pool, "round-1", ALICE))?.answers).toEqual(ANSWERS)
			expect(refreshed.boards).toEqual([])
		})

		it("regression: a resubmit after a failed post tries posting again", async () => {
			await openRound(pool)
			discord.failPost = true
			const { deps } = makeDeps(pool, discord)
			await handleModsApplySubmit(
				submitInteraction(ALICE, answersAsFields()).interaction,
				"round-1",
				deps
			)
			discord.failPost = false
			const retry = submitInteraction(ALICE, answersAsFields())
			await handleModsApplySubmit(retry.interaction, "round-1", deps)
			expect(content(retry.edits[0])).toBe(modsApplyPosted)
			expect(discord.posted).toHaveLength(1)
		})

		it("refuses a vote after the close time", async () => {
			await openRound(pool)
			await saveApplication(pool, {
				sessionId: "round-1",
				discordId: ALICE,
				displayName: "Alice",
				answers: ANSWERS,
				submittedAt: NOW,
			})
			const { deps, clock, refreshed } = makeDeps(pool, discord)
			clock.now = NOW + 7 * DAY_MS
			const vote = supportInteraction(BOB)
			await handleModsSupport(vote.interaction, "round-1", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteClosed)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(0)
			expect(refreshed.boards).toEqual([])
		})

		it("refuses a vote on a closed round", async () => {
			await openRound(pool)
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			const vote = supportInteraction(BOB)
			await handleModsSupport(vote.interaction, "round-1", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteClosed)
		})

		it("refuses a vote for your own application", async () => {
			await openRound(pool)
			await saveApplication(pool, {
				sessionId: "round-1",
				discordId: ALICE,
				displayName: "Alice",
				answers: ANSWERS,
				submittedAt: NOW,
			})
			const { deps } = makeDeps(pool, discord)
			const vote = supportInteraction(ALICE)
			await handleModsSupport(vote.interaction, "round-1", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteSelf)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(0)
		})

		it("refuses a vote from a member below Active Member", async () => {
			await openRound(pool)
			await saveApplication(pool, {
				sessionId: "round-1",
				discordId: ALICE,
				displayName: "Alice",
				answers: ANSWERS,
				submittedAt: NOW,
			})
			discord.eligible.delete(CARA)
			const { deps } = makeDeps(pool, discord)
			const vote = supportInteraction(CARA)
			await handleModsSupport(vote.interaction, "round-1", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteIneligible)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(0)
		})

		it("refuses a vote for an application that no longer exists", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			const vote = supportInteraction(BOB)
			await handleModsSupport(vote.interaction, "round-1", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteGone)
		})

		it("refuses a vote for an unknown round", async () => {
			const { deps } = makeDeps(pool, discord)
			const vote = supportInteraction(BOB)
			await handleModsSupport(vote.interaction, "missing", ALICE, deps)
			expect(content(vote.edits[0])).toBe(modsVoteClosed)
		})
	})

	describe("invariants", () => {
		it("keeps every reply private to the member", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, replies } = commandInteraction(ALICE)
			await handleModsApply(interaction, deps)
			expect((replies[0] as { flags: number }).flags & 64).toBe(64)
		})

		it("never shows who voted on the public card or board", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			await handleModsApplySubmit(
				submitInteraction(ALICE, answersAsFields()).interaction,
				"round-1",
				deps
			)
			await handleModsSupport(supportInteraction(BOB).interaction, "round-1", ALICE, deps)
			await renderCard(deps, "round-1", ALICE)
			await renderBoard(deps, "round-1")
			expect(discord.edits.length).toBeGreaterThanOrEqual(2)
			for (const message of [...discord.posted, ...discord.edits]) {
				expect(text(message.card)).not.toContain(BOB)
			}
		})
	})
})
