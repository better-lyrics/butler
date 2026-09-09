import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import {
	type GuildConfig,
	getGuildConfig,
	listGuildConfigs,
	setGuildEnabled,
	setGuildField,
	setTierRole,
	upsertGuildConfig,
} from "./guild-config"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function fullConfig(): GuildConfig {
	return {
		guildId: "g1",
		connectChannelId: "c1",
		reportChannelId: "c2",
		announceChannelId: "c3",
		modChannelId: "c4",
		roleIds: { gold: "r1", silver: "r2" },
		tierOverrides: { gold: 90 },
		councilRoleId: "council-role-1",
		reviewChannelId: "c5",
		enabled: false,
	}
}

describe("guild-config", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("upsert and get", () => {
		it("round-trips a full config including role_ids JSON", async () => {
			const config = fullConfig()
			await upsertGuildConfig(pool, config)
			expect(await getGuildConfig(pool, "g1")).toEqual(config)
		})

		it("round-trips null nullable text fields and null tier_overrides", async () => {
			const config: GuildConfig = {
				guildId: "g2",
				connectChannelId: null,
				reportChannelId: null,
				announceChannelId: null,
				modChannelId: null,
				roleIds: {},
				tierOverrides: null,
				councilRoleId: null,
				reviewChannelId: null,
				enabled: false,
			}
			await upsertGuildConfig(pool, config)
			expect(await getGuildConfig(pool, "g2")).toEqual(config)
		})

		it("updates an existing config on conflict", async () => {
			await upsertGuildConfig(pool, fullConfig())
			const updated: GuildConfig = {
				...fullConfig(),
				connectChannelId: "changed",
				roleIds: { gold: "x" },
			}
			await upsertGuildConfig(pool, updated)
			expect(await getGuildConfig(pool, "g1")).toEqual(updated)
		})

		it("keeps the council role sticky when a re-run omits it", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await upsertGuildConfig(pool, { ...fullConfig(), councilRoleId: null })
			expect((await getGuildConfig(pool, "g1"))?.councilRoleId).toBe("council-role-1")
		})

		it("keeps the mod channel sticky when a re-run omits it", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await upsertGuildConfig(pool, { ...fullConfig(), modChannelId: null })
			expect((await getGuildConfig(pool, "g1"))?.modChannelId).toBe("c4")
		})

		it("keeps the review channel sticky when a re-run omits it", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await upsertGuildConfig(pool, { ...fullConfig(), reviewChannelId: null })
			expect((await getGuildConfig(pool, "g1"))?.reviewChannelId).toBe("c5")
		})
	})

	describe("setGuildField", () => {
		it("sets a nullable text field without disturbing the rest of the config", async () => {
			await upsertGuildConfig(pool, { ...fullConfig(), councilRoleId: null })
			await setGuildField(pool, "g1", "council", "council-role-9")
			expect(await getGuildConfig(pool, "g1")).toEqual({
				...fullConfig(),
				councilRoleId: "council-role-9",
			})
		})

		it("clears a nullable text field, which the sticky upsert cannot do", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await setGuildField(pool, "g1", "mod", null)
			expect((await getGuildConfig(pool, "g1"))?.modChannelId).toBeNull()
		})

		it("creates the row when the guild has no config yet", async () => {
			await setGuildField(pool, "fresh", "connect", "connect-1")
			const config = await getGuildConfig(pool, "fresh")
			expect(config?.connectChannelId).toBe("connect-1")
			expect(config?.roleIds).toEqual({})
			expect(config?.enabled).toBe(false)
		})

		it("routes each field to its own column", async () => {
			await setGuildField(pool, "g1", "connect", "cc")
			await setGuildField(pool, "g1", "report", "rr")
			await setGuildField(pool, "g1", "announce", "aa")
			await setGuildField(pool, "g1", "mod", "mm")
			await setGuildField(pool, "g1", "council", "cr")
			await setGuildField(pool, "g1", "review", "rv")
			expect(await getGuildConfig(pool, "g1")).toMatchObject({
				connectChannelId: "cc",
				reportChannelId: "rr",
				announceChannelId: "aa",
				modChannelId: "mm",
				councilRoleId: "cr",
				reviewChannelId: "rv",
			})
		})
	})

	describe("setTierRole", () => {
		it("sets a single tier role, creating the row when missing", async () => {
			await setTierRole(pool, "fresh", "master", "role-m")
			expect((await getGuildConfig(pool, "fresh"))?.roleIds).toEqual({ master: "role-m" })
		})

		it("merges into existing tier roles without dropping the others", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await setTierRole(pool, "g1", "master", "role-m")
			expect((await getGuildConfig(pool, "g1"))?.roleIds).toEqual({
				gold: "r1",
				silver: "r2",
				master: "role-m",
			})
		})

		it("overwrites an existing tier without touching its siblings", async () => {
			await setTierRole(pool, "g1", "master", "old")
			await setTierRole(pool, "g1", "elite", "e1")
			await setTierRole(pool, "g1", "master", "new")
			expect((await getGuildConfig(pool, "g1"))?.roleIds).toEqual({ master: "new", elite: "e1" })
		})

		it("regression: concurrent writes for different tiers do not clobber each other", async () => {
			await Promise.all([
				setTierRole(pool, "g1", "gold", "r1"),
				setTierRole(pool, "g1", "silver", "r2"),
			])
			expect((await getGuildConfig(pool, "g1"))?.roleIds).toEqual({ gold: "r1", silver: "r2" })
		})
	})

	describe("listGuildConfigs", () => {
		it("returns an empty array when no configs exist", async () => {
			expect(await listGuildConfigs(pool)).toEqual([])
		})

		it("returns every config ordered by guild_id", async () => {
			const second = fullConfig()
			const first: GuildConfig = {
				guildId: "g0",
				connectChannelId: null,
				reportChannelId: null,
				announceChannelId: null,
				modChannelId: null,
				roleIds: {},
				tierOverrides: null,
				councilRoleId: null,
				reviewChannelId: null,
				enabled: false,
			}
			await upsertGuildConfig(pool, second)
			await upsertGuildConfig(pool, first)
			expect(await listGuildConfigs(pool)).toEqual([first, second])
		})
	})

	describe("setGuildEnabled", () => {
		it("flips the enabled flag without disturbing the rest of the config", async () => {
			await upsertGuildConfig(pool, fullConfig())
			expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(false)

			await setGuildEnabled(pool, "g1", true)
			expect(await getGuildConfig(pool, "g1")).toEqual({ ...fullConfig(), enabled: true })

			await setGuildEnabled(pool, "g1", false)
			expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(false)
		})

		it("survives a re-run of setup: upsert never resets the switch", async () => {
			await upsertGuildConfig(pool, fullConfig())
			await setGuildEnabled(pool, "g1", true)
			await upsertGuildConfig(pool, { ...fullConfig(), connectChannelId: "changed" })
			expect((await getGuildConfig(pool, "g1"))?.enabled).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("returns null for a missing guild", async () => {
			expect(await getGuildConfig(pool, "nope")).toBeNull()
		})

		it("reads a row inserted with the defaults: empty roles, disabled", async () => {
			await pool.query("INSERT INTO guild_config (guild_id) VALUES ($1)", ["bare"])
			const config = await getGuildConfig(pool, "bare")
			expect(config?.roleIds).toEqual({})
			expect(config?.tierOverrides).toBeNull()
			expect(config?.connectChannelId).toBeNull()
			expect(config?.councilRoleId).toBeNull()
			expect(config?.enabled).toBe(false)
		})
	})
})
