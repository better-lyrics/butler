import type { CouncilRoleMember } from "@/roles/council-roles"
import type { Pool } from "pg"

export async function listCouncilRoleMembers(
	pool: Pool,
	guildId: string
): Promise<CouncilRoleMember[]> {
	const result = await pool.query<{ key_id: string; discord_id: string }>(
		"SELECT key_id, discord_id FROM council_role_member WHERE guild_id = $1 ORDER BY key_id, discord_id",
		[guildId]
	)
	return result.rows.map((row) => ({ keyId: row.key_id, discordId: row.discord_id }))
}

export async function replaceCouncilRoleMembers(
	pool: Pool,
	guildId: string,
	members: CouncilRoleMember[]
): Promise<void> {
	await pool.query("DELETE FROM council_role_member WHERE guild_id = $1", [guildId])
	for (const m of members) {
		await pool.query(
			`INSERT INTO council_role_member (guild_id, key_id, discord_id) VALUES ($1, $2, $3)
			 ON CONFLICT (guild_id, discord_id) DO NOTHING`,
			[guildId, m.keyId, m.discordId]
		)
	}
}

export async function hasCouncilWelcome(
	pool: Pool,
	guildId: string,
	discordId: string
): Promise<boolean> {
	const result = await pool.query(
		"SELECT 1 FROM council_welcome WHERE guild_id = $1 AND discord_id = $2",
		[guildId, discordId]
	)
	return result.rows.length > 0
}

export async function recordCouncilWelcome(
	pool: Pool,
	guildId: string,
	discordId: string,
	sentAt: number
): Promise<void> {
	await pool.query(
		`INSERT INTO council_welcome (guild_id, discord_id, sent_at) VALUES ($1, $2, $3)
		 ON CONFLICT (guild_id, discord_id) DO NOTHING`,
		[guildId, discordId, sentAt]
	)
}
