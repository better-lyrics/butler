import type { BotRequestBody } from "@/requests/payload"

export type TierName = "lyricist" | "elite" | "master" | "grandmaster" | "legendary"

export interface BadgeRef {
	key: string
	name: string
	tier?: number
}

export interface LeaderboardEntry {
	keyId: string
	reputation: number
	score: number
	submissionCount: number
	totalUpvotes: number
	fulfilledCount: number
	fulfilledDemand: number
	rank: number
	community: boolean
	discordLinked: boolean
	tier: TierName | null
	level: number
	xp: number
	xpForNext: number | null
	badgeCount: number
	topBadge: BadgeRef | null
	featured: BadgeRef[]
	displayName: string
}

export interface BadgeImage {
	color: string
	mono: string
}

export interface BadgeDef {
	key: string
	name: string
	description: string
	category: string
	kind: "title" | "medal" | "special"
	tiers?: Array<{ level: number; name?: string; threshold: number; image?: BadgeImage }>
	secret?: boolean
	rarity?: number
	image: BadgeImage
}

export interface BadgeCatalogue {
	badges: BadgeDef[]
	display: {
		inlineGlyphs: number
		featuredMax: number
		rarityThreshold: number
		categoryOrder: string[]
	}
}

export interface UserBadge {
	key: string
	earned: boolean
	earnedAt?: number
	tier?: number
	progress?: { current: number; next: number | null }
	featured: boolean
}

export interface UserGamification {
	keyId: string
	level: number
	xp: number
	xpForNext: number | null
	tier: TierName | null
	tierRank: number | null
	badges: UserBadge[]
	featured: string[]
	counts: { earned: number; total: number }
	topExpertise?: Array<{ scope: "artist" | "language"; name: string; rank: number }>
}

export type BotRequestResult =
	| { status: "created"; demand: number; requestCount: number }
	| { status: "already_requested"; demand: number; requestCount: number }
	| { status: "already_available" }
	| { status: "error"; code: number }

export interface MigrationCounts {
	submissions: number
	votes: number
	reports: number
	fulfillments: number
	collisions: number
}

export interface MigrationMoved {
	submissions: number
	votes: number
	reports: number
	fulfillments: number
	collisionsDropped: number
}

export type MigrationStartResult =
	| { status: "started"; sessionId: string; oldKeyId: string }
	| { status: "not_linked" }
	| { status: "blacklisted" }
	| { status: "already_active" }
	| { status: "linking_disabled" }
	| { status: "error"; code: number }

export type MigrationSessionStatus =
	| "awaiting_new_key"
	| "ready"
	| "committed"
	| "failed"
	| "expired"

export interface MigrationStatus {
	status: MigrationSessionStatus
	oldKeyId: string
	newKeyId: string | null
	oldNickname: string | null
	newNickname: string | null
	oldDisplayName: string
	newDisplayName: string
	counts: MigrationCounts | null
}

export type MigrationStatusResult =
	| { status: "ok"; data: MigrationStatus }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type NicknameChoice = "old" | "new"

export type MigrationCommitResult =
	| { status: "committed"; migrationId: number; moved: MigrationMoved }
	| { status: "not_ready" }
	| { status: "not_owner" }
	| { status: "already_committed" }
	| { status: "expired" }
	| { status: "error"; code: number }

export interface BoostQuota {
	quota: number
	used: number
	remaining: number
	resetsAt: number
}

export interface LyricVariant {
	id: number
	song: string
	artist: string
	format: string
	score: number
	submitterName: string | null
}

export type LyricsVariantsResult =
	| { status: "ok"; variants: LyricVariant[] }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type SealResult =
	| { status: "sealed"; quota: BoostQuota }
	| { status: "not_council" }
	| { status: "not_found" }
	| { status: "self" }
	| { status: "target_council" }
	| { status: "over_quota" }
	| { status: "already_sealed" }
	| { status: "error"; code: number }

export type UnsealResult =
	| { status: "unsealed" }
	| { status: "not_council" }
	| { status: "not_found" }
	| { status: "not_owner" }
	| { status: "error"; code: number }

