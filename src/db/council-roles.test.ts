import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	hasCouncilWelcome,
	listCouncilRoleMembers,
	recordCouncilWelcome,
	replaceCouncilRoleMembers,
} from "./council-roles"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

describe("council role members", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	it("replaces and lists the members the last sync saw", async () => {
		await replaceCouncilRoleMembers(pool, "g1", [
			{ keyId: "key-a", discordId: "111" },
			{ keyId: "key-b", discordId: "222" },
		])
		await replaceCouncilRoleMembers(pool, "g1", [{ keyId: "key-b", discordId: "222" }])
		expect(await listCouncilRoleMembers(pool, "g1")).toEqual([{ keyId: "key-b", discordId: "222" }])
	})

	describe("edge cases", () => {
		it("keeps an old account awaiting revoke next to the member's new account", async () => {
			await replaceCouncilRoleMembers(pool, "g1", [
				{ keyId: "key-a", discordId: "111" },
				{ keyId: "key-a", discordId: "999" },
			])
			expect(await listCouncilRoleMembers(pool, "g1")).toHaveLength(2)
		})

		it("records an account once even if it appears twice", async () => {
			await replaceCouncilRoleMembers(pool, "g1", [
				{ keyId: "key-a", discordId: "111" },
				{ keyId: "key-b", discordId: "111" },
			])
			expect(await listCouncilRoleMembers(pool, "g1")).toEqual([
				{ keyId: "key-a", discordId: "111" },
			])
		})

		it("is empty before the first sync", async () => {
			expect(await listCouncilRoleMembers(pool, "g1")).toEqual([])
		})

		it("keeps guilds apart", async () => {
			await replaceCouncilRoleMembers(pool, "g1", [{ keyId: "key-a", discordId: "111" }])
			await replaceCouncilRoleMembers(pool, "g2", [])
			expect(await listCouncilRoleMembers(pool, "g1")).toHaveLength(1)
		})
	})
})

describe("council welcome log", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	it("remembers who got the welcome", async () => {
		expect(await hasCouncilWelcome(pool, "g1", "111")).toBe(false)
		await recordCouncilWelcome(pool, "g1", "111", 1_790_000_000_000)
		expect(await hasCouncilWelcome(pool, "g1", "111")).toBe(true)
		expect(await hasCouncilWelcome(pool, "g1", "222")).toBe(false)
	})

	describe("invariants", () => {
		it("records a welcome only once", async () => {
			await recordCouncilWelcome(pool, "g1", "111", 1)
			await recordCouncilWelcome(pool, "g1", "111", 2)
			const { rows } = await pool.query(
				"SELECT sent_at FROM council_welcome WHERE discord_id = '111'"
			)
			expect(rows.map((r) => Number(r.sent_at))).toEqual([1])
		})
	})
})
