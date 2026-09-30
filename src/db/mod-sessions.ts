import type { ModSessionState } from "@/discord/mods/ballot"
import type { Pool } from "pg"
import { parseJsonb } from "./jsonb"

export interface ModSession {
	id: string
	guildId: string
	state: ModSessionState
	openedBy: string
	openedAt: number
	closesAt: number
	boardChannelId: string | null
	boardMessageId: string | null
}

export interface ModAnswers {
	why: string
	hours: string
	experience: string
	scenario: string
	extra: string | null
}

export interface ModApplication {
	sessionId: string
	discordId: string
	displayName: string
	answers: ModAnswers
	submittedAt: number
	channelId: string | null
	messageId: string | null
	picked: boolean
	support: number
}

interface SessionRow {
	id: string
	guild_id: string
	state: string
	opened_by: string
	opened_at: string | number
	closes_at: string | number
	board_channel_id: string | null
	board_message_id: string | null
}

interface ApplicationRow {
	session_id: string
	discord_id: string
	display_name: string
	answers: unknown
	submitted_at: string | number
	channel_id: string | null
	message_id: string | null
	picked: boolean
}

const SESSION_COLUMNS =
	"id, guild_id, state, opened_by, opened_at, closes_at, board_channel_id, board_message_id"

const APPLICATION_COLUMNS =
	"session_id, discord_id, display_name, answers, submitted_at, channel_id, message_id, picked"

const UNIQUE_VIOLATION = "23505"

function mapSession(row: SessionRow): ModSession {
	return {
		id: row.id,
		guildId: row.guild_id,
		state: row.state as ModSessionState,
		openedBy: row.opened_by,
		openedAt: Number(row.opened_at),
		closesAt: Number(row.closes_at),
		boardChannelId: row.board_channel_id,
		boardMessageId: row.board_message_id,
	}
}

function mapApplication(row: ApplicationRow, support: number): ModApplication {
	return {
		sessionId: row.session_id,
		discordId: row.discord_id,
		displayName: row.display_name,
		answers: parseJsonb<ModAnswers>(row.answers),
		submittedAt: Number(row.submitted_at),
		channelId: row.channel_id,
		messageId: row.message_id,
		picked: row.picked === true,
		support,
	}
}

// Returns null when the guild already has a session that is not finalized.
export async function openSession(
	pool: Pool,
	input: { id: string; guildId: string; openedBy: string; openedAt: number; closesAt: number }
): Promise<ModSession | null> {
	try {
		const result = await pool.query<SessionRow>(
			`INSERT INTO mod_session (id, guild_id, state, opened_by, opened_at, closes_at)
			 VALUES ($1, $2, 'open', $3, $4, $5)
			 RETURNING ${SESSION_COLUMNS}`,
			[input.id, input.guildId, input.openedBy, input.openedAt, input.closesAt]
		)
		const row = result.rows[0]
		return row ? mapSession(row) : null
	} catch (err) {
		if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null
		throw err
	}
}

export async function discardSession(pool: Pool, id: string): Promise<void> {
	await pool.query("DELETE FROM mod_session WHERE id = $1", [id])
}

export async function getSession(pool: Pool, id: string): Promise<ModSession | null> {
	const result = await pool.query<SessionRow>(
		`SELECT ${SESSION_COLUMNS} FROM mod_session WHERE id = $1`,
		[id]
	)
	const row = result.rows[0]
	return row ? mapSession(row) : null
}

export async function getActiveSession(pool: Pool, guildId: string): Promise<ModSession | null> {
	const result = await pool.query<SessionRow>(
		`SELECT ${SESSION_COLUMNS} FROM mod_session WHERE guild_id = $1 AND state <> 'finalized'`,
		[guildId]
	)
	const row = result.rows[0]
	return row ? mapSession(row) : null
}

export async function listExpiredSessions(pool: Pool, now: number): Promise<ModSession[]> {
	const result = await pool.query<SessionRow>(
		`SELECT ${SESSION_COLUMNS} FROM mod_session WHERE state = 'open' AND closes_at <= $1`,
		[now]
	)
	return result.rows.map(mapSession)
}

export async function setSessionBoard(
	pool: Pool,
	id: string,
	channelId: string,
	messageId: string
): Promise<void> {
	await pool.query(
		"UPDATE mod_session SET board_channel_id = $2, board_message_id = $3 WHERE id = $1",
		[id, channelId, messageId]
	)
}

async function moveSession(
	pool: Pool,
	id: string,
	from: ModSessionState,
	to: ModSessionState
): Promise<boolean> {
	const result = await pool.query(
		"UPDATE mod_session SET state = $3 WHERE id = $1 AND state = $2 RETURNING id",
		[id, from, to]
	)
	return result.rows.length > 0
}

export function closeSession(pool: Pool, id: string): Promise<boolean> {
	return moveSession(pool, id, "open", "closed")
}

export function finalizeSession(pool: Pool, id: string): Promise<boolean> {
	return moveSession(pool, id, "closed", "finalized")
}

async function supportCounts(pool: Pool, sessionId: string): Promise<Map<string, number>> {
	const result = await pool.query<{ applicant_id: string; support: string | number }>(
		`SELECT applicant_id, COUNT(*) AS support FROM mod_vote
		 WHERE session_id = $1 GROUP BY applicant_id`,
		[sessionId]
	)
	return new Map(result.rows.map((r) => [r.applicant_id, Number(r.support)]))
}

