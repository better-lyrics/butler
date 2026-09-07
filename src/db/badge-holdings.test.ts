import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { getBadgeHoldings, isSeeded, markSeeded, setBadgeHolding } from "./badge-holdings"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

describe("badge-holdings", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("getBadgeHoldings and setBadgeHolding", () => {
		it("returns an empty array for a member with no holdings", async () => {
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([])
		})

		it("inserts a holding and reads it back", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "first-blood",
				tier: 2,
				awardedAt: 1000,
			})
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([{ key: "first-blood", tier: 2 }])
		})

		it("reads back a null tier", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "special",
				tier: null,
				awardedAt: 1000,
			})
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([{ key: "special", tier: null }])
		})

		it("returns every recorded badge for the member", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 1,
				awardedAt: 1000,
			})
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "b",
				tier: 3,
				awardedAt: 2000,
			})
			const holdings = await getBadgeHoldings(pool, "d1", "g1")
			expect(holdings).toHaveLength(2)
			expect(holdings).toContainEqual({ key: "a", tier: 1 })
			expect(holdings).toContainEqual({ key: "b", tier: 3 })
		})
	})

	describe("upsert idempotence", () => {
		it("updates the tier on conflict without creating a duplicate row", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 1,
				awardedAt: 1000,
			})
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 4,
				awardedAt: 2000,
			})
			const holdings = await getBadgeHoldings(pool, "d1", "g1")
			expect(holdings).toEqual([{ key: "a", tier: 4 }])
		})
	})

	describe("isolation", () => {
		it("scopes holdings to the requested member", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 1,
				awardedAt: 1000,
			})
			await setBadgeHolding(pool, {
				discordId: "d2",
				guildId: "g1",
				badgeKey: "b",
				tier: 2,
				awardedAt: 1000,
			})
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([{ key: "a", tier: 1 }])
			expect(await getBadgeHoldings(pool, "d2", "g1")).toEqual([{ key: "b", tier: 2 }])
		})

		it("scopes holdings to the requested guild", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 1,
				awardedAt: 1000,
			})
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g2",
				badgeKey: "b",
				tier: 2,
				awardedAt: 1000,
			})
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([{ key: "a", tier: 1 }])
			expect(await getBadgeHoldings(pool, "d1", "g2")).toEqual([{ key: "b", tier: 2 }])
		})
	})

	describe("isSeeded and markSeeded", () => {
		it("is false before markSeeded and true after", async () => {
			expect(await isSeeded(pool, "d1", "g1")).toBe(false)
			await markSeeded(pool, "d1", "g1", 1000)
			expect(await isSeeded(pool, "d1", "g1")).toBe(true)
		})

		it("is idempotent across repeated marks", async () => {
			await markSeeded(pool, "d1", "g1", 1000)
			await markSeeded(pool, "d1", "g1", 2000)
			expect(await isSeeded(pool, "d1", "g1")).toBe(true)
		})

		it("scopes the seed marker per member and per guild", async () => {
			await markSeeded(pool, "d1", "g1", 1000)
			expect(await isSeeded(pool, "d2", "g1")).toBe(false)
			expect(await isSeeded(pool, "d1", "g2")).toBe(false)
		})

		it("marks a member seeded independently of whether they hold any badges", async () => {
			await markSeeded(pool, "d1", "g1", 1000)
			expect(await isSeeded(pool, "d1", "g1")).toBe(true)
			expect(await getBadgeHoldings(pool, "d1", "g1")).toEqual([])
		})

		it("does not seed a member merely because they hold a badge", async () => {
			await setBadgeHolding(pool, {
				discordId: "d1",
				guildId: "g1",
				badgeKey: "a",
				tier: 1,
				awardedAt: 1000,
			})
			expect(await isSeeded(pool, "d1", "g1")).toBe(false)
		})
	})
})
