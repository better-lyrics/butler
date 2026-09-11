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

export type QueueSort = "top-rated" | "most-voted"

export interface QueueEntry {
	id: number
	videoId: string
	song: string
	artist: string
	format: string
	score: number
	voteCount: number
	submitterName: string | null
	ttmlSignals: string[]
}

export type QueueResult =
	| { status: "ok"; entries: QueueEntry[] }
	| { status: "error"; code: number }

export type RejectResult =
	| { status: "rejected" }
	| { status: "not_council" }
	| { status: "not_found" }
	| { status: "already_rejected" }
	| { status: "error"; code: number }

export type UnrejectResult =
	| { status: "unrejected" }
	| { status: "not_council" }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type ExamAttemptState = "in_progress" | "pending_review" | "failed" | "approved" | "rejected"

export interface ExamAttempt {
	state: ExamAttemptState
	score: number | null
	submittedAt: number | null
}

export type ExamStartResult =
	| { status: "eligible"; examUrl: string; expiresAt: number }
	| { status: "already_attempted"; attempt: ExamAttempt }
	| { status: "not_found" }
	| { status: "error"; code: number }

export interface ExamBreakdownRow {
	section: string
	score: number
	max: number
}

export interface ExamApplicant {
	applicantId: string
	discordId: string
	keyId: string
	displayName: string
	score: number
	maxScore: number
	cutoff: number
	breakdown: ExamBreakdownRow[]
	submittedAt: number
	state: ExamAttemptState
}

export type ExamApplicantsResult =
	| { status: "ok"; applicants: ExamApplicant[] }
	| { status: "error"; code: number }

export type ExamDecision = "approve" | "reject"

export type ExamDecisionResult =
	| { status: "recorded" }
	| { status: "not_found" }
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
	getLyricsQueue(sort?: QueueSort, limit?: number): Promise<QueueResult>
	rejectLyric(lyricsId: string, keyId: string, note?: string): Promise<RejectResult>
	unrejectLyric(lyricsId: string, keyId: string): Promise<UnrejectResult>
	startExam(keyId: string, discordId: string): Promise<ExamStartResult>
	getExamApplicants(includeBelowCutoff?: boolean): Promise<ExamApplicantsResult>
	decideExamApplicant(
		applicantId: string,
		decision: ExamDecision,
		deciderDiscordId: string
	): Promise<ExamDecisionResult>
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

interface QueueRow {
	id: number
	videoId: string
	song: string
	artist: string
	format: string
	score: number
	voteCount: number
	submitter?: { displayName?: string | null } | null
	ttmlSignals?: string[]
}

