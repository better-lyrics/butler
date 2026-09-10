import type { QueueEntry } from "@/unison/client"
import type { Pool } from "pg"

export type BoardCardState = "pending" | "sealed" | "rejected"

export interface BoardCard {
	lyricId: string
	messageId: string
	channelId: string
	position: number
	state: BoardCardState
	actorId: string | null
	note: string | null
	entry: QueueEntry
}

interface BoardCardRow {
	lyric_id: string
	message_id: string
	channel_id: string
	position: number
	state: string
	actor_id: string | null
	note: string | null
	entry: unknown
}

// JSONB comes back parsed from real pg, but pg-mem hands the column back as a
// raw string, so normalize both shapes.
function parseEntry(value: unknown): QueueEntry {
	return (typeof value === "string" ? JSON.parse(value) : value) as QueueEntry
}

function mapRow(row: BoardCardRow): BoardCard {
	return {
		lyricId: row.lyric_id,
		messageId: row.message_id,
		channelId: row.channel_id,
		position: Number(row.position),
		state: row.state as BoardCardState,
		actorId: row.actor_id,
		note: row.note,
		entry: parseEntry(row.entry),
	}
}

const SELECT_COLUMNS = "lyric_id, message_id, channel_id, position, state, actor_id, note, entry"

export async function getBoard(pool: Pool, guildId: string): Promise<BoardCard[]> {
	const result = await pool.query<BoardCardRow>(
		`SELECT ${SELECT_COLUMNS} FROM review_board_card WHERE guild_id = $1 ORDER BY position ASC`,
		[guildId]
	)
	return result.rows.map(mapRow)
}

export async function getBoardCard(
	pool: Pool,
	guildId: string,
	lyricId: string
): Promise<BoardCard | null> {
	const result = await pool.query<BoardCardRow>(
		`SELECT ${SELECT_COLUMNS} FROM review_board_card WHERE guild_id = $1 AND lyric_id = $2`,
		[guildId, lyricId]
	)
	const row = result.rows[0]
	return row ? mapRow(row) : null
}

export async function replaceBoard(pool: Pool, guildId: string, cards: BoardCard[]): Promise<void> {
	await pool.query("DELETE FROM review_board_card WHERE guild_id = $1", [guildId])
	for (const c of cards) {
		await pool.query(
			`INSERT INTO review_board_card
			   (guild_id, lyric_id, message_id, channel_id, position, state, actor_id, note, entry)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				guildId,
				c.lyricId,
				c.messageId,
				c.channelId,
				c.position,
				c.state,
				c.actorId,
				c.note,
				JSON.stringify(c.entry),
			]
		)
	}
}

const PATCH_COLUMNS: Record<string, string> = {
	state: "state",
	actorId: "actor_id",
	note: "note",
	messageId: "message_id",
}

export async function updateBoardCard(
	pool: Pool,
	guildId: string,
	lyricId: string,
	patch: Partial<Pick<BoardCard, "state" | "actorId" | "note" | "messageId">>
): Promise<void> {
	const sets: string[] = []
	const values: unknown[] = [guildId, lyricId]
	for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
		const value = patch[key as keyof typeof patch]
		if (value === undefined) continue
		values.push(value)
		sets.push(`${column} = $${values.length}`)
	}
	if (sets.length === 0) return
	await pool.query(
		`UPDATE review_board_card SET ${sets.join(", ")} WHERE guild_id = $1 AND lyric_id = $2`,
		values
	)
}
