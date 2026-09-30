import {
	configNoPermission,
	modsClosed,
	modsNothingOpen,
	modsOpenAlready,
	modsOpenFailed,
	modsPickAlreadyDone,
	modsPickNotClosed,
	modsPickNothing,
	modsResultNotSelectedBody,
	modsResultSelectedBody,
} from "@/copy/strings"
import { setGuildField } from "@/db/guild-config"
import {
	closeSession,
	finalizeSession,
	getActiveSession,
	getApplication,
	getSession,
	openSession,
	saveApplication,
	setApplicationCard,
	setPicks,
	setSessionBoard,
	toggleSupport,
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
import { closeExpiredRounds } from "@/discord/mods/round"
import { MessageFlags } from "discord.js"
import type { Pool } from "pg"
import { beforeEach, describe, expect, it } from "vitest"
import {
	handleMods,
	handleModsPickBack,
	handleModsPickGo,
	handleModsPickReview,
	handleModsPickSelect,
	modsCommand,
} from "./mods"

const BOARD_MESSAGE = "1400000000000000999"
const CLOSES_AT = NOW + 7 * DAY_MS

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
		closesAt: CLOSES_AT,
	})
	await setSessionBoard(pool, id, MODS_CHANNEL, BOARD_MESSAGE)
}

async function addApplicant(
	pool: Pool,
	discordId: string,
	cardMessageId: string,
	sessionId = "round-1"
) {
	await saveApplication(pool, {
		sessionId,
		discordId,
		displayName: `user-${discordId.slice(-4)}`,
		answers: ANSWERS,
		submittedAt: NOW + Number(cardMessageId.slice(-2)),
	})
	await setApplicationCard(pool, sessionId, discordId, MODS_CHANNEL, cardMessageId)
}

function command(
	sub: string,
	opts: { days?: number; admin?: boolean; guildId?: string | null } = {}
) {
	const replies: unknown[] = []
	const edits: unknown[] = []
	return {
		replies,
		edits,
		interaction: {
			guildId: opts.guildId === undefined ? GUILD : opts.guildId,
			user: { id: ADMIN },
			memberPermissions: { has: () => opts.admin ?? true },
			options: {
				getSubcommand: () => sub,
				getInteger: () => opts.days ?? 7,
			},
			reply: async (payload: unknown) => {
				replies.push(payload)
			},
			deferReply: async () => {},
			editReply: async (payload: unknown) => {
				edits.push(payload)
			},
		},
	}
}

function component(opts: { admin?: boolean; values?: string[] } = {}) {
	const updates: unknown[] = []
	const edits: unknown[] = []
	const replies: unknown[] = []
	return {
		updates,
		edits,
		replies,
		interaction: {
			user: { id: ADMIN },
			memberPermissions: { has: () => opts.admin ?? true },
			values: opts.values ?? [],
			update: async (payload: unknown) => {
				updates.push(payload)
			},
			reply: async (payload: unknown) => {
				replies.push(payload)
			},
			deferUpdate: async () => {},
			editReply: async (payload: unknown) => {
				edits.push(payload)
			},
		},
	}
}

function content(payload: unknown): string {
	return (payload as { content?: string }).content ?? ""
}

describe("/mods command definition", () => {
	it("is admin-only with open, close, and pick", () => {
		const json = modsCommand.toJSON()
		expect(json.default_member_permissions).toBe("32")
		expect(json.options?.map((o) => o.name)).toEqual(["open", "close", "pick"])
	})

	it("bounds the round length to between 1 and 30 days", () => {
		const open = modsCommand.toJSON().options?.[0] as unknown as {
			options: { name: string; min_value: number; max_value: number; required: boolean }[]
		}
		expect(open.options[0]).toMatchObject({
			name: "days",
			min_value: 1,
			max_value: 30,
			required: true,
		})
	})
})

