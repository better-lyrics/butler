import type { FlagCard } from "@/unison/client"

export function flagCase(overrides: Partial<FlagCard> = {}): FlagCard {
	return {
		id: 77,
		lyricsId: 4210,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		submitterName: "mukeenanyafiq",
		openedAt: 1_790_000_000,
		status: "open",
		decidedAt: null,
		reports: [
			{ reason: "spam", details: "Promo link in every line", createdAt: 1_789_999_000 },
			{ reason: "wrong_song", details: null, createdAt: 1_789_999_500 },
		],
		removals: 1,
		keeps: 0,
		...overrides,
	}
}
