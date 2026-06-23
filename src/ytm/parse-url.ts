const YTM_WATCH = /https?:\/\/music\.youtube\.com\/watch\?[^\s]*\bv=([A-Za-z0-9_-]{11})/

export function parseYtmVideoId(text: string): string | null {
	const match = YTM_WATCH.exec(text)
	return match?.[1] ?? null
}
