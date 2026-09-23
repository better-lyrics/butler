export function ytmWatchUrl(videoId: string): string {
	return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}
