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
	reviewChannelId: string | null
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
	review_channel_id: string | null
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
		reviewChannelId: row.review_channel_id,
		enabled: row.enabled === true,
	}
}

export async function getGuildConfig(pool: Pool, guildId: string): Promise<GuildConfig | null> {
	const result = await pool.query<GuildConfigRow>(
		`SELECT guild_id, connect_channel_id, report_channel_id, announce_channel_id,
		        mod_channel_id, role_ids, tier_overrides, council_role_id, review_channel_id, enabled
		 FROM guild_config WHERE guild_id = $1`,
		[guildId]
	)
	const row = result.rows[0]
	return row ? mapConfig(row) : null
}

export async function listGuildConfigs(pool: Pool): Promise<GuildConfig[]> {
	const result = await pool.query<GuildConfigRow>(
		`SELECT guild_id, connect_channel_id, report_channel_id, announce_channel_id,
		        mod_channel_id, role_ids, tier_overrides, council_role_id, review_channel_id, enabled
		 FROM guild_config ORDER BY guild_id ASC`
	)
	return result.rows.map(mapConfig)
}

export async function upsertGuildConfig(pool: Pool, config: GuildConfig): Promise<void> {
	await pool.query(
		`INSERT INTO guild_config (guild_id, connect_channel_id, report_channel_id,
		                           announce_channel_id, mod_channel_id, role_ids, tier_overrides,
		                           council_role_id, review_channel_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (guild_id)
		 DO UPDATE SET connect_channel_id = EXCLUDED.connect_channel_id,
		               report_channel_id = EXCLUDED.report_channel_id,
		               announce_channel_id = EXCLUDED.announce_channel_id,
		               mod_channel_id = COALESCE(EXCLUDED.mod_channel_id, guild_config.mod_channel_id),
		               role_ids = EXCLUDED.role_ids,
		               tier_overrides = EXCLUDED.tier_overrides,
		               council_role_id = COALESCE(EXCLUDED.council_role_id, guild_config.council_role_id),
		               review_channel_id = COALESCE(EXCLUDED.review_channel_id, guild_config.review_channel_id)`,
		[
			config.guildId,
			config.connectChannelId,
			config.reportChannelId,
			config.announceChannelId,
			config.modChannelId,
			JSON.stringify(config.roleIds),
			config.tierOverrides === null ? null : JSON.stringify(config.tierOverrides),
			config.councilRoleId,
			config.reviewChannelId,
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

export type GuildTextField = "connect" | "report" | "announce" | "mod" | "council" | "review"

const TEXT_FIELD_UPSERT: Record<GuildTextField, string> = {
	connect:
		"INSERT INTO guild_config (guild_id, connect_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET connect_channel_id = EXCLUDED.connect_channel_id",
	report:
		"INSERT INTO guild_config (guild_id, report_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET report_channel_id = EXCLUDED.report_channel_id",
	announce:
		"INSERT INTO guild_config (guild_id, announce_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET announce_channel_id = EXCLUDED.announce_channel_id",
	mod: "INSERT INTO guild_config (guild_id, mod_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET mod_channel_id = EXCLUDED.mod_channel_id",
	council:
		"INSERT INTO guild_config (guild_id, council_role_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET council_role_id = EXCLUDED.council_role_id",
	review:
		"INSERT INTO guild_config (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id",
}

export async function setGuildField(
	pool: Pool,
	guildId: string,
	field: GuildTextField,
	value: string | null
): Promise<void> {
	await pool.query(TEXT_FIELD_UPSERT[field], [guildId, value])
}

const tierRoleWrites = new Map<string, Promise<unknown>>()

export async function setTierRole(
	pool: Pool,
	guildId: string,
	tier: string,
	roleId: string
): Promise<void> {
	const prior = tierRoleWrites.get(guildId) ?? Promise.resolve()
	const next = prior.then(() => writeTierRole(pool, guildId, tier, roleId))
	tierRoleWrites.set(
		guildId,
		next.catch(() => {})
	)
	return next
}

async function writeTierRole(
	pool: Pool,
	guildId: string,
	tier: string,
	roleId: string
): Promise<void> {
	const existing = await getGuildConfig(pool, guildId)
	const roleIds = { ...(existing?.roleIds ?? {}), [tier]: roleId }
	await pool.query(
		`INSERT INTO guild_config (guild_id, role_ids) VALUES ($1, $2)
		 ON CONFLICT (guild_id) DO UPDATE SET role_ids = EXCLUDED.role_ids`,
		[guildId, JSON.stringify(roleIds)]
	)
}
