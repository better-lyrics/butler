import {
	sealAlreadyActive,
	sealBadVideo,
	sealError,
	sealNoVariants,
	sealNotCouncil,
	sealNotFound,
	sealNotOwner,
	sealOverQuota,
	sealQuotaHeading,
	sealQuotaSummary,
	sealResetsLine,
	sealSelf,
	sealSuccessBody,
	sealSuccessHeading,
	sealTargetCouncil,
	sealUnknownUser,
	unsealSuccessBody,
	unsealSuccessHeading,
} from "@/copy/strings"
import { buildConnectCard } from "@/discord/components/connect-card"
import {
	buildSealConfirmCard,
	buildSealPickerCard,
	buildSealResultCard,
} from "@/discord/components/seal-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type { LyricsVariantsResult, QuotaResult, SealResult, UnsealResult } from "@/unison/client"
import { parseYtmVideoId } from "@/ytm/parse-url"
import { SlashCommandBuilder } from "discord.js"

export const sealCommand = new SlashCommandBuilder()
	.setName("seal")
	.setDescription("Seal a lyric variant as council-approved")
	.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Seal a lyric variant")
			.addStringOption((o) =>
				o.setName("video").setDescription("YouTube Music link or video id").setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Lift a seal you placed")
			.addStringOption((o) =>
				o.setName("video").setDescription("YouTube Music link or video id").setRequired(true)
			)
	)
	.addSubcommand((s) => s.setName("quota").setDescription("Check your remaining seals this month"))

const BARE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function parseVideoIdInput(input: string): string | null {
	const trimmed = input.trim()
	return parseYtmVideoId(trimmed) ?? (BARE_VIDEO_ID.test(trimmed) ? trimmed : null)
}

/** Minimal shape of the /seal chat command interaction. */
export interface SealCommandInteraction {
	user: { id: string }
	options: {
		getSubcommand(): string
		getString(name: string, required?: boolean): string | null
	}
	reply(payload: unknown): Promise<unknown>
}

/** Minimal shape of a seal confirm interaction (select menu or button); both carry the lyricsId. */
export interface SealConfirmInteraction {
	user: { id: string }
	update(payload: unknown): Promise<unknown>
}

export interface SealCommandDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	getBoostQuota(keyId: string): Promise<QuotaResult>
	getVariants(videoId: string): Promise<LyricsVariantsResult>
	linkPageUrl: string
}

export interface SealPickDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	boostLyrics(lyricsId: string, keyId: string): Promise<SealResult>
	linkPageUrl: string
}

export interface SealUnpickDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	unboostLyrics(lyricsId: string, keyId: string): Promise<UnsealResult>
	linkPageUrl: string
}

export async function handleSeal(
	interaction: SealCommandInteraction,
	deps: SealCommandDeps
): Promise<void> {
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.reply(ephemeralCard(buildConnectCard({ linkPageUrl: deps.linkPageUrl })))
		return
	}

	const sub = interaction.options.getSubcommand()

	const quota = await deps.getBoostQuota(keyId)
	if (quota.status === "not_council") {
		await interaction.reply(ephemeralText(sealNotCouncil))
		return
	}
	if (quota.status === "unknown_user") {
		await interaction.reply(ephemeralText(sealUnknownUser))
		return
	}
	if (quota.status !== "ok") {
		await interaction.reply(ephemeralText(sealError))
		return
	}

	if (sub === "quota") {
		await interaction.reply(
			ephemeralCard(
				buildSealResultCard([
					sealQuotaHeading,
					sealQuotaSummary(quota.quota),
					sealResetsLine(quota.quota.resetsAt),
				])
			)
		)
		return
	}

	if (sub === "add" && quota.quota.remaining <= 0) {
		await interaction.reply(ephemeralText(sealOverQuota))
		return
	}

	const videoId = parseVideoIdInput(interaction.options.getString("video", true) ?? "")
	if (!videoId) {
		await interaction.reply(ephemeralText(sealBadVideo))
		return
	}

	const variants = await deps.getVariants(videoId)
	if (variants.status === "not_found") {
		await interaction.reply(ephemeralText(sealNoVariants))
		return
	}
	if (variants.status !== "ok" || variants.variants.length === 0) {
		await interaction.reply(ephemeralText(variants.status === "ok" ? sealNoVariants : sealError))
		return
	}

	const mode = sub === "remove" ? "remove" : "add"
	const [only, ...rest] = variants.variants
	if (only && rest.length === 0) {
		await interaction.reply(ephemeralCard(buildSealConfirmCard({ variant: only, mode })))
		return
	}
	await interaction.reply(ephemeralCard(buildSealPickerCard({ variants: variants.variants, mode })))
}

export async function handleSealPick(
	interaction: SealConfirmInteraction,
	lyricsId: string,
	deps: SealPickDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.update(buildSealResultCard([sealError]))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}

	const result = await deps.boostLyrics(lyricsId, keyId)
	switch (result.status) {
		case "sealed":
			await interaction.update(
				buildSealResultCard([
					sealSuccessHeading,
					sealSuccessBody,
					sealQuotaSummary(result.quota),
					sealResetsLine(result.quota.resetsAt),
				])
			)
			return
		case "not_council":
			await interaction.update(buildSealResultCard([sealNotCouncil]))
			return
		case "not_found":
			await interaction.update(buildSealResultCard([sealNotFound]))
			return
		case "self":
			await interaction.update(buildSealResultCard([sealSelf]))
			return
		case "target_council":
			await interaction.update(buildSealResultCard([sealTargetCouncil]))
			return
		case "over_quota":
			await interaction.update(buildSealResultCard([sealOverQuota]))
			return
		case "already_sealed":
			await interaction.update(buildSealResultCard([sealAlreadyActive]))
			return
		default:
			await interaction.update(buildSealResultCard([sealError]))
			return
	}
}

export async function handleSealUnpick(
	interaction: SealConfirmInteraction,
	lyricsId: string,
	deps: SealUnpickDeps
): Promise<void> {
	if (!lyricsId) {
		await interaction.update(buildSealResultCard([sealError]))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}

	const result = await deps.unboostLyrics(lyricsId, keyId)
	switch (result.status) {
		case "unsealed":
			await interaction.update(buildSealResultCard([unsealSuccessHeading, unsealSuccessBody]))
			return
		case "not_owner":
			await interaction.update(buildSealResultCard([sealNotOwner]))
			return
		case "not_found":
			await interaction.update(buildSealResultCard([sealNotFound]))
			return
		case "not_council":
			await interaction.update(buildSealResultCard([sealNotCouncil]))
			return
		default:
			await interaction.update(buildSealResultCard([sealError]))
			return
	}
}
