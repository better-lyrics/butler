import { readFileSync } from "node:fs"
import { Pool } from "pg"

export function createPool(databaseUrl: string): Pool {
	return new Pool({ connectionString: databaseUrl })
}

export async function applySchema(pool: Pool): Promise<void> {
	const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
	await pool.query(sql)
}
