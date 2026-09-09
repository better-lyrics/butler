import type { Pool } from "pg"

export interface GuildConfig {
	guildId: string
	connectChannelId: string | null
	reportChannelId: string | null
	announceChannelId: string | null
	modChannelId: string | null
	roleIds: Record<string, string>
	tierOverrides: unknown | null
	councilRoleId: string | null
	enabled: boolean
}

interface GuildConfigRow {
	guild_id: string
	connect_channel_id: string | null
	report_channel_id: string | null
	announce_channel_id: string | null
	mod_channel_id: string | null
	role_ids: unknown
	tier_overrides: unknown
	council_role_id: string | null
	enabled: boolean
}

// JSONB comes back parsed from real pg, but pg-mem returns column defaults
// (e.g. the '{}' default for role_ids) as a raw string, so normalize both shapes.
function parseJson<T>(value: unknown, fallback: T): T {
	if (value === null || value === undefined) return fallback
	if (typeof value === "string") return JSON.parse(value) as T
	return value as T
}

function parseJsonOrNull(value: unknown): unknown | null {
	if (value === null || value === undefined) return null
	if (typeof value === "string") return JSON.parse(value)
	return value
}

function mapConfig(row: GuildConfigRow): GuildConfig {
	return {
		guildId: row.guild_id,
		connectChannelId: row.connect_channel_id,
		reportChannelId: row.report_channel_id,
		announceChannelId: row.announce_channel_id,
		modChannelId: row.mod_channel_id,
		roleIds: parseJson<Record<string, string>>(row.role_ids, {}),
		tierOverrides: parseJsonOrNull(row.tier_overrides),
		councilRoleId: row.council_role_id,
		enabled: row.enabled === true,
	}
}

export async function getGuildConfig(pool: Pool, guildId: string): Promise<GuildConfig | null> {
	const result = await pool.query<GuildConfigRow>(
		`SELECT guild_id, connect_channel_id, report_channel_id, announce_channel_id,
		        mod_channel_id, role_ids, tier_overrides, council_role_id, enabled
		 FROM guild_config WHERE guild_id = $1`,
		[guildId]
	)
	const row = result.rows[0]
	return row ? mapConfig(row) : null
}

export async function listGuildConfigs(pool: Pool): Promise<GuildConfig[]> {
	const result = await pool.query<GuildConfigRow>(
		`SELECT guild_id, connect_channel_id, report_channel_id, announce_channel_id,
		        mod_channel_id, role_ids, tier_overrides, council_role_id, enabled
		 FROM guild_config ORDER BY guild_id ASC`
	)
	return result.rows.map(mapConfig)
}

export async function upsertGuildConfig(pool: Pool, config: GuildConfig): Promise<void> {
	await pool.query(
		`INSERT INTO guild_config (guild_id, connect_channel_id, report_channel_id,
		                           announce_channel_id, mod_channel_id, role_ids, tier_overrides,
		                           council_role_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (guild_id)
		 DO UPDATE SET connect_channel_id = EXCLUDED.connect_channel_id,
		               report_channel_id = EXCLUDED.report_channel_id,
		               announce_channel_id = EXCLUDED.announce_channel_id,
		               mod_channel_id = COALESCE(EXCLUDED.mod_channel_id, guild_config.mod_channel_id),
		               role_ids = EXCLUDED.role_ids,
		               tier_overrides = EXCLUDED.tier_overrides,
		               council_role_id = COALESCE(EXCLUDED.council_role_id, guild_config.council_role_id)`,
		[
			config.guildId,
			config.connectChannelId,
			config.reportChannelId,
			config.announceChannelId,
			config.modChannelId,
			JSON.stringify(config.roleIds),
			config.tierOverrides === null ? null : JSON.stringify(config.tierOverrides),
			config.councilRoleId,
		]
	)
}

// Kept separate from upsertGuildConfig on purpose: re-running /setup must never flip the
// global switch, so the upsert leaves `enabled` untouched and only this toggles it.
export async function setGuildEnabled(
	pool: Pool,
	guildId: string,
	enabled: boolean
): Promise<void> {
	await pool.query("UPDATE guild_config SET enabled = $2 WHERE guild_id = $1", [guildId, enabled])
}

// Upsert's COALESCE only fills a null council_role_id, so clearing needs its own setter.
export async function setCouncilRoleId(
	pool: Pool,
	guildId: string,
	councilRoleId: string | null
): Promise<void> {
	await pool.query("UPDATE guild_config SET council_role_id = $2 WHERE guild_id = $1", [
		guildId,
		councilRoleId,
	])
}
