import type { ModAnswers } from "@/db/mod-sessions"
import { applySchema } from "@/db/pool"
import type { CardPayload } from "@/discord/components/connect-card"
import type { ModLogEvent } from "@/discord/mod-log"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import type { ModsDeps } from "../round"

export const GUILD = "1287402164431962122"
export const ADMIN = "284091471239512064"
export const ALICE = "719388223508070471"
export const BOB = "1049311214321823774"
export const CARA = "902118370052309012"
export const MODS_CHANNEL = "1300000000000000001"
export const MODS_ROLE = "1300000000000000002"
export const ACTIVE_MEMBER_ROLE = "1300000000000000003"
export const NOW = 1_790_000_000_000
export const DAY_MS = 24 * 60 * 60 * 1000

export const ANSWERS: ModAnswers = {
	why: "I am in the server most evenings and already answer the setup questions in #help.",
	hours: "UTC+1, weekday evenings and most of the weekend",
	experience: "Ran a 4k member Minecraft server for two years.",
	scenario: "Warn once in DM, then a short timeout, then flag it in the staff channel.",
	extra: null,
}

export async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

export interface Posted {
	channelId: string
	messageId: string
	card: CardPayload
}

// Discord is the outbound boundary: this records what butler would send and lets a test refuse it.
export class DiscordDouble {
	posted: Posted[] = []
	edits: Posted[] = []
	granted: string[] = []
	dms: { discordId: string; card: CardPayload }[] = []
	eligible = new Set<string>([ADMIN, ALICE, BOB, CARA])
	failPost = false
	roleAssignable = true
	failGrant = new Set<string>()
	failDm = new Set<string>()
	private nextMessage = 1400000000000000000n

	postCard = async (channelId: string, card: CardPayload): Promise<string | null> => {
		if (this.failPost) return null
		this.nextMessage += 1n
		const messageId = String(this.nextMessage)
		this.posted.push({ channelId, messageId, card })
		return messageId
	}

	editCard = async (channelId: string, messageId: string, card: CardPayload): Promise<boolean> => {
		this.edits.push({ channelId, messageId, card })
		return true
	}

	meetsMinRole = async (discordId: string, minRoleId: string): Promise<boolean> =>
		minRoleId === ACTIVE_MEMBER_ROLE && this.eligible.has(discordId)

	canAssignRole = async (_roleId: string): Promise<boolean> => this.roleAssignable

	grantRole = async (discordId: string, _roleId: string): Promise<boolean> => {
		if (this.failGrant.has(discordId)) return false
		this.granted.push(discordId)
		return true
	}

	sendDm = async (discordId: string, card: CardPayload): Promise<boolean> => {
		if (this.failDm.has(discordId)) return false
		this.dms.push({ discordId, card })
		return true
	}

	lastEditOf(messageId: string): CardPayload | undefined {
		return this.edits.filter((e) => e.messageId === messageId).at(-1)?.card
	}
}

export function makeDeps(pool: Pool, discord: DiscordDouble, clock = { now: NOW }) {
	const refreshed = { boards: [] as string[], cards: [] as string[] }
	const logs: ModLogEvent[] = []
	let ids = 0
	const deps: ModsDeps = {
		pool,
		guildId: GUILD,
		now: () => clock.now,
		newId: () => `round-${++ids}`,
		discord,
		refresh: {
			board: (sessionId) => refreshed.boards.push(sessionId),
			card: (sessionId, applicantId) => refreshed.cards.push(`${sessionId}:${applicantId}`),
		},
		modLog: (event) => logs.push(event),
	}
	return { deps, refreshed, logs, clock }
}

export function text(card: unknown): string {
	return JSON.stringify(card)
}
