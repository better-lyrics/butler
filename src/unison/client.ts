import type { BotRequestBody } from "@/requests/payload"

export interface LeaderboardEntry {
	keyId: string
	reputation: number
	score: number
	submissionCount: number
	totalUpvotes: number
	fulfilledCount: number
	fulfilledDemand: number
	rank: number
	displayName: string
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

export interface UnisonClientOptions {
	baseUrl: string
	botSecret: string
	fetch?: typeof fetch
}

export interface UnisonClient {
	getLeaderboard(): Promise<LeaderboardEntry[]>
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
}

interface LeaderboardResponse {
	success: boolean
	data: { curators: LeaderboardEntry[] }
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
	}
}
