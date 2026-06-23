export interface TrackMetaForRequest {
	videoId: string
	song: string
	artist: string
	thumbnailUrl?: string | null
}

export interface BotRequestBody {
	videoId: string
	song: string
	artist: string
	thumbnailUrl: string | null
	discordId: string
}

export function buildBotRequestBody(meta: TrackMetaForRequest, discordId: string): BotRequestBody {
	return {
		videoId: meta.videoId,
		song: meta.song,
		artist: meta.artist,
		thumbnailUrl: meta.thumbnailUrl ?? null,
		discordId,
	}
}
