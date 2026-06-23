import type { TierConfig } from "@/roles/tiers"

export interface Config {
	discordBotToken: string
	databaseUrl: string
	unison: { baseUrl: string; botSecret: string }
	linkPageUrl: string
	composerBaseUrl: string
	ytmCookie: string | null
	devGuildId: string | null
}

const DEFAULT_UNISON_API_BASE_URL = "https://unison.boidu.dev"
const DEFAULT_LINK_PAGE_URL = "https://unison.boidu.dev/link"
const DEFAULT_COMPOSER_BASE_URL = "https://composer.betterlyrics.org"

function required(env: Record<string, string | undefined>, name: string): string {
	const value = env[name]
	if (value === undefined || value === "") {
		throw new Error(`Missing required env var: ${name}`)
	}
	return value
}

function withDefault(
	env: Record<string, string | undefined>,
	name: string,
	fallback: string
): string {
	const value = env[name]
	return value === undefined || value === "" ? fallback : value
}

export function loadConfig(env: Record<string, string | undefined>): Config {
	const ytmCookie = env.YTM_COOKIE
	const devGuildId = env.DEV_GUILD_ID

	return {
		discordBotToken: required(env, "DISCORD_BOT_TOKEN"),
		databaseUrl: required(env, "DATABASE_URL"),
		unison: {
			baseUrl: withDefault(env, "UNISON_API_BASE_URL", DEFAULT_UNISON_API_BASE_URL),
			botSecret: required(env, "BUTLER_BOT_SECRET"),
		},
		linkPageUrl: withDefault(env, "LINK_PAGE_URL", DEFAULT_LINK_PAGE_URL),
		composerBaseUrl: withDefault(env, "COMPOSER_BASE_URL", DEFAULT_COMPOSER_BASE_URL),
		ytmCookie: ytmCookie === undefined || ytmCookie === "" ? null : ytmCookie,
		devGuildId: devGuildId === undefined || devGuildId === "" ? null : devGuildId,
	}
}

export const TIERS: TierConfig = {
	podium: ["legendary", "grandmaster", "master"],
	special: { topPercent: 5, tier: "elite" },
	base: { topPercent: 20, tier: "lyricist" },
}

export const TIER_ORDER: string[] = ["lyricist", "elite", "master", "grandmaster", "legendary"]

export const SYNC_INTERVAL_MS = 60 * 60 * 1000

export const ALBUM_ART_SIZE = 1024

export const PALETTE = {
	betterLyricsRed: 0xf20c33,
	composerAccent: 0x818cf8,
	composerDark: 0x1a1a1c,
}
