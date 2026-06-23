import { ALBUM_ART_SIZE, PALETTE, SYNC_INTERVAL_MS, TIERS, TIER_ORDER, loadConfig } from "@/config"
import { describe, expect, it } from "vitest"

const REQUIRED_KEYS = [
	"DISCORD_BOT_TOKEN",
	"DATABASE_URL",
	"UNISON_API_BASE_URL",
	"BUTLER_BOT_SECRET",
	"LINK_PAGE_URL",
	"COMPOSER_BASE_URL",
] as const

function completeEnv(): Record<string, string | undefined> {
	return {
		DISCORD_BOT_TOKEN: "bot-token",
		DATABASE_URL: "postgres://localhost:5432/butler",
		UNISON_API_BASE_URL: "https://unison.example.com",
		BUTLER_BOT_SECRET: "bot-secret",
		LINK_PAGE_URL: "https://link.example.com",
		COMPOSER_BASE_URL: "https://composer.example.com",
	}
}

describe("loadConfig", () => {
	it("parses a complete env into the right nested shape", () => {
		const config = loadConfig(completeEnv())

		expect(config).toEqual({
			discordBotToken: "bot-token",
			databaseUrl: "postgres://localhost:5432/butler",
			unison: {
				baseUrl: "https://unison.example.com",
				botSecret: "bot-secret",
			},
			linkPageUrl: "https://link.example.com",
			composerBaseUrl: "https://composer.example.com",
			ytmCookie: null,
		})
	})
})

describe("loadConfig required vars", () => {
	for (const key of REQUIRED_KEYS) {
		it(`throws naming ${key} when it is absent`, () => {
			const env = completeEnv()
			delete env[key]
			expect(() => loadConfig(env)).toThrow(`Missing required env var: ${key}`)
		})

		it(`throws naming ${key} when it is empty`, () => {
			const env = completeEnv()
			env[key] = ""
			expect(() => loadConfig(env)).toThrow(`Missing required env var: ${key}`)
		})
	}
})

describe("loadConfig YTM_COOKIE", () => {
	it("yields ytmCookie null when absent", () => {
		const config = loadConfig(completeEnv())
		expect(config.ytmCookie).toBeNull()
	})

	it("yields ytmCookie null when empty", () => {
		const env = completeEnv()
		env.YTM_COOKIE = ""
		const config = loadConfig(env)
		expect(config.ytmCookie).toBeNull()
	})

	it("carries the cookie when present", () => {
		const env = completeEnv()
		env.YTM_COOKIE = "VISITOR_INFO1_LIVE=abc; SID=xyz"
		const config = loadConfig(env)
		expect(config.ytmCookie).toBe("VISITOR_INFO1_LIVE=abc; SID=xyz")
	})
})

describe("tunables", () => {
	it("exposes TIERS with the expected podium and percentages", () => {
		expect(TIERS.podium).toEqual(["legendary", "grandmaster", "master"])
		expect(TIERS.special).toEqual({ topPercent: 5, tier: "elite" })
		expect(TIERS.base).toEqual({ topPercent: 20, tier: "lyricist" })
	})

	it("orders tiers lowest to highest", () => {
		expect(TIER_ORDER).toEqual(["lyricist", "elite", "master", "grandmaster", "legendary"])
	})

	it("syncs hourly", () => {
		expect(SYNC_INTERVAL_MS).toBe(60 * 60 * 1000)
	})

	it("requests 1024px album art", () => {
		expect(ALBUM_ART_SIZE).toBe(1024)
	})

	it("exposes the palette colors", () => {
		expect(PALETTE.betterLyricsRed).toBe(0xf20c32)
		expect(PALETTE.composerAccent).toBe(0x818cf8)
		expect(PALETTE.composerDark).toBe(0x1a1a1c)
	})
})
