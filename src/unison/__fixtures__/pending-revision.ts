import type { PendingRevisionCard } from "@/unison/client"

const PREVIEW_LINES = [
	"@@ -9,3 +9,3 @@",
	" [00:35.20] We're no strangers to love",
	"-[00:39.04] You know the rules and so do I",
	"+[00:39.04] You know the rules and so do I (do I)",
	"-[00:43.12] A full commitment's what I'm thinking of",
	"+[00:43.12] A full commitment's what I'm thinkin' of",
]

export function pendingRevision(overrides: Partial<PendingRevisionCard> = {}): PendingRevisionCard {
	return {
		lyricsId: 4210,
		revisionId: 918,
		revNo: 3,
		liveRevNo: 2,
		videoId: "dQw4w9WgXcQ",
		song: "Never Gonna Give You Up",
		artist: "Rick Astley",
		format: "lrc",
		pendingReason: "large_text_drift",
		jevProbability: null,
		textDrift: 0.23,
		timingDrift: 0.04,
		author: { displayName: "mukeenanyafiq" },
		createdAt: 1_790_000_000,
		diffPreview: PREVIEW_LINES.join("\n"),
		diffFull: ["--- lyric 4210 rev 2", "+++ lyric 4210 rev 3", ...PREVIEW_LINES].join("\n"),
		...overrides,
	}
}
