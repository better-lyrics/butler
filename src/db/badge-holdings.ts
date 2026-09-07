import type { Pool } from "pg"

export interface BadgeHolding {
	key: string
	tier: number | null
}

interface BadgeHoldingRow {
	badge_key: string
	tier: number | null
}

export async function getBadgeHoldings(
	pool: Pool,
	discordId: string,
	guildId: string
): Promise<BadgeHolding[]> {
	const result = await pool.query<BadgeHoldingRow>(
		"SELECT badge_key, tier FROM badge_holdings WHERE discord_id = $1 AND guild_id = $2",
		[discordId, guildId]
	)
	return result.rows.map((row) => ({ key: row.badge_key, tier: row.tier }))
}

export async function setBadgeHolding(
	pool: Pool,
	holding: {
		discordId: string
		guildId: string
		badgeKey: string
		tier: number | null
		awardedAt: number
	}
): Promise<void> {
	await pool.query(
		`INSERT INTO badge_holdings (discord_id, guild_id, badge_key, tier, awarded_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (discord_id, guild_id, badge_key)
		 DO UPDATE SET tier = EXCLUDED.tier, awarded_at = EXCLUDED.awarded_at`,
		[holding.discordId, holding.guildId, holding.badgeKey, holding.tier, holding.awardedAt]
	)
}

export async function isSeeded(pool: Pool, discordId: string, guildId: string): Promise<boolean> {
	const result = await pool.query(
		"SELECT 1 FROM badge_seeded WHERE discord_id = $1 AND guild_id = $2",
		[discordId, guildId]
	)
	return result.rows.length > 0
}

export async function markSeeded(
	pool: Pool,
	discordId: string,
	guildId: string,
	seededAt: number
): Promise<void> {
	await pool.query(
		`INSERT INTO badge_seeded (discord_id, guild_id, seeded_at)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (discord_id, guild_id)
		 DO UPDATE SET seeded_at = EXCLUDED.seeded_at`,
		[discordId, guildId, seededAt]
	)
}