export type QuotaResult =
	| { status: "ok"; quota: BoostQuota }
	| { status: "not_council" }
	| { status: "unknown_user" }
	| { status: "error"; code: number }

export type CouncilAddResult =
	| { status: "added" }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type CouncilRemoveResult =
	| { status: "removed" }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type CouncilListResult =
	| { status: "ok"; keyIds: string[] }
	| { status: "error"; code: number }

export interface UnisonClientOptions {
	baseUrl: string
	botSecret: string
	fetch?: typeof fetch
}

export interface UnisonClient {
	getLeaderboard(): Promise<LeaderboardEntry[]>
	getUserBadges(keyId: string): Promise<UserGamification>
	getBadgeCatalogue(): Promise<BadgeCatalogue>
	getBotLinks(): Promise<Array<{ discordId: string; keyId: string }>>
	getBotBlacklist(): Promise<Set<string>>
	submitBotRequest(body: BotRequestBody): Promise<BotRequestResult>
	startMigration(discordId: string): Promise<MigrationStartResult>
	getMigrationStatus(sessionId: string): Promise<MigrationStatusResult>
	commitMigration(
		sessionId: string,
		discordId: string,
		keepNickname: NicknameChoice
	): Promise<MigrationCommitResult>
	getLyricsVariants(videoId: string): Promise<LyricsVariantsResult>
	boostLyrics(lyricsId: string, keyId: string): Promise<SealResult>
	unboostLyrics(lyricsId: string, keyId: string): Promise<UnsealResult>
	getBoostQuota(keyId: string): Promise<QuotaResult>
	addCouncilMember(keyId: string): Promise<CouncilAddResult>
	removeCouncilMember(keyId: string): Promise<CouncilRemoveResult>
	getCouncil(): Promise<CouncilListResult>
}

interface LeaderboardResponse {
	success: boolean
	data: { curators: LeaderboardEntry[] }
}

interface UserBadgesResponse {
	success: boolean
	data: UserGamification
}

interface BadgeCatalogueResponse {
	success: boolean
	data: BadgeCatalogue
}

interface BotLinksResponse {
	success: boolean
	data: { links: Array<{ discord_id: string; key_id: string }> }
}

interface BotBlacklistResponse {
	success: boolean
	data: { keyIds: string[] }
}

interface BotRequestData {
	status: string
	demand?: number
	requestCount?: number
}

interface BotRequestResponse {
	success: boolean
	data: BotRequestData
}

interface MigrationStartData {
	sessionId?: string
	oldKeyId?: string
}

interface MigrationCommitData {
	migrationId?: number
	moved?: MigrationMoved
}

async function errorCode(res: Response): Promise<string | null> {
	try {
		const body = (await res.json()) as { code?: string }
		return body.code ?? null
	} catch {
		return null
	}
}

interface VariantRow {
	id: number
	song: string
	artist: string
	format: string
	score: number
	submitter?: { displayName?: string | null } | null
}

interface VariantsResponse {
	success: boolean
	data: VariantRow[]
}

function parseBoostQuota(value: unknown): BoostQuota | null {
	if (!value || typeof value !== "object") return null
	const q = value as Record<string, unknown>
	if (
		typeof q.quota === "number" &&
		typeof q.used === "number" &&
		typeof q.remaining === "number" &&
		typeof q.resetsAt === "number"
	) {
		return { quota: q.quota, used: q.used, remaining: q.remaining, resetsAt: q.resetsAt }
	}
	return null
}

