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
	| { status: "started"; sessionId: string; signUrl: string; oldKeyId: string }
	| { status: "not_linked" }
	| { status: "already_active" }
	| { status: "same_key" }
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
	counts: MigrationCounts | null
}

export type MigrationStatusResult =
	| { status: "ok"; data: MigrationStatus }
	| { status: "not_found" }
	| { status: "error"; code: number }

export type NicknameChoice = "old" | "new"

export type MigrationCommitResult =
	| { status: "committed"; migrationId: string; moved: MigrationMoved }
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
	status: string
	sessionId?: string
	signUrl?: string
	oldKeyId?: string
}

interface MigrationCommitData {
	status: string
	migrationId?: string
	moved?: MigrationMoved
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
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const { data } = (await res.json()) as { data: MigrationStartData }
			if (data.status === "started") {
				if (data.sessionId && data.signUrl && data.oldKeyId) {
					return {
						status: "started",
						sessionId: data.sessionId,
						signUrl: data.signUrl,
						oldKeyId: data.oldKeyId,
					}
				}
				return { status: "error", code: res.status }
			}
			if (
				data.status === "not_linked" ||
				data.status === "already_active" ||
				data.status === "same_key"
			) {
				return { status: data.status }
			}
			return { status: "error", code: res.status }
		},

		async getMigrationStatus(sessionId) {
			const res = await doFetch(`${baseUrl}/migrations/bot/${sessionId}`, {
				headers: authHeaders,
			})
			if (res.status === 404) {
				return { status: "not_found" }
			}
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const { data } = (await res.json()) as { data: MigrationStatus }
			return { status: "ok", data }
		},

		async commitMigration(sessionId, discordId, keepNickname) {
			const res = await doFetch(`${baseUrl}/migrations/bot/${sessionId}/commit`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ discordId, keepNickname }),
			})
			if (!res.ok) {
				return { status: "error", code: res.status }
			}
			const { data } = (await res.json()) as { data: MigrationCommitData }
			if (data.status === "committed") {
				if (data.migrationId && data.moved) {
					return { status: "committed", migrationId: data.migrationId, moved: data.moved }
				}
				return { status: "error", code: res.status }
			}
			if (
				data.status === "not_ready" ||
				data.status === "not_owner" ||
				data.status === "already_committed" ||
				data.status === "expired"
			) {
				return { status: data.status }
			}
			return { status: "error", code: res.status }
		},
	}
}
