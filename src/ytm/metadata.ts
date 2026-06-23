import { type ArtThumbnail, pickAlbumArt } from "@/ytm/album-art"
import { Innertube, YTNodes } from "youtubei.js"

export interface TrackMeta {
	videoId: string
	title: string
	artist: string
	album: string | null
	durationSec: number
	albumArtUrl: string | null
}

export interface RawTrackInfo {
	title: string
	author: string
	durationSec: number
	videoThumbnails: ArtThumbnail[]
	album: string | null
	artist: string | null
	albumArtThumbnails: ArtThumbnail[]
}

export type TrackInfoSource = (videoId: string) => Promise<RawTrackInfo | null>

export function buildTrackMeta(videoId: string, raw: RawTrackInfo, artSize: number): TrackMeta {
	const artist = raw.artist ?? raw.author
	const albumArtUrl = pickAlbumArt([...raw.albumArtThumbnails, ...raw.videoThumbnails], artSize)
	return {
		videoId,
		title: raw.title,
		artist,
		album: raw.album,
		durationSec: raw.durationSec,
		albumArtUrl,
	}
}

export async function fetchTrackMeta(
	source: TrackInfoSource,
	videoId: string,
	artSize: number
): Promise<TrackMeta | null> {
	try {
		const raw = await source(videoId)
		return raw ? buildTrackMeta(videoId, raw, artSize) : null
	} catch {
		return null
	}
}

interface RawThumbnail {
	url: string
	width?: number
	height?: number
}

interface InnertubeLike {
	music: { getInfo(id: string): Promise<unknown> }
}

interface BasicInfoLike {
	title?: string
	author?: string
	duration?: number
	thumbnail?: RawThumbnail[]
}

interface TrackInfoLike {
	basic_info: BasicInfoLike
	getUpNext(): Promise<{
		contents: {
			filterType(type: typeof YTNodes.PlaylistPanelVideo): YTNodes.PlaylistPanelVideo[]
		}
	}>
}

function toArtThumbnails(thumbnails: RawThumbnail[] | undefined): ArtThumbnail[] {
	return (thumbnails ?? []).map((t) => ({
		url: t.url,
		width: t.width ?? 0,
		height: t.height ?? 0,
	}))
}

export function createYoutubeiSource(
	cookie: string | null,
	createInnertube: (cookie: string | null) => Promise<InnertubeLike> = (c) =>
		Innertube.create(c ? { cookie: c } : {})
): TrackInfoSource {
	return async (videoId) => {
		const yt = await createInnertube(cookie)
		const info = (await yt.music.getInfo(videoId)) as TrackInfoLike
		const basic = info.basic_info

		const panel = await info.getUpNext()
		const current = panel.contents.filterType(YTNodes.PlaylistPanelVideo).find((v) => v.selected)

		return {
			title: basic.title ?? "",
			author: basic.author ?? "",
			durationSec: basic.duration ?? 0,
			videoThumbnails: toArtThumbnails(basic.thumbnail),
			album: current?.album?.name ?? null,
			artist: current?.artists?.[0]?.name ?? null,
			albumArtThumbnails: toArtThumbnails(current?.thumbnail),
		}
	}
}