interface QueueResponse {
	success: boolean
	data: QueueRow[]
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

const EXAM_STATES: ExamAttemptState[] = [
	"in_progress",
	"pending_review",
	"failed",
	"approved",
	"rejected",
]

function isExamState(value: unknown): value is ExamAttemptState {
	return typeof value === "string" && (EXAM_STATES as string[]).includes(value)
}

function parseExamApplicant(value: unknown): ExamApplicant | null {
	if (!value || typeof value !== "object") return null
	const row = value as Record<string, unknown>
	const breakdown: ExamBreakdownRow[] = Array.isArray(row.breakdown)
		? row.breakdown.map((b) => {
				const r = (b ?? {}) as Record<string, unknown>
				return {
					section: String(r.section ?? ""),
					score: Number(r.score) || 0,
					max: Number(r.max) || 0,
				}
			})
		: []
	return {
		applicantId: String(row.applicantId ?? ""),
		discordId: String(row.discordId ?? ""),
		keyId: String(row.keyId ?? ""),
		displayName: String(row.displayName ?? ""),
		score: Number(row.score) || 0,
		maxScore: Number(row.maxScore) || 0,
		cutoff: Number(row.cutoff) || 0,
		breakdown,
		submittedAt: Number(row.submittedAt) || 0,
		state: isExamState(row.state) ? row.state : "pending_review",
	}
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

		async getLyricsQueue(sort, limit) {
			const params = new URLSearchParams()
			if (sort) params.set("sort", sort)
			if (typeof limit === "number") params.set("limit", String(limit))
			const query = params.toString()
			const res = await doFetch(`${baseUrl}/lyrics/queue/bot${query ? `?${query}` : ""}`, {
				headers: authHeaders,
			})
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const json = (await res.json().catch(() => null)) as QueueResponse | null
			if (!json || !Array.isArray(json.data)) {
				return { status: "error", code: res.status }
			}
			const entries = json.data.map((row) => ({
				id: row.id,
				videoId: row.videoId,
				song: row.song,
				artist: row.artist,
				format: row.format,
				score: row.score,
				voteCount: row.voteCount,
				submitterName: row.submitter?.displayName ?? null,
				ttmlSignals: Array.isArray(row.ttmlSignals) ? row.ttmlSignals : [],
			}))
			return { status: "ok", entries }
		},

		async rejectLyric(lyricsId, keyId, note) {
			const res = await doFetch(`${baseUrl}/lyrics/${encodeURIComponent(lyricsId)}/reject/bot`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify(note ? { keyId, note } : { keyId }),
			})
			if (res.ok) {
				return { status: "rejected" }
			}
			switch (await errorCode(res)) {
				case "NOT_COMMITTEE":
					return { status: "not_council" }
				case "NOT_FOUND":
					return { status: "not_found" }
				case "REJECT_ALREADY_ACTIVE":
					return { status: "already_rejected" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async unrejectLyric(lyricsId, keyId) {
			const res = await doFetch(`${baseUrl}/lyrics/${encodeURIComponent(lyricsId)}/reject/bot`, {
				method: "DELETE",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId }),
			})
			if (res.ok) {
				return { status: "unrejected" }
			}
			switch (await errorCode(res)) {
				case "NOT_COMMITTEE":
					return { status: "not_council" }
				case "NOT_FOUND":
					return { status: "not_found" }
				default:
					return { status: "error", code: res.status }
			}
		},

		async startExam(keyId, discordId) {
			const res = await doFetch(`${baseUrl}/exam/bot/start`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ keyId, discordId }),
			})
			if (res.ok) {
				const { data } = (await res.json().catch(() => ({}))) as {
					data?: Record<string, unknown>
				}
				if (
					data?.status === "eligible" &&
					typeof data.examUrl === "string" &&
					typeof data.expiresAt === "number"
				) {
					return { status: "eligible", examUrl: data.examUrl, expiresAt: data.expiresAt }
				}
				if (data?.status === "already_attempted") {
					const attempt = (data.attempt ?? {}) as Record<string, unknown>
					if (isExamState(attempt.state)) {
						return {
							status: "already_attempted",
							attempt: {
								state: attempt.state,
								score: typeof attempt.score === "number" ? attempt.score : null,
								submittedAt: typeof attempt.submittedAt === "number" ? attempt.submittedAt : null,
							},
						}
					}
				}
				return { status: "error", code: res.status }
			}
			if ((await errorCode(res)) === "NOT_FOUND") {
				return { status: "not_found" }
			}
			return { status: "error", code: res.status }
		},

		async getExamApplicants(includeBelowCutoff) {
			const query = includeBelowCutoff ? "?includeBelowCutoff=true" : ""
			const res = await doFetch(`${baseUrl}/exam/bot/applicants${query}`, { headers: authHeaders })
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const json = (await res.json().catch(() => null)) as {
				data?: { applicants?: unknown }
			} | null
			const list = json?.data?.applicants
			if (!Array.isArray(list)) {
				return { status: "error", code: res.status }
			}
			const applicants: ExamApplicant[] = []
			for (const row of list) {
				const parsed = parseExamApplicant(row)
				if (parsed) applicants.push(parsed)
			}
			return { status: "ok", applicants }
		},

		async decideExamApplicant(applicantId, decision, deciderDiscordId) {
			const res = await doFetch(
				`${baseUrl}/exam/bot/applicants/${encodeURIComponent(applicantId)}/decision`,
				{
					method: "POST",
					headers: { ...authHeaders, "Content-Type": "application/json" },
					body: JSON.stringify({ decision, deciderDiscordId }),
				}
			)
			if (res.ok) {
				return { status: "recorded" }
			}
			const code = await errorCode(res)
			if (code === "EXAM_SESSION_NOT_FOUND" || code === "NOT_FOUND") {
				return { status: "not_found" }
			}
			return { status: "error", code: res.status }
		},
	}
}
