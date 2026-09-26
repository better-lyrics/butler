import { examReportNone } from "@/copy/strings"
import { buildApplicantReportCard } from "@/discord/components/exam-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type { ExamReportsResult } from "@/unison/client"
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import {
	COUNCIL_APPLICANTS_ERROR,
	COUNCIL_APPLICANTS_GUILD_ONLY,
	COUNCIL_APPLICANTS_NO_PERMISSION,
} from "./council-applicants"

export const councilReportCommand = new SlashCommandBuilder()
	.setName("council-report")
	.setDescription("Show someone's Council exam report")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addUserOption((o) => o.setName("user").setDescription("Whose report to show").setRequired(true))

export interface CouncilReportInteraction {
	guildId: string | null
	memberPermissions: { has(flag: bigint): boolean } | null
	options: { getUser(name: string, required: true): { id: string } }
	reply(payload: unknown): Promise<unknown>
	followUp(payload: unknown): Promise<unknown>
}

export interface CouncilReportDeps {
	getExamReports(discordId: string): Promise<ExamReportsResult>
}

export async function handleCouncilReport(
	interaction: CouncilReportInteraction,
	deps: CouncilReportDeps
): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_GUILD_ONLY))
		return
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_NO_PERMISSION))
		return
	}

	const discordId = interaction.options.getUser("user", true).id
	const result = await deps.getExamReports(discordId)
	if (result.status !== "ok") {
		await interaction.reply(ephemeralText(COUNCIL_APPLICANTS_ERROR))
		return
	}

	const [newest, ...older] = result.reports
	if (!newest) {
		await interaction.reply(ephemeralText(examReportNone(discordId)))
		return
	}
	await interaction.reply(ephemeralCard(buildApplicantReportCard(newest)))
	for (const report of older) {
		await interaction.followUp(ephemeralCard(buildApplicantReportCard(report)))
	}
}