async function countSupport(pool: Pool, sessionId: string, applicantId: string): Promise<number> {
	const result = await pool.query<{ support: string | number }>(
		"SELECT COUNT(*) AS support FROM mod_vote WHERE session_id = $1 AND applicant_id = $2",
		[sessionId, applicantId]
	)
	return Number(result.rows[0]?.support ?? 0)
}

export async function getApplication(
	pool: Pool,
	sessionId: string,
	discordId: string
): Promise<ModApplication | null> {
	const result = await pool.query<ApplicationRow>(
		`SELECT ${APPLICATION_COLUMNS} FROM mod_application WHERE session_id = $1 AND discord_id = $2`,
		[sessionId, discordId]
	)
	const row = result.rows[0]
	return row ? mapApplication(row, await countSupport(pool, sessionId, discordId)) : null
}

export async function listApplications(pool: Pool, sessionId: string): Promise<ModApplication[]> {
	const result = await pool.query<ApplicationRow>(
		`SELECT ${APPLICATION_COLUMNS} FROM mod_application WHERE session_id = $1
		 ORDER BY submitted_at ASC, discord_id ASC`,
		[sessionId]
	)
	const counts = await supportCounts(pool, sessionId)
	return result.rows.map((row) => mapApplication(row, counts.get(row.discord_id) ?? 0))
}

// An edit keeps the original submit time, so editing never costs an applicant their tie-break.
export async function saveApplication(
	pool: Pool,
	input: {
		sessionId: string
		discordId: string
		displayName: string
		answers: ModAnswers
		submittedAt: number
	}
): Promise<ModApplication> {
	await pool.query(
		`INSERT INTO mod_application (session_id, discord_id, display_name, answers, submitted_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (session_id, discord_id)
		 DO UPDATE SET display_name = EXCLUDED.display_name, answers = EXCLUDED.answers`,
		[
			input.sessionId,
			input.discordId,
			input.displayName,
			JSON.stringify(input.answers),
			input.submittedAt,
		]
	)
	const saved = await getApplication(pool, input.sessionId, input.discordId)
	if (!saved) throw new Error(`mod application ${input.sessionId}/${input.discordId} vanished`)
	return saved
}

export async function setApplicationCard(
	pool: Pool,
	sessionId: string,
	discordId: string,
	channelId: string,
	messageId: string
): Promise<void> {
	await pool.query(
		`UPDATE mod_application SET channel_id = $3, message_id = $4
		 WHERE session_id = $1 AND discord_id = $2`,
		[sessionId, discordId, channelId, messageId]
	)
}

const ACCEPTING_VOTES = `EXISTS (SELECT 1 FROM mod_session
	WHERE id = $1 AND state = 'open' AND closes_at > $4::bigint)`

// Returns null once voting has ended. Every write re-checks, so a vote racing a close never lands.
export async function toggleSupport(
	pool: Pool,
	input: { sessionId: string; applicantId: string; voterId: string; at: number }
): Promise<{ supported: boolean; support: number } | null> {
	const params = [input.sessionId, input.applicantId, input.voterId, input.at]
	const removed = await pool.query(
		`DELETE FROM mod_vote WHERE session_id = $1 AND applicant_id = $2 AND voter_id = $3
		 AND ${ACCEPTING_VOTES} RETURNING voter_id`,
		params
	)
	if (removed.rows.length === 0) {
		const added = await pool.query(
			`INSERT INTO mod_vote (session_id, applicant_id, voter_id, cast_at)
			 SELECT $1::text, $2::text, $3::text, $4::bigint WHERE ${ACCEPTING_VOTES}
			 ON CONFLICT (session_id, applicant_id, voter_id) DO NOTHING RETURNING voter_id`,
			params
		)
		if (added.rows.length === 0 && !(await isAcceptingVotes(pool, input.sessionId, input.at))) {
			return null
		}
	}
	return {
		supported: removed.rows.length === 0,
		support: await countSupport(pool, input.sessionId, input.applicantId),
	}
}

async function isAcceptingVotes(pool: Pool, sessionId: string, at: number): Promise<boolean> {
	const result = await pool.query(
		"SELECT id FROM mod_session WHERE id = $1 AND state = 'open' AND closes_at > $2",
		[sessionId, at]
	)
	return result.rows.length > 0
}

// Scoped to the applicants one menu page lists, and refused unless voting is closed but not wrapped up.
export async function setPicks(
	pool: Pool,
	sessionId: string,
	input: { among: string[]; picked: string[] }
): Promise<boolean> {
	const closed = await pool.query("SELECT id FROM mod_session WHERE id = $1 AND state = 'closed'", [
		sessionId,
	])
	if (closed.rows.length === 0) return false
	for (const discordId of input.among) {
		await pool.query(
			`UPDATE mod_application SET picked = $3 WHERE session_id = $1 AND discord_id = $2
			 AND EXISTS (SELECT 1 FROM mod_session WHERE id = $1 AND state = 'closed')`,
			[sessionId, discordId, input.picked.includes(discordId)]
		)
	}
	return true
}
