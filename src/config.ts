export interface Config {
	discordBotToken: string
	databaseUrl: string
	unison: { baseUrl: string; botSecret: string }
	linkPageUrl: string
	composerBaseUrl: string
	ytmCookie: string | null
	guildId: string
	announce: { batchThreshold: number }
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

function withDefaultNumber(
	env: Record<string, string | undefined>,
	name: string,
	fallback: number
): number {
	const value = env[name]
	if (value === undefined || value === "") return fallback
	const parsed = Number.parseInt(value, 10)
	return Number.isNaN(parsed) ? fallback : parsed
}

export function loadConfig(env: Record<string, string | undefined>): Config {
	const ytmCookie = env.YTM_COOKIE

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
		guildId: required(env, "GUILD_ID"),
		announce: { batchThreshold: withDefaultNumber(env, "ANNOUNCE_BATCH_THRESHOLD", 5) },
	}
}

export const TIER_ORDER: string[] = ["lyricist", "elite", "master", "grandmaster", "legendary"]

export const SYNC_INTERVAL_MS = 60 * 60 * 1000

export const REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

export const MIGRATE_COOLDOWN_MS = 15 * 1000

// keep in sync with unison sessionTtlSeconds (900s); the start-card expiry is derived from this
export const MIGRATE_SESSION_TTL_MS = 15 * 60 * 1000

// flip the idle start card this long before the ttl, while the interaction token is still valid
export const MIGRATE_EXPIRY_EDIT_LEAD_MS = 10 * 1000

export const ALBUM_ART_SIZE = 1024

export const PALETTE = {
	betterLyricsRed: 0xf20c33,
	composerAccent: 0x818cf8,
	composerDark: 0x1a1a1c,
}
