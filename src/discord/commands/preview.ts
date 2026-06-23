import type { CardPayload } from "@/discord/components/connect-card"
import { buildConnectCard } from "@/discord/components/connect-card"
import { buildPromotionCard } from "@/discord/components/promotion-card"
import { type ReportMeta, buildReportCard } from "@/discord/components/report-card"
import { composerLink } from "@/discord/flows/report"
import type { TrackMeta } from "@/ytm/metadata"
import { parseYtmVideoId } from "@/ytm/parse-url"
import {
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js"

export const PREVIEW_GUILD_ONLY = "This command can only be used in a server."
export const PREVIEW_NO_PERMISSION = "You need the Manage Server permission to run this."

/** A real YTM track used as the default stub for report-card previews. */
export const PREVIEW_STUB_VIDEO_ID = "os0y0RmiIKI"

interface SampleStats {
	rank: number
	submissionCount: number
	totalUpvotes: number
}

const DEFAULT_STATS: SampleStats = { rank: 1, submissionCount: 312, totalUpvotes: 4821 }

const SAMPLE_STATS: Record<string, SampleStats> = {
	legendary: DEFAULT_STATS,
	grandmaster: { rank: 2, submissionCount: 264, totalUpvotes: 3940 },
	master: { rank: 3, submissionCount: 198, totalUpvotes: 2715 },
	elite: { rank: 7, submissionCount: 121, totalUpvotes: 1408 },
	lyricist: { rank: 28, submissionCount: 36, totalUpvotes: 412 },
}

export const previewCommand = new SlashCommandBuilder()
	.setName("preview")
	.setDescription("Preview a butler card without waiting for a real trigger")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addStringOption((o) =>
		o
			.setName("card")
			.setDescription("Which card to preview")
			.setRequired(true)
			.addChoices(
				{ name: "connect", value: "connect" },
				{ name: "report", value: "report" },
				{ name: "report (blocked)", value: "report_blocked" },
				{ name: "promotion", value: "promotion" }
			)
	)
	.addStringOption((o) =>
		o
			.setName("tier")
			.setDescription("Tier for the promotion card")
			.setRequired(false)
			.addChoices(
				{ name: "#1 Legendary", value: "legendary" },
				{ name: "#2 Grandmaster", value: "grandmaster" },
				{ name: "#3 Master", value: "master" },
				{ name: "Elite", value: "elite" },
				{ name: "Lyricist", value: "lyricist" }
			)
	)
	.addStringOption((o) =>
		o
			.setName("link")
			.setDescription("YTM link for the report card (defaults to a stub track)")
			.setRequired(false)
	)

export interface PreviewParams {
	card: string
	tier: string
	userId: string
	avatarUrl: string
	meta: ReportMeta | null
	videoId: string
	linkPageUrl: string
	composerUrl: string
}

const EPHEMERAL_V2 = [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]

function withEphemeral(card: CardPayload): CardPayload {
	return { components: card.components, flags: EPHEMERAL_V2 }
}

export function buildPreviewCard(params: PreviewParams): CardPayload {
	switch (params.card) {
		case "connect":
			return withEphemeral(buildConnectCard({ linkPageUrl: params.linkPageUrl }))
		case "report":
			return withEphemeral(
				buildReportCard({
					videoId: params.videoId,
					posterId: params.userId,
					meta: params.meta,
					composerUrl: params.composerUrl,
				})
			)
		case "report_blocked":
			return withEphemeral(
				buildReportCard({
					videoId: params.videoId,
					posterId: params.userId,
					meta: null,
					composerUrl: params.composerUrl,
				})
			)
		default: {
			const stats = SAMPLE_STATS[params.tier] ?? DEFAULT_STATS
			return withEphemeral(
				buildPromotionCard({
					discordId: params.userId,
					avatarUrl: params.avatarUrl,
					tier: params.tier,
					rank: stats.rank,
					submissionCount: stats.submissionCount,
					totalUpvotes: stats.totalUpvotes,
				})
			)
		}
	}
}

export interface PreviewDeps {
	linkPageUrl: string
	composerBaseUrl: string
	fetchMeta(videoId: string): Promise<TrackMeta | null>
}

export async function handlePreview(
	interaction: ChatInputCommandInteraction,
	deps: PreviewDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply({ content: PREVIEW_GUILD_ONLY, flags: MessageFlags.Ephemeral })
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({ content: PREVIEW_NO_PERMISSION, flags: MessageFlags.Ephemeral })
		return
	}

	const card = interaction.options.getString("card", true)
	const tier = interaction.options.getString("tier", false) ?? "legendary"
	const link = interaction.options.getString("link", false)
	const videoId = (link ? parseYtmVideoId(link) : null) ?? PREVIEW_STUB_VIDEO_ID

	const track = card === "report" ? await deps.fetchMeta(videoId) : null
	const meta: ReportMeta | null = track
		? { title: track.title, artist: track.artist, albumArtUrl: track.albumArtUrl }
		: null
	const composerUrl = composerLink(deps.composerBaseUrl, videoId, track)

	const payload = buildPreviewCard({
		card,
		tier,
		userId: interaction.user.id,
		avatarUrl: interaction.user.displayAvatarURL(),
		meta,
		videoId,
		linkPageUrl: deps.linkPageUrl,
		composerUrl,
	})

	await interaction.reply(payload)
}
