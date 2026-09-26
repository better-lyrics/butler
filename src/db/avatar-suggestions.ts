import { AVATAR_PUBLISH_CLAIM_TTL_MS } from "@/config"
import type { Pool } from "pg"

export type AvatarSuggestionState = "pending" | "publishing" | "approved" | "rejected"

export interface AvatarSuggestion {
	id: string
	guildId: string
	proposedId: string
	label: string
	imageBase64: string
	mime: string
	proposerDiscordId: string
	proposerKeyId: string | null
	cardChannelId: string | null
	cardMessageId: string | null
	state: AvatarSuggestionState
	createdAt: number
	decidedBy: string | null
	decidedAt: number | null
}

interface AvatarSuggestionRow {
	id: string
	guild_id: string
	proposed_id: string
	label: string
	image_base64: string
	mime: string
	proposer_discord_id: string
	proposer_key_id: string | null
	card_channel_id: string | null
	card_message_id: string | null
	state: string
	created_at: string | number
	decided_by: string | null
	decided_at: string | number | null
}

const SELECT_COLUMNS =
	"id, guild_id, proposed_id, label, image_base64, mime, proposer_discord_id, proposer_key_id, card_channel_id, card_message_id, state, created_at, decided_at, decided_by"

function toNumber(value: string | number | null): number | null {
	return value === null || value === undefined ? null : Number(value)
}

function mapRow(row: AvatarSuggestionRow): AvatarSuggestion {
	return {
		id: row.id,
		guildId: row.guild_id,
		proposedId: row.proposed_id,
		label: row.label,
		imageBase64: row.image_base64,
		mime: row.mime,
		proposerDiscordId: row.proposer_discord_id,
		proposerKeyId: row.proposer_key_id,
		cardChannelId: row.card_channel_id,
		cardMessageId: row.card_message_id,
		state: row.state as AvatarSuggestionState,
		createdAt: toNumber(row.created_at) ?? 0,
		decidedBy: row.decided_by,
		decidedAt: toNumber(row.decided_at),
	}
}

export interface CreateSuggestionInput {
	id: string
	guildId: string
	proposedId: string
	label: string
	imageBase64: string
	mime: string
	proposerDiscordId: string
	proposerKeyId: string | null
}

export async function createSuggestion(
	pool: Pool,
	input: CreateSuggestionInput,
	now: number = Date.now()
): Promise<AvatarSuggestion> {
	const result = await pool.query<AvatarSuggestionRow>(
		`INSERT INTO avatar_suggestion
		   (id, guild_id, proposed_id, label, image_base64, mime, proposer_discord_id, proposer_key_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING ${SELECT_COLUMNS}`,
		[
			input.id,
			input.guildId,
			input.proposedId,
			input.label,
			input.imageBase64,
			input.mime,
			input.proposerDiscordId,
			input.proposerKeyId,
			now,
		]
	)
	const row = result.rows[0]
	if (!row) throw new Error("avatar_suggestion insert returned no row")
	return mapRow(row)
}

export async function getSuggestion(pool: Pool, id: string): Promise<AvatarSuggestion | null> {
	const result = await pool.query<AvatarSuggestionRow>(
		`SELECT ${SELECT_COLUMNS} FROM avatar_suggestion WHERE id = $1`,
		[id]
	)
	const row = result.rows[0]
	return row ? mapRow(row) : null
}

export async function setSuggestionCard(
	pool: Pool,
	id: string,
	channelId: string,
	messageId: string
): Promise<void> {
	await pool.query(
		"UPDATE avatar_suggestion SET card_channel_id = $2, card_message_id = $3 WHERE id = $1",
		[id, channelId, messageId]
	)
}

export async function claimSuggestion(
	pool: Pool,
	id: string,
	actorId: string,
	now: number = Date.now()
): Promise<AvatarSuggestion | null> {
	const result = await pool.query<AvatarSuggestionRow>(
		`UPDATE avatar_suggestion SET state = 'publishing', decided_by = $2, decided_at = $3
		 WHERE id = $1 AND (state = 'pending' OR (state = 'publishing' AND decided_at < $4))
		 RETURNING ${SELECT_COLUMNS}`,
		[id, actorId, now, now - AVATAR_PUBLISH_CLAIM_TTL_MS]
	)
	const row = result.rows[0]
	return row ? mapRow(row) : null
}

export async function releaseSuggestion(pool: Pool, id: string): Promise<void> {
	await pool.query(
		"UPDATE avatar_suggestion SET state = 'pending', decided_by = NULL, decided_at = NULL WHERE id = $1 AND state = 'publishing'",
		[id]
	)
}

export interface SuggestionDecision {
	id: string
	from: "pending" | "publishing"
	to: "approved" | "rejected"
	decidedBy: string
}

export async function markSuggestionDecided(
	pool: Pool,
	decision: SuggestionDecision,
	now: number = Date.now()
): Promise<boolean> {
	// Drop the stored image once decided: it is only needed to publish on approval.
	const result = await pool.query(
		"UPDATE avatar_suggestion SET state = $3, decided_by = $4, decided_at = $5, image_base64 = '' WHERE id = $1 AND state = $2",
		[decision.id, decision.from, decision.to, decision.decidedBy, now]
	)
	return (result.rowCount ?? 0) > 0
}

export async function deleteSuggestion(pool: Pool, id: string): Promise<void> {
	await pool.query("DELETE FROM avatar_suggestion WHERE id = $1", [id])
}

export async function pruneDecidedSuggestions(
	pool: Pool,
	olderThanMs: number,
	now: number = Date.now()
): Promise<number> {
	const result = await pool.query(
		"DELETE FROM avatar_suggestion WHERE state IN ('approved', 'rejected') AND decided_at < $1",
		[now - olderThanMs]
	)
	return result.rowCount ?? 0
}
