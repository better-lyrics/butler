import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { deleteHolding, getAllHoldings, setHolding } from "./holdings"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

describe("holdings", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("setHolding and getAllHoldings", () => {
		it("sets a holding and getAll returns a Map of discordId to tier", async () => {
			await setHolding(pool, "d1", "g1", "gold", 1000)
			const holdings = await getAllHoldings(pool, "g1")
			expect(holdings).toBeInstanceOf(Map)
			expect(holdings.get("d1")).toBe("gold")
			expect(holdings.size).toBe(1)
		})

		it("returns multiple holdings for a guild", async () => {
			await setHolding(pool, "d1", "g1", "gold", 1000)
			await setHolding(pool, "d2", "g1", "silver", 1000)
			const holdings = await getAllHoldings(pool, "g1")
			expect(holdings.get("d1")).toBe("gold")
			expect(holdings.get("d2")).toBe("silver")
			expect(holdings.size).toBe(2)
		})

		it("scopes holdings to the requested guild", async () => {
			await setHolding(pool, "d1", "g1", "gold", 1000)
			await setHolding(pool, "d1", "g2", "silver", 1000)
			const g1 = await getAllHoldings(pool, "g1")
			const g2 = await getAllHoldings(pool, "g2")
			expect(g1.get("d1")).toBe("gold")
			expect(g2.get("d1")).toBe("silver")
		})
	})

	describe("upsert", () => {
		it("updates the tier for an existing (discord_id, guild_id) pair", async () => {
			await setHolding(pool, "d1", "g1", "gold", 1000)
			await setHolding(pool, "d1", "g1", "platinum", 2000)
			const holdings = await getAllHoldings(pool, "g1")
			expect(holdings.get("d1")).toBe("platinum")
			expect(holdings.size).toBe(1)
		})
	})

	describe("deleteHolding", () => {
		it("removes a holding", async () => {
			await setHolding(pool, "d1", "g1", "gold", 1000)
			await deleteHolding(pool, "d1", "g1")
			const holdings = await getAllHoldings(pool, "g1")
			expect(holdings.has("d1")).toBe(false)
		})

		it("treats deleting a non-existent holding as a no-op", async () => {
			await expect(deleteHolding(pool, "missing", "g1")).resolves.toBeUndefined()
		})
	})

	describe("edge cases", () => {
		it("returns an empty Map for a guild with no holdings", async () => {
			const holdings = await getAllHoldings(pool, "empty-guild")
			expect(holdings).toBeInstanceOf(Map)
			expect(holdings.size).toBe(0)
		})
	})
})
