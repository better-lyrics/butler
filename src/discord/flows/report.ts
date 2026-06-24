import {
	alreadyAvailable,
	alreadyRequested,
	blockedMetadataFallback,
	notYourReport,
	requestAdded,
	requestFailed,
} from "@/copy/strings"
import { type ReportMeta, buildReportCard } from "@/discord/components/report-card"
import { decodeCustomId } from "@/interactions/custom-id"
import { buildBotRequestBody } from "@/requests/payload"
import type { BotRequestBody } from "@/requests/payload"
import type { BotRequestResult } from "@/unison/client"
import type { TrackMeta } from "@/ytm/metadata"
import { parseYtmVideoId } from "@/ytm/parse-url"
import { MessageFlags } from "discord.js"

/** Minimal shape of the channel message the report flow auto-cards. */
export interface ReportMessage {
	author: { id: string; bot: boolean }
	channelId: string
	content: string
	reply(payload: unknown): Promise<unknown>
}

/** Dependencies the auto-card report flow needs from the surrounding app. */
export interface ReportDeps {
	reportChannelId: string
	fetchMeta(videoId: string): Promise<TrackMeta | null>
	composerBaseUrl: string
}

/**
 * Auto-card a message posted in the report channel.
 *
 * Only responds when the message contains a YouTube Music link. Other messages
 * (plain chatter, non-YTM links) are ignored so the channel does not get spammed.
 * A valid link still posts a card even if metadata cannot be fetched.
 */
/**
 * Build the composer deep link with every param Better Lyrics sends (title, artist,
 * album, duration, videoId). videoId alone is enough; the rest prefill the composer.
 */
export function composerLink(base: string, videoId: string, meta: TrackMeta | null): string {
	const params = new URLSearchParams()
	if (meta) {
		params.set("title", meta.title)
		params.set("artist", meta.artist)
		if (meta.album) params.set("album", meta.album)
		params.set("duration", String(meta.durationSec))
	}
	params.set("videoId", videoId)
	return `${base}?${params.toString()}`
}

/** What the report flow carded, returned so the caller can log it. Null when ignored. */
export interface ReportOutcome {
	videoId: string
	posterId: string
	meta: ReportMeta | null
}

export async function handleReportMessage(
	message: ReportMessage,
	deps: ReportDeps
): Promise<ReportOutcome | null> {
	if (message.author.bot) return null
	if (message.channelId !== deps.reportChannelId) return null

	const videoId = parseYtmVideoId(message.content)
	if (!videoId) return null

	const meta = await deps.fetchMeta(videoId)
	const composerUrl = composerLink(deps.composerBaseUrl, videoId, meta)
	const reportMeta: ReportMeta | null = meta
		? { title: meta.title, artist: meta.artist, albumArtUrl: meta.albumArtUrl }
		: null

	await message.reply(
		buildReportCard({ videoId, posterId: message.author.id, meta: reportMeta, composerUrl })
	)

	return { videoId, posterId: message.author.id, meta: reportMeta }
}

/** Minimal shape of the add-to-board button interaction. */
export interface AddToBoardInteraction {
	user: { id: string }
	customId: string
	reply(payload: unknown): Promise<unknown>
}

/** Dependencies the add-to-board handler needs from the surrounding app. */
export interface AddToBoardDeps {
	isMod(userId: string): boolean | Promise<boolean>
	fetchMeta(videoId: string): Promise<TrackMeta | null>
	submitRequest(body: BotRequestBody): Promise<BotRequestResult>
}

function resultContent(result: BotRequestResult): string {
	switch (result.status) {
		case "created":
			return requestAdded({ demand: result.demand, requestCount: result.requestCount })
		case "already_requested":
			return alreadyRequested({ demand: result.demand, requestCount: result.requestCount })
		case "already_available":
			return alreadyAvailable
		case "error":
			return requestFailed
	}
}

/**
 * Handle a click on the report card's add-to-board button.
 *
 * Only the original poster or a mod may use it. Submits the request attributed
 * to the original poster and replies ephemerally with a humanized result.
 */
/** What a successful add-to-board did, returned so the caller can log it. Null when nothing was submitted. */
export interface AddToBoardOutcome {
	posterId: string
	title: string
	artist: string
	result: BotRequestResult
}

export async function handleAddToBoard(
	interaction: AddToBoardInteraction,
	deps: AddToBoardDeps
): Promise<AddToBoardOutcome | null> {
	const decoded = decodeCustomId(interaction.customId)
	if (!decoded || decoded.action !== "report.add") return null

	const videoId = decoded.args[0]
	const posterId = decoded.args[1]
	if (!videoId || !posterId) return null

	const allowed = interaction.user.id === posterId || (await deps.isMod(interaction.user.id))
	if (!allowed) {
		await interaction.reply({ content: notYourReport, flags: MessageFlags.Ephemeral })
		return null
	}

	const meta = await deps.fetchMeta(videoId)
	if (!meta) {
		await interaction.reply({ content: blockedMetadataFallback, flags: MessageFlags.Ephemeral })
		return null
	}

	const body = buildBotRequestBody(
		{ videoId, song: meta.title, artist: meta.artist, thumbnailUrl: meta.albumArtUrl },
		posterId
	)
	const result = await deps.submitRequest(body)

	await interaction.reply({
		content: resultContent(result),
		flags: MessageFlags.Ephemeral,
	})

	return { posterId, title: meta.title, artist: meta.artist, result }
}
