import { parseJsonb } from "@/db/jsonb"
import type { FlagCard } from "@/unison/client"
import type { Pool } from "pg"

type FlagBoardState = "pending" | "removed" | "kept"

interface FlagDecisionRecord {
	state: Exclude<FlagBoardState, "pending">
	card: FlagCard | null
}

export interface FlagBoardRow {
	caseId: string
	messageId: string
	channelId: string
	state: FlagBoardState
	card: FlagCard
}

interface FlagBoardDbRow {
	case_id: string
	message_id: string
	channel_id: string
	state: string
	card: unknown
}

const SELECT_COLUMNS = "case_id, message_id, channel_id, state, card"

function mapRow(row: FlagBoardDbRow): FlagBoardRow {
	return {
		caseId: row.case_id,
		messageId: row.message_id,
		channelId: row.channel_id,
		state: row.state as FlagBoardState,
		card: parseJsonb<FlagCard>(row.card),
	}
}

export async function listFlagBoard(pool: Pool, guildId: string): Promise<FlagBoardRow[]> {
	const result = await pool.query<FlagBoardDbRow>(
		`SELECT ${SELECT_COLUMNS} FROM flag_board_card WHERE guild_id = $1`,
		[guildId]
	)
	return result.rows.map(mapRow)
}

export async function getFlagBoardRow(
	pool: Pool,
	guildId: string,
	caseId: string
): Promise<FlagBoardRow | null> {
	const result = await pool.query<FlagBoardDbRow>(
		`SELECT ${SELECT_COLUMNS} FROM flag_board_card WHERE guild_id = $1 AND case_id = $2`,
		[guildId, caseId]
	)
	const row = result.rows[0]
	return row ? mapRow(row) : null
}

export async function recordFlagPost(
	pool: Pool,
	guildId: string,
	post: { caseId: string; messageId: string; channelId: string; card: FlagCard }
): Promise<void> {
	await pool.query(
		`INSERT INTO flag_board_card (guild_id, case_id, message_id, channel_id, card)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (guild_id, case_id) DO NOTHING`,
		[guildId, post.caseId, post.messageId, post.channelId, JSON.stringify(post.card)]
	)
}

export async function updateFlagCard(
	pool: Pool,
	guildId: string,
	caseId: string,
	card: FlagCard
): Promise<boolean> {
	const result = await pool.query(
		`UPDATE flag_board_card SET card = $3
		 WHERE guild_id = $1 AND case_id = $2 AND state = 'pending'`,
		[guildId, caseId, JSON.stringify(card)]
	)
	return (result.rowCount ?? 0) > 0
}

export async function markFlagDecided(
	pool: Pool,
	guildId: string,
	caseId: string,
	decision: FlagDecisionRecord
): Promise<void> {
	await pool.query(
		`UPDATE flag_board_card SET state = $3, card = COALESCE($4::jsonb, card)
		 WHERE guild_id = $1 AND case_id = $2`,
		[guildId, caseId, decision.state, decision.card === null ? null : JSON.stringify(decision.card)]
	)
}

export async function forgetFlagRow(pool: Pool, guildId: string, caseId: string): Promise<void> {
	await pool.query("DELETE FROM flag_board_card WHERE guild_id = $1 AND case_id = $2", [
		guildId,
		caseId,
	])
}
