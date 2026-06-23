import {
	alreadyAvailable,
	alreadyRequested,
	blockedMetadataFallback,
	notYourReport,
	requestAdded,
	requestFailed,
} from "@/copy/strings"
import { buildReportCard } from "@/discord/components/report-card"
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
 * Parses a YouTube Music link from the message, looks up its track metadata, and
 * replies with a report card carrying an add-to-board button and a fix-it link.
 */
export async function handleReportMessage(message: ReportMessage, deps: ReportDeps): Promise<void> {
	if (message.author.bot) return
	if (message.channelId !== deps.reportChannelId) return

	const videoId = parseYtmVideoId(message.content)
	const meta = videoId ? await deps.fetchMeta(videoId) : null
	const composerUrl = videoId
		? `${deps.composerBaseUrl}?videoId=${encodeURIComponent(videoId)}`
		: deps.composerBaseUrl

	await message.reply(
		buildReportCard({
			videoId: videoId ?? "",
			posterId: message.author.id,
			meta: meta ? { title: meta.title, artist: meta.artist, albumArtUrl: meta.albumArtUrl } : null,
			composerUrl,
		})
	)
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
export async function handleAddToBoard(
	interaction: AddToBoardInteraction,
	deps: AddToBoardDeps
): Promise<void> {
	const decoded = decodeCustomId(interaction.customId)
	if (!decoded || decoded.action !== "report.add") return

	const videoId = decoded.args[0]
	const posterId = decoded.args[1]
	if (!videoId || !posterId) return

	const allowed = interaction.user.id === posterId || (await deps.isMod(interaction.user.id))
	if (!allowed) {
		await interaction.reply({ content: notYourReport, flags: MessageFlags.Ephemeral })
		return
	}

	const meta = await deps.fetchMeta(videoId)
	if (!meta) {
		await interaction.reply({ content: blockedMetadataFallback, flags: MessageFlags.Ephemeral })
		return
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
}
