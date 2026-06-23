export interface ArtThumbnail {
	url: string
	width: number
	height: number
}

const ART_HOST = "googleusercontent.com"
const SIZE_PARAM = /=w\d{2,4}-h\d{2,4}/

function isAlbumArt(t: ArtThumbnail): boolean {
	return t.url.includes(ART_HOST)
}

function largestByWidth(thumbnails: ArtThumbnail[]): ArtThumbnail | null {
	return thumbnails.reduce<ArtThumbnail | null>(
		(best, t) => (!best || t.width > best.width ? t : best),
		null
	)
}

export function pickAlbumArt(thumbnails: ArtThumbnail[], size: number): string | null {
	const largestArt = largestByWidth(thumbnails.filter(isAlbumArt))
	if (largestArt) {
		return SIZE_PARAM.test(largestArt.url)
			? largestArt.url.replace(SIZE_PARAM, `=w${size}-h${size}`)
			: largestArt.url
	}
	return largestByWidth(thumbnails)?.url ?? null
}
