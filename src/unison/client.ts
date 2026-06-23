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
	}
}
