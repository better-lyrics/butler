import type { Pool } from "pg"

interface HoldingRow {
	discord_id: string
	tier: string
}

export async function getAllHoldings(pool: Pool, guildId: string): Promise<Map<string, string>> {
	const result = await pool.query<HoldingRow>(
		"SELECT discord_id, tier FROM role_holdings WHERE guild_id = $1",
		[guildId]
	)
	const holdings = new Map<string, string>()
	for (const row of result.rows) {
		holdings.set(row.discord_id, row.tier)
	}
	return holdings
}

export async function setHolding(
	pool: Pool,
	discordId: string,
	guildId: string,
	tier: string,
	grantedAt: number
): Promise<void> {
	await pool.query(
		`INSERT INTO role_holdings (discord_id, guild_id, tier, granted_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (discord_id, guild_id)
		 DO UPDATE SET tier = EXCLUDED.tier, granted_at = EXCLUDED.granted_at`,
		[discordId, guildId, tier, grantedAt]
	)
}

export async function deleteHolding(pool: Pool, discordId: string, guildId: string): Promise<void> {
	await pool.query("DELETE FROM role_holdings WHERE discord_id = $1 AND guild_id = $2", [
		discordId,
		guildId,
	])
}