export function createUnisonClient(options: UnisonClientOptions): UnisonClient {
	const baseUrl = options.baseUrl.replace(/\/+$/, "")
	const doFetch = options.fetch ?? fetch
	const authHeaders = { Authorization: `Bearer ${options.botSecret}` }

	return {
		async getLeaderboard() {
			const res = await doFetch(`${baseUrl}/leaderboard/users`)
			if (!res.ok) {
				throw new Error(`Unison leaderboard fetch failed: ${res.status}`)
			}
			const json = (await res.json()) as LeaderboardResponse
			return json.data.curators
		},

		async getUserBadges(keyId) {
			const res = await doFetch(`${baseUrl}/users/${keyId}/badges`)
			if (!res.ok) {
				throw new Error(`Unison user badges fetch failed: ${res.status}`)
			}
			const json = (await res.json()) as UserBadgesResponse
			return json.data
		},

		async getBadgeCatalogue() {
			const res = await doFetch(`${baseUrl}/badges`)
			if (!res.ok) {
				throw new Error(`Unison badge catalogue fetch failed: ${res.status}`)
			}
			const json = (await res.json()) as BadgeCatalogueResponse
			return json.data
		},

		async getBotLinks() {
			const res = await doFetch(`${baseUrl}/links/bot/all`, { headers: authHeaders })
			if (!res.ok) {
				throw new Error(`Unison bot links fetch failed: ${res.status}`)
			}
			const json = (await res.json()) as BotLinksResponse
			return json.data.links.map((l) => ({ discordId: l.discord_id, keyId: l.key_id }))
		},

		async getBotBlacklist() {
			const res = await doFetch(`${baseUrl}/links/bot/blacklist`, { headers: authHeaders })
			if (!res.ok) {
				throw new Error(`Unison bot blacklist fetch failed: ${res.status}`)
			}
			const json = (await res.json()) as BotBlacklistResponse
			return new Set(json.data.keyIds)
		},

		async submitBotRequest(body) {
			const res = await doFetch(`${baseUrl}/requests/bot`, {
				method: "POST",
				headers: {
					...authHeaders,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			})

			if (!res.ok) {
				return { status: "error", code: res.status }
			}

			const json = (await res.json()) as BotRequestResponse
			const { status } = json.data

			if (status === "already_available") {
				return { status }
			}
			if (status === "created" || status === "already_requested") {
				return {
					status,
					demand: json.data.demand ?? 0,
					requestCount: json.data.requestCount ?? 0,
				}
			}

			return { status: "error", code: res.status }
		},

		async startMigration(discordId) {
			const res = await doFetch(`${baseUrl}/migrations/bot/start`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ discordId }),
			})
			if (res.ok) {
				const { data } = (await res.json()) as { data: MigrationStartData }
				if (data?.sessionId && data.oldKeyId) {
					return {
						status: "started",
						sessionId: data.sessionId,
						oldKeyId: data.oldKeyId,
					}
				}
				return { status: "error", code: res.status }
			}
			switch (await errorCode(res)) {
				case "NOT_LINKED":
					return { status: "not_linked" }
				case "LINK_BLACKLISTED":
					return { status: "blacklisted" }
				case "MIGRATION_ALREADY_ACTIVE":
					return { status: "already_active" }
				case "LINKING_DISABLED":
					return { status: "linking_disabled" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async getMigrationStatus(sessionId) {
			const res = await doFetch(`${baseUrl}/migrations/bot/${sessionId}`, {
				headers: authHeaders,
			})
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const { data } = (await res.json()) as { data: MigrationStatus }
			if (data?.status) {
				return { status: "ok", data }
			}
			return { status: "error", code: res.status }
		},

		async commitMigration(sessionId, discordId, keepNickname) {
			const res = await doFetch(`${baseUrl}/migrations/bot/${sessionId}/commit`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ discordId, keepNickname }),
			})
			if (res.ok) {
				const { data } = (await res.json()) as { data: MigrationCommitData }
				if (typeof data?.migrationId === "number" && data.moved) {
					return { status: "committed", migrationId: data.migrationId, moved: data.moved }
				}
				return { status: "error", code: res.status }
			}
			switch (await errorCode(res)) {
				case "MIGRATION_EXPIRED":
					return { status: "expired" }
				case "MIGRATION_ALREADY_COMMITTED":
					return { status: "already_committed" }
				case "MIGRATION_NOT_READY":
					return { status: "not_ready" }
				case "MIGRATION_NOT_OWNER":
					return { status: "not_owner" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async getLyricsVariants(videoId) {
			const res = await doFetch(`${baseUrl}/lyrics/variants/${encodeURIComponent(videoId)}`)
			if (res.status === 404) {
				return { status: "not_found" }
			}
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const json = (await res.json().catch(() => null)) as VariantsResponse | null
			if (!json || !Array.isArray(json.data)) {
				return { status: "error", code: res.status }
			}
			const variants = json.data.map((row) => ({
				id: row.id,
				song: row.song,
				artist: row.artist,
				format: row.format,
				score: row.score,
				submitterName: row.submitter?.displayName ?? null,
			}))
			return { status: "ok", variants }
		},

		async boostLyrics(lyricsId, keyId) {
			const res = await doFetch(`${baseUrl}/lyrics/${encodeURIComponent(lyricsId)}/boost/bot`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId }),
			})
			if (res.ok) {
				const { quota } = (await res.json().catch(() => ({}))) as { quota?: unknown }
				const parsed = parseBoostQuota(quota)
				return parsed ? { status: "sealed", quota: parsed } : { status: "error", code: res.status }
			}
			switch (await errorCode(res)) {
				case "NOT_COMMITTEE":
					return { status: "not_council" }
				case "NOT_FOUND":
					return { status: "not_found" }
				case "BOOST_SELF":
					return { status: "self" }
				case "BOOST_TARGET_COMMITTEE":
					return { status: "target_council" }
				case "BOOST_QUOTA_EXCEEDED":
					return { status: "over_quota" }
				case "BOOST_ALREADY_ACTIVE":
					return { status: "already_sealed" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async unboostLyrics(lyricsId, keyId) {
			const res = await doFetch(`${baseUrl}/lyrics/${encodeURIComponent(lyricsId)}/boost/bot`, {
				method: "DELETE",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId }),
			})
			if (res.ok) {
				return { status: "unsealed" }
			}
			switch (await errorCode(res)) {
				case "NOT_COMMITTEE":
					return { status: "not_council" }
				case "NOT_FOUND":
					return { status: "not_found" }
				case "BOOST_NOT_OWNER":
					return { status: "not_owner" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async getBoostQuota(keyId) {
			const res = await doFetch(
				`${baseUrl}/lyrics/boost/quota/bot?keyId=${encodeURIComponent(keyId)}`,
				{ headers: authHeaders }
			)
			if (res.ok) {
				const { quota } = (await res.json().catch(() => ({}))) as { quota?: unknown }
				const parsed = parseBoostQuota(quota)
				return parsed ? { status: "ok", quota: parsed } : { status: "error", code: res.status }
			}
			const code = await errorCode(res)
			if (code === "NOT_COMMITTEE") {
				return { status: "not_council" }
			}
			if (code === "NOT_FOUND") {
				return { status: "unknown_user" }
			}
			return { status: "error", code: res.status }
		},

		async addCouncilMember(keyId) {
			const res = await doFetch(`${baseUrl}/committee/bot`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId }),
			})
			if (res.ok) {
				return { status: "added" }
			}
			if ((await errorCode(res)) === "NOT_FOUND") {
				return { status: "not_found" }
			}
			return { status: "error", code: res.status }
		},

		async removeCouncilMember(keyId) {
			const res = await doFetch(`${baseUrl}/committee/bot`, {
				method: "DELETE",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId }),
			})
			if (res.ok) {
				return { status: "removed" }
			}
			if ((await errorCode(res)) === "NOT_FOUND") {
				return { status: "not_found" }
			}
			return { status: "error", code: res.status }
		},

		async getCouncil() {
			const res = await doFetch(`${baseUrl}/committee/bot`, { headers: authHeaders })
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const json = (await res.json().catch(() => null)) as { data?: { keyIds?: unknown } } | null
			const keyIds = json?.data?.keyIds
			if (!Array.isArray(keyIds)) {
				return { status: "error", code: res.status }
			}
			return { status: "ok", keyIds: keyIds.map(String) }
		},
	}
}
