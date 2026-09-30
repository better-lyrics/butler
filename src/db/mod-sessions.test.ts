import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	type ModAnswers,
	closeSession,
	discardSession,
	finalizeSession,
	getActiveSession,
	getApplication,
	getSession,
	listApplications,
	listExpiredSessions,
	openSession,
	saveApplication,
	setApplicationCard,
	setPicks,
	setSessionBoard,
	toggleSupport,
} from "./mod-sessions"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

const GUILD = "1287402164431962122"
const ADMIN = "284091471239512064"
const ALICE = "719388223508070471"
const BOB = "1049311214321823774"
const CARA = "902118370052309012"
const OPENED_AT = 1_790_000_000_000
const CLOSES_AT = OPENED_AT + 7 * 24 * 60 * 60 * 1000

const ANSWERS: ModAnswers = {
	why: "I am in the server most evenings and already answer the setup questions in #help.",
	hours: "UTC+1, weekday evenings and most of the weekend",
	experience: "Ran a 4k member Minecraft server for two years.",
	scenario: "Warn once in DM, then a short timeout, then flag it in the staff channel.",
	extra: null,
}

async function open(pool: Pool, id = "s1") {
	return openSession(pool, {
		id,
		guildId: GUILD,
		openedBy: ADMIN,
		openedAt: OPENED_AT,
		closesAt: CLOSES_AT,
	})
}

async function apply(pool: Pool, discordId: string, submittedAt: number, sessionId = "s1") {
	return saveApplication(pool, {
		sessionId,
		discordId,
		displayName: `user-${discordId.slice(-4)}`,
		answers: ANSWERS,
		submittedAt,
	})
}

