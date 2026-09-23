import { parseJsonb } from "@/db/jsonb"
import type { PendingRevisionCard } from "@/unison/client"
import type { Pool } from "pg"

export type RevisionBoardState = "pending" | "approved" | "rejected"

export interface RevisionDecisionRecord {
	state: Exclude<RevisionBoardState, "pending">
	actorId: string
	note: string | null
}

export interface RevisionBoardRow {
	revisionId: string
	messageId: string
	channelId: string
	state: RevisionBoardState
	actorId: string | null
	note: string | null
	card: PendingRevisionCard
}

interface RevisionBoardDbRow {
	revision_id: string
	message_id: string
	channel_id: string
	state: string
	actor_id: string | null
	note: string | null
	card: unknown
}

const SELECT_COLUMNS = "revision_id, message_id, channel_id, state, actor_id, note, card"

function mapRow(row: RevisionBoardDbRow): RevisionBoardRow {
	return {
		revisionId: row.revision_id,
		messageId: row.message_id,
		channelId: row.channel_id,
		state: row.state as RevisionBoardState,
		actorId: row.actor_id,
		note: row.note,
		card: parseJsonb<PendingRevisionCard>(row.card),
	}
}

export async function listRevisionBoard(pool: Pool, guildId: string): Promise<RevisionBoardRow[]> {
	const result = await pool.query<RevisionBoardDbRow>(
		`SELECT ${SELECT_COLUMNS} FROM revision_board_card WHERE guild_id = $1`,
		[guildId]
	)
	return result.rows.map(mapRow)
}

export async function getRevisionBoardRow(
	pool: Pool,
	guildId: string,
	revisionId: string
): Promise<RevisionBoardRow | null> {
	const result = await pool.query<RevisionBoardDbRow>(
		`SELECT ${SELECT_COLUMNS} FROM revision_board_card WHERE guild_id = $1 AND revision_id = $2`,
		[guildId, revisionId]
	)
	const row = result.rows[0]
	return row ? mapRow(row) : null
}

export async function recordRevisionPost(
	pool: Pool,
	guildId: string,
	post: { revisionId: string; messageId: string; channelId: string; card: PendingRevisionCard }
): Promise<void> {
	await pool.query(
		`INSERT INTO revision_board_card (guild_id, revision_id, message_id, channel_id, card)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (guild_id, revision_id) DO NOTHING`,
		[guildId, post.revisionId, post.messageId, post.channelId, JSON.stringify(post.card)]
	)
}

export async function markRevisionDecided(
	pool: Pool,
	guildId: string,
	revisionId: string,
	decision: RevisionDecisionRecord
): Promise<void> {
	await pool.query(
		`UPDATE revision_board_card SET state = $3, actor_id = $4, note = $5
		 WHERE guild_id = $1 AND revision_id = $2`,
		[guildId, revisionId, decision.state, decision.actorId, decision.note]
	)
}

export async function forgetRevisionRow(
	pool: Pool,
	guildId: string,
	revisionId: string
): Promise<void> {
	await pool.query("DELETE FROM revision_board_card WHERE guild_id = $1 AND revision_id = $2", [
		guildId,
		revisionId,
	])
}