describe("mod applications, admin side", () => {
	let pool: Pool
	let discord: DiscordDouble

	beforeEach(async () => {
		pool = await freshPool()
		discord = new DiscordDouble()
		await configure(pool)
	})

	describe("happy paths", () => {
		it("opens a round, posts the board, and logs it", async () => {
			const { deps, logs } = makeDeps(pool, discord)
			const { interaction, edits } = command("open", { days: 7 })
			await handleMods(interaction, deps)
			const session = await getActiveSession(pool, GUILD)
			expect(session).toMatchObject({ id: "round-1", state: "open", closesAt: CLOSES_AT })
			expect(discord.posted).toHaveLength(1)
			expect(session?.boardChannelId).toBe(MODS_CHANNEL)
			expect(session?.boardMessageId).toBe(discord.posted[0]?.messageId)
			expect(content(edits[0])).toContain(`<t:${CLOSES_AT / 1000}:R>`)
			expect(logs).toEqual([{ kind: "mods_opened", discordId: ADMIN, closesAt: CLOSES_AT }])
		})

		it("closes a round: drops every support button and freezes the board", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await addApplicant(pool, BOB, "1400000000000000102")
			const { deps, logs } = makeDeps(pool, discord)
			const { interaction, edits } = command("close")
			await handleMods(interaction, deps)
			expect(content(edits[0])).toBe(modsClosed)
			expect((await getSession(pool, "round-1"))?.state).toBe("closed")
			for (const id of ["1400000000000000101", "1400000000000000102"]) {
				expect(text(discord.lastEditOf(id))).not.toContain("mods.support")
			}
			expect(text(discord.lastEditOf(BOARD_MESSAGE))).toContain("Mod applications are closed")
			expect(logs).toEqual([{ kind: "mods_closed", applicants: 2 }])
		})

		it("walks pick, select, review, and confirm to grant roles and DM everyone", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await addApplicant(pool, BOB, "1400000000000000102")
			await addApplicant(pool, CARA, "1400000000000000103")
			await closeSession(pool, "round-1")
			const { deps, logs } = makeDeps(pool, discord)

			const pick = command("pick")
			await handleMods(pick.interaction, deps)
			expect(text(pick.replies[0])).toContain("mods.pick.select:round-1")
			expect((pick.replies[0] as { flags: number }).flags & MessageFlags.Ephemeral).toBe(
				MessageFlags.Ephemeral
			)

			const select = component({ values: [ALICE, CARA] })
			await handleModsPickSelect(select.interaction, "round-1", 0, deps)
			expect((await getApplication(pool, "round-1", ALICE))?.picked).toBe(true)
			expect((await getApplication(pool, "round-1", BOB))?.picked).toBe(false)

			const review = component()
			await handleModsPickReview(review.interaction, "round-1", deps)
			expect(text(review.updates[0])).toContain(`<@${ALICE}>, <@${CARA}>`)
			expect(text(review.updates[0])).toContain("DM all 3 applicants")

			const go = component()
			await handleModsPickGo(go.interaction, "round-1", deps)
			expect((await getSession(pool, "round-1"))?.state).toBe("finalized")
			expect(discord.granted.sort()).toEqual([ALICE, CARA].sort())
			expect(discord.dms.map((d) => d.discordId).sort()).toEqual([ALICE, BOB, CARA].sort())
			for (const dm of discord.dms) {
				const selected = dm.discordId !== BOB
				expect(text(dm.card)).toContain(
					selected ? modsResultSelectedBody : modsResultNotSelectedBody
				)
			}
			const winners = discord.posted.at(-1)
			expect(winners?.channelId).toBe(MODS_CHANNEL)
			expect(winners?.card.allowedMentions).toEqual({ parse: [], users: [ALICE, CARA] })
			expect(text(go.edits[0])).toContain("Done. 2 new mods.")
			expect(logs.at(-1)).toEqual({
				kind: "mods_finalized",
				discordId: ADMIN,
				picked: [ALICE, CARA],
				grantFailed: 0,
				dmFailed: 0,
			})
		})

		it("goes back from the confirm step to the pick list", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			const back = component()
			await handleModsPickBack(back.interaction, "round-1", deps)
			expect(text(back.updates[0])).toContain("mods.pick.select:round-1")
		})
	})

	describe("edge cases", () => {
		it("lets the admin wrap up a round with nobody picked, still DMing every applicant", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			const go = component()
			await handleModsPickGo(go.interaction, "round-1", deps)
			expect(discord.granted).toEqual([])
			expect(discord.dms.map((d) => d.discordId)).toEqual([ALICE])
			expect(discord.posted).toEqual([])
			expect(text(go.edits[0])).toContain("Done. 0 new mods.")
		})

		it("lets the admin wrap up a round nobody applied to", async () => {
			await openRound(pool, "round-0")
			await closeSession(pool, "round-0")
			const { deps } = makeDeps(pool, discord)
			await handleModsPickGo(component().interaction, "round-0", deps)
			expect((await getSession(pool, "round-0"))?.state).toBe("finalized")
			const reopen = command("open")
			await handleMods(reopen.interaction, deps)
			expect((await getActiveSession(pool, GUILD))?.state).toBe("open")
		})

		it("closes an expired round on /mods pick without waiting for the hourly pass", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			const { deps, clock } = makeDeps(pool, discord)
			clock.now = CLOSES_AT
			const pick = command("pick")
			await handleMods(pick.interaction, deps)
			expect(text(pick.replies[0])).toContain("mods.pick.select:round-1")
			expect((await getSession(pool, "round-1"))?.state).toBe("closed")
		})

		it("clears every pick when the admin empties the menu", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			await setPicks(pool, "round-1", { among: [ALICE], picked: [ALICE] })
			const { deps } = makeDeps(pool, discord)
			await handleModsPickSelect(component({ values: [] }).interaction, "round-1", 0, deps)
			expect((await getApplication(pool, "round-1", ALICE))?.picked).toBe(false)
		})

		it("regression: ignores a picked id that never applied", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			await handleModsPickSelect(
				component({ values: [ALICE, BOB] }).interaction,
				"round-1",
				0,
				deps
			)
			await handleModsPickGo(component().interaction, "round-1", deps)
			expect(discord.granted).toEqual([ALICE])
		})
	})

	describe("error paths", () => {
		it("refuses non-admins on every subcommand", async () => {
			const { deps } = makeDeps(pool, discord)
			for (const sub of ["open", "close", "pick"]) {
				const { interaction, replies } = command(sub, { admin: false })
				await handleMods(interaction, deps)
				expect(content(replies[0])).toBe(configNoPermission)
			}
			expect(await getActiveSession(pool, GUILD)).toBeNull()
		})

		it("refuses non-admins on every pick control", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			for (const handle of [
				(i: Parameters<typeof handleModsPickReview>[0], id: string, d: typeof deps) =>
					handleModsPickSelect(i, id, 0, d),
				handleModsPickReview,
				handleModsPickBack,
				handleModsPickGo,
			]) {
				const c = component({ admin: false, values: [ALICE] })
				await handle(c.interaction, "round-1", deps)
				expect(content(c.replies[0])).toBe(configNoPermission)
			}
			expect((await getApplication(pool, "round-1", ALICE))?.picked).toBe(false)
			expect((await getSession(pool, "round-1"))?.state).toBe("closed")
		})

		it("names every missing setting before opening", async () => {
			await setGuildField(pool, GUILD, "modsChannel", null)
			await setGuildField(pool, GUILD, "modsMinRole", null)
			const { deps } = makeDeps(pool, discord)
			const { interaction, edits } = command("open")
			await handleMods(interaction, deps)
			expect(content(edits[0])).toContain("mods-channel")
			expect(content(edits[0])).toContain("mods-min-role")
			expect(content(edits[0])).not.toContain("mods-role,")
			expect(await getActiveSession(pool, GUILD)).toBeNull()
		})

		it("refuses to open a second round", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			const { interaction, edits } = command("open")
			await handleMods(interaction, deps)
			expect(content(edits[0])).toBe(modsOpenAlready)
			expect(discord.posted).toEqual([])
		})

		it("regression: a board that fails to post does not leave a stuck round", async () => {
			discord.failPost = true
			const { deps } = makeDeps(pool, discord)
			const first = command("open")
			await handleMods(first.interaction, deps)
			expect(content(first.edits[0])).toBe(modsOpenFailed)
			expect(await getActiveSession(pool, GUILD)).toBeNull()
			discord.failPost = false
			await handleMods(command("open").interaction, deps)
			expect((await getActiveSession(pool, GUILD))?.state).toBe("open")
		})

		it("has nothing to close without an open round", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, edits } = command("close")
			await handleMods(interaction, deps)
			expect(content(edits[0])).toBe(modsNothingOpen)
		})

		it("refuses to pick while voting is still running", async () => {
			await openRound(pool)
			const { deps } = makeDeps(pool, discord)
			const { interaction, replies } = command("pick")
			await handleMods(interaction, deps)
			expect(content(replies[0])).toBe(modsPickNotClosed)
		})

		it("has nothing to pick without a round", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, replies } = command("pick")
			await handleMods(interaction, deps)
			expect(content(replies[0])).toBe(modsPickNothing)
		})

		it("regression: a second confirm click does not grant or DM twice", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			await setPicks(pool, "round-1", { among: [ALICE], picked: [ALICE] })
			const { deps } = makeDeps(pool, discord)
			await handleModsPickGo(component().interaction, "round-1", deps)
			const again = component()
			await handleModsPickGo(again.interaction, "round-1", deps)
			expect(discord.granted).toEqual([ALICE])
			expect(discord.dms).toHaveLength(1)
			expect(text(again.edits[0])).toContain(modsPickAlreadyDone)
		})

		it("refuses to change picks after the round is wrapped up", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			await finalizeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			const select = component({ values: [ALICE] })
			await handleModsPickSelect(select.interaction, "round-1", 0, deps)
			expect((await getApplication(pool, "round-1", ALICE))?.picked).toBe(false)
			expect(text(select.updates[0])).toContain(modsPickAlreadyDone)
		})

		it("reports role and DM failures without stopping the rest", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await addApplicant(pool, BOB, "1400000000000000102")
			await closeSession(pool, "round-1")
			await setPicks(pool, "round-1", { among: [ALICE, BOB], picked: [ALICE, BOB] })
			discord.failGrant.add(ALICE)
			discord.failDm.add(BOB)
			const { deps, logs } = makeDeps(pool, discord)
			const go = component()
			await handleModsPickGo(go.interaction, "round-1", deps)
			expect(discord.granted).toEqual([BOB])
			expect(discord.dms.map((d) => d.discordId)).toEqual([ALICE])
			const summary = text(go.edits[0])
			expect(summary).toContain(`Couldn't give the role to <@${ALICE}>.`)
			expect(summary).toContain(`Couldn't DM <@${BOB}>.`)
			expect(logs.at(-1)).toMatchObject({ grantFailed: 1, dmFailed: 1 })
		})

		it("treats a missing mod role at confirm time as a failed grant", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await closeSession(pool, "round-1")
			await setPicks(pool, "round-1", { among: [ALICE], picked: [ALICE] })
			await setGuildField(pool, GUILD, "modsRole", null)
			const { deps } = makeDeps(pool, discord)
			const go = component()
			await handleModsPickGo(go.interaction, "round-1", deps)
			expect(discord.granted).toEqual([])
			expect(text(go.edits[0])).toContain(`Couldn't give the role to <@${ALICE}>.`)
		})
	})

	describe("invariants", () => {
		it("the hourly pass closes only rounds past their close time, once", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			const { deps, clock, logs } = makeDeps(pool, discord)
			clock.now = CLOSES_AT - 1
			await closeExpiredRounds(deps)
			expect((await getSession(pool, "round-1"))?.state).toBe("open")
			clock.now = CLOSES_AT
			await closeExpiredRounds(deps)
			await closeExpiredRounds(deps)
			expect((await getSession(pool, "round-1"))?.state).toBe("closed")
			expect(logs).toEqual([{ kind: "mods_closed", applicants: 1 }])
		})

		it("the hourly pass leaves other guilds alone", async () => {
			await openSession(pool, {
				id: "elsewhere",
				guildId: "999999999999999999",
				openedBy: ADMIN,
				openedAt: NOW,
				closesAt: NOW + 1,
			})
			const { deps, clock } = makeDeps(pool, discord)
			clock.now = NOW + 2
			await closeExpiredRounds(deps)
			expect((await getSession(pool, "elsewhere"))?.state).toBe("open")
		})

		it("closing keeps every vote and shows the final count", async () => {
			await openRound(pool)
			await addApplicant(pool, ALICE, "1400000000000000101")
			await toggleSupport(pool, { sessionId: "round-1", applicantId: ALICE, voterId: BOB, at: NOW })
			const { deps } = makeDeps(pool, discord)
			await handleMods(command("close").interaction, deps)
			expect((await getApplication(pool, "round-1", ALICE))?.support).toBe(1)
			expect(text(discord.lastEditOf("1400000000000000101"))).toContain(
				"Voting closed with 1 supporter."
			)
		})
	})

	describe("cross-field interactions", () => {
		it("regression: the second menu page picks its own applicants without clearing the first", async () => {
			await openRound(pool)
			const ids = Array.from(
				{ length: 30 },
				(_, i) => `1500000000000000${String(i).padStart(3, "0")}`
			)
			for (const [i, id] of ids.entries()) {
				await saveApplication(pool, {
					sessionId: "round-1",
					discordId: id,
					displayName: id,
					answers: ANSWERS,
					submittedAt: NOW + i,
				})
			}
			await closeSession(pool, "round-1")
			const { deps } = makeDeps(pool, discord)
			const first = ids[0] ?? ""
			const last = ids[29] ?? ""
			await handleModsPickSelect(component({ values: [first] }).interaction, "round-1", 0, deps)
			await handleModsPickSelect(component({ values: [last] }).interaction, "round-1", 1, deps)
			expect((await getApplication(pool, "round-1", first))?.picked).toBe(true)
			expect((await getApplication(pool, "round-1", last))?.picked).toBe(true)
		})

		it("refuses outside a server", async () => {
			const { deps } = makeDeps(pool, discord)
			const { interaction, replies } = command("open", { guildId: null })
			await handleMods(interaction, deps)
			expect(content(replies[0])).toContain("server")
		})
	})
})