describe("mod sessions store", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("happy paths", () => {
		it("opens a session and reads it back as active", async () => {
			const session = await open(pool)
			expect(session).toEqual({
				id: "s1",
				guildId: GUILD,
				state: "open",
				openedBy: ADMIN,
				openedAt: OPENED_AT,
				closesAt: CLOSES_AT,
				boardChannelId: null,
				boardMessageId: null,
			})
			expect(await getActiveSession(pool, GUILD)).toEqual(session)
		})

		it("stores the board message", async () => {
			await open(pool)
			await setSessionBoard(pool, "s1", "1300000000000000001", "1300000000000000002")
			const session = await getSession(pool, "s1")
			expect(session?.boardChannelId).toBe("1300000000000000001")
			expect(session?.boardMessageId).toBe("1300000000000000002")
		})

		it("saves an application with zero support", async () => {
			await open(pool)
			const saved = await apply(pool, ALICE, OPENED_AT + 1)
			expect(saved).toEqual({
				sessionId: "s1",
				discordId: ALICE,
				displayName: "user-0471",
				answers: ANSWERS,
				submittedAt: OPENED_AT + 1,
				channelId: null,
				messageId: null,
				picked: false,
				support: 0,
			})
		})

		it("toggles support on and off", async () => {
			await open(pool)
			await apply(pool, ALICE, OPENED_AT + 1)
			const on = await toggleSupport(pool, {
				sessionId: "s1",
				applicantId: ALICE,
				voterId: BOB,
				at: 1,
			})
			expect(on).toEqual({ supported: true, support: 1 })
			const off = await toggleSupport(pool, {
				sessionId: "s1",
				applicantId: ALICE,
				voterId: BOB,
				at: 2,
			})
			expect(off).toEqual({ supported: false, support: 0 })
		})

		it("lists applications with their support counts", async () => {
			await open(pool)
			await apply(pool, ALICE, OPENED_AT + 1)
			await apply(pool, BOB, OPENED_AT + 2)
			await toggleSupport(pool, { sessionId: "s1", applicantId: BOB, voterId: CARA, at: 1 })
			await toggleSupport(pool, { sessionId: "s1", applicantId: BOB, voterId: ADMIN, at: 2 })
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: CARA, at: 3 })
			const list = await listApplications(pool, "s1")
			expect(list.map((a) => [a.discordId, a.support])).toEqual([
				[ALICE, 1],
				[BOB, 2],
			])
		})

		it("walks open, closed, finalized", async () => {
			await open(pool)
			expect(await closeSession(pool, "s1")).toBe(true)
			expect((await getSession(pool, "s1"))?.state).toBe("closed")
			expect(await finalizeSession(pool, "s1")).toBe(true)
			expect((await getSession(pool, "s1"))?.state).toBe("finalized")
		})
	})

	describe("edge cases", () => {
		it("has no active session before any is opened", async () => {
			expect(await getActiveSession(pool, GUILD)).toBeNull()
		})

		it("lists no applications for an empty session", async () => {
			await open(pool)
			expect(await listApplications(pool, "s1")).toEqual([])
		})

		it("returns null for an unknown application", async () => {
			await open(pool)
			expect(await getApplication(pool, "s1", ALICE)).toBeNull()
		})

		it("keeps unicode answers intact", async () => {
			await open(pool)
			const answers = { ...ANSWERS, why: "日本語のサーバーも手伝えます 🎵", extra: "ça va" }
			await saveApplication(pool, {
				sessionId: "s1",
				discordId: ALICE,
				displayName: "ユーザー",
				answers,
				submittedAt: 1,
			})
			const saved = await getApplication(pool, "s1", ALICE)
			expect(saved?.answers).toEqual(answers)
			expect(saved?.displayName).toBe("ユーザー")
		})

		it("lists only sessions whose close time has passed", async () => {
			await open(pool)
			expect(await listExpiredSessions(pool, CLOSES_AT - 1)).toEqual([])
			expect((await listExpiredSessions(pool, CLOSES_AT)).map((s) => s.id)).toEqual(["s1"])
		})

		it("clears every pick when given an empty list", async () => {
			await open(pool)
			await apply(pool, ALICE, 1)
			await setPicks(pool, "s1", [ALICE])
			await setPicks(pool, "s1", [])
			expect((await getApplication(pool, "s1", ALICE))?.picked).toBe(false)
		})
	})

	describe("invariants", () => {
		it("allows only one active session per guild", async () => {
			await open(pool, "s1")
			expect(await open(pool, "s2")).toBeNull()
			await closeSession(pool, "s1")
			expect(await open(pool, "s2")).toBeNull()
		})

		it("allows a new session once the last one is finalized", async () => {
			await open(pool, "s1")
			await closeSession(pool, "s1")
			await finalizeSession(pool, "s1")
			expect((await open(pool, "s2"))?.id).toBe("s2")
			expect((await getActiveSession(pool, GUILD))?.id).toBe("s2")
		})

		it("keeps the first submit time when an applicant edits their answers", async () => {
			await open(pool)
			await apply(pool, ALICE, 100)
			const edited = await saveApplication(pool, {
				sessionId: "s1",
				discordId: ALICE,
				displayName: "renamed",
				answers: { ...ANSWERS, extra: "one more thing" },
				submittedAt: 900,
			})
			expect(edited.submittedAt).toBe(100)
			expect(edited.answers.extra).toBe("one more thing")
			expect(edited.displayName).toBe("renamed")
		})

		it("keeps support and the card when an applicant edits their answers", async () => {
			await open(pool)
			await apply(pool, ALICE, 100)
			await setApplicationCard(pool, "s1", ALICE, "1300000000000000001", "1300000000000000003")
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: BOB, at: 1 })
			const edited = await apply(pool, ALICE, 200)
			expect(edited.support).toBe(1)
			expect(edited.messageId).toBe("1300000000000000003")
		})

		it("counts one vote per voter", async () => {
			await open(pool)
			await apply(pool, ALICE, 1)
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: BOB, at: 1 })
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: CARA, at: 2 })
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: BOB, at: 3 })
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: BOB, at: 4 })
			expect((await getApplication(pool, "s1", ALICE))?.support).toBe(2)
		})

		it("closes a session only once", async () => {
			await open(pool)
			expect(await closeSession(pool, "s1")).toBe(true)
			expect(await closeSession(pool, "s1")).toBe(false)
		})

		it("finalizes a session only once", async () => {
			await open(pool)
			await closeSession(pool, "s1")
			expect(await finalizeSession(pool, "s1")).toBe(true)
			expect(await finalizeSession(pool, "s1")).toBe(false)
		})
	})

	describe("error paths", () => {
		it("regression: discarding a session whose board failed to post frees the guild for a retry", async () => {
			await open(pool, "s1")
			await discardSession(pool, "s1")
			expect(await getSession(pool, "s1")).toBeNull()
			expect((await open(pool, "s2"))?.id).toBe("s2")
		})

		it("refuses to finalize a session that is still open", async () => {
			await open(pool)
			expect(await finalizeSession(pool, "s1")).toBe(false)
			expect((await getSession(pool, "s1"))?.state).toBe("open")
		})

		it("does not list a closed session as expired", async () => {
			await open(pool)
			await closeSession(pool, "s1")
			expect(await listExpiredSessions(pool, CLOSES_AT + 1)).toEqual([])
		})

		it("returns null for an unknown session", async () => {
			expect(await getSession(pool, "missing")).toBeNull()
		})
	})

	describe("cross-field interactions", () => {
		it("scopes the active session to its guild", async () => {
			await open(pool)
			expect(await getActiveSession(pool, "999999999999999999")).toBeNull()
		})

		it("scopes votes and applications to their session", async () => {
			await open(pool, "s1")
			await closeSession(pool, "s1")
			await finalizeSession(pool, "s1")
			await open(pool, "s2")
			await apply(pool, ALICE, 1, "s1")
			await apply(pool, ALICE, 2, "s2")
			await toggleSupport(pool, { sessionId: "s1", applicantId: ALICE, voterId: BOB, at: 1 })
			expect((await getApplication(pool, "s1", ALICE))?.support).toBe(1)
			expect((await getApplication(pool, "s2", ALICE))?.support).toBe(0)
		})

		it("marks exactly the picked applicants", async () => {
			await open(pool)
			await apply(pool, ALICE, 1)
			await apply(pool, BOB, 2)
			await apply(pool, CARA, 3)
			await setPicks(pool, "s1", [ALICE, CARA])
			await setPicks(pool, "s1", [BOB])
			const picked = (await listApplications(pool, "s1")).filter((a) => a.picked)
			expect(picked.map((a) => a.discordId)).toEqual([BOB])
		})
	})
})
