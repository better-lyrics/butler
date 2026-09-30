import { PALETTE } from "@/config"
import {
	modsApplicationHeading,
	modsBoardClosedHeading,
	modsBoardClosedIntro,
	modsBoardEmpty,
	modsBoardHeading,
	modsBoardIntro,
	modsBoardLine,
	modsBoardMore,
	modsFinalSupport,
	modsPickBackButtonLabel,
	modsPickConfirm,
	modsPickGoButtonLabel,
	modsPickHeading,
	modsPickHelp,
	modsPickNoApplicants,
	modsPickOptionDescription,
	modsPickPlaceholder,
	modsPickReviewButtonLabel,
	modsPickUnlisted,
	modsQuestionExperience,
	modsQuestionExtra,
	modsQuestionHours,
	modsQuestionScenario,
	modsQuestionWhy,
	modsResultNotSelectedBody,
	modsResultNotSelectedHeading,
	modsResultSelectedBody,
	modsResultSelectedHeading,
	modsScenarioPrompt,
	modsSupportButtonLabel,
	modsWinnersHeading,
	modsWinnersLine,
} from "@/copy/strings"
import type { ModApplication } from "@/db/mod-sessions"
import { type ApplicantTally, pickPages, rankApplicants, supportBar } from "@/discord/mods/ballot"
import { encodeCustomId } from "@/interactions/custom-id"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	type MessageMentionOptions,
	SeparatorBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextDisplayBuilder,
} from "discord.js"
import type { CardPayload } from "./connect-card"
import { truncate } from "./truncate"

const FLAGS = MessageFlags.IsComponentsV2

const NO_MENTIONS: MessageMentionOptions = { parse: [] }

const MAX_LISTED = 25

const MAX_SELECT_LABEL = 100

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

function divider(): SeparatorBuilder {
	return new SeparatorBuilder().setDivider(true)
}

function card(container: ContainerBuilder, allowedMentions = NO_MENTIONS): CardPayload {
	return { components: [container], flags: FLAGS, allowedMentions }
}

export function buildModsBoardCard(opts: {
	open: boolean
	closesAt: number
	applicants: readonly ApplicantTally[]
}): CardPayload {
	const ranked = rankApplicants(opts.applicants)
	const top = ranked[0]?.support ?? 0
	const lines = ranked.slice(0, MAX_LISTED).map((a) =>
		modsBoardLine({
			rank: a.rank,
			discordId: a.discordId,
			bar: supportBar(a.support, top),
			support: a.support,
		})
	)
	if (ranked.length > MAX_LISTED) lines.push(modsBoardMore(ranked.length - MAX_LISTED))

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(opts.open ? modsBoardHeading : modsBoardClosedHeading))
		.addTextDisplayComponents(
			text(opts.open ? modsBoardIntro(new Date(opts.closesAt)) : modsBoardClosedIntro)
		)
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(text(lines.length > 0 ? lines.join("\n") : modsBoardEmpty))
	return card(container)
}

// Past this many lines the rest folds into the last one, so quote markers never outgrow the card.
const MAX_QUOTED_LINES = 12

function quote(answer: string, max: number): string {
	const lines = truncate(answer, max).split("\n")
	const kept = [
		...lines.slice(0, MAX_QUOTED_LINES - 1),
		lines.slice(MAX_QUOTED_LINES - 1).join(" "),
	].filter((line, i) => i < lines.length)
	return kept.map((line) => `> ${line}`).join("\n")
}

export function buildModsApplicationCard(opts: {
	application: ModApplication
	open: boolean
}): CardPayload {
	const { answers, discordId, sessionId, support } = opts.application
	const sections = [
		`**${modsQuestionWhy}**\n${quote(answers.why, 800)}`,
		`**${modsQuestionHours}**\n${quote(answers.hours, 100)}`,
		`**${modsQuestionExperience}**\n${quote(answers.experience, 800)}`,
		`**${modsQuestionScenario}** _${modsScenarioPrompt}_\n${quote(answers.scenario, 800)}`,
	]
	if (answers.extra) sections.push(`**${modsQuestionExtra}**\n${quote(answers.extra, 400)}`)

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(modsApplicationHeading(discordId)))
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(text(sections.join("\n\n")))

	if (opts.open) {
		container.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Primary)
					.setCustomId(encodeCustomId("mods.support", [sessionId, discordId]))
					.setLabel(modsSupportButtonLabel(support))
			)
		)
	} else {
		container
			.addSeparatorComponents(divider())
			.addTextDisplayComponents(text(modsFinalSupport(support)))
	}
	return card(container)
}

export function buildModsPickCard(opts: {
	sessionId: string
	applications: readonly ModApplication[]
}): CardPayload {
	const pages = pickPages(opts.applications)
	const listed = pages.reduce((sum, page) => sum + page.length, 0)

	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(modsPickHeading))
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(text(listed > 0 ? modsPickHelp : modsPickNoApplicants))

	pages.forEach((page, index) => {
		const options = page.map((a) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(truncate(a.displayName, MAX_SELECT_LABEL))
				.setDescription(modsPickOptionDescription(a.rank, a.support))
				.setValue(a.discordId)
				.setDefault(a.picked)
		)
		container.addActionRowComponents(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(encodeCustomId("mods.pick.select", [opts.sessionId, String(index)]))
					.setPlaceholder(modsPickPlaceholder)
					.setMinValues(0)
					.setMaxValues(options.length)
					.addOptions(options)
			)
		)
	})
	if (opts.applications.length > listed) {
		container.addTextDisplayComponents(text(modsPickUnlisted(opts.applications.length - listed)))
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setStyle(ButtonStyle.Primary)
				.setCustomId(encodeCustomId("mods.pick.review", [opts.sessionId]))
				.setLabel(modsPickReviewButtonLabel)
		)
	)
	return card(container)
}

export function buildModsPickConfirmCard(opts: {
	sessionId: string
	picked: string[]
	applicants: number
}): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(modsPickHeading))
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(
			text(modsPickConfirm({ picked: opts.picked, applicants: opts.applicants }))
		)
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Success)
					.setCustomId(encodeCustomId("mods.pick.go", [opts.sessionId]))
					.setLabel(modsPickGoButtonLabel),
				new ButtonBuilder()
					.setStyle(ButtonStyle.Secondary)
					.setCustomId(encodeCustomId("mods.pick.back", [opts.sessionId]))
					.setLabel(modsPickBackButtonLabel)
			)
		)
	return card(container)
}

export function buildModsWinnersCard(picked: string[]): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(modsWinnersHeading))
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(text(modsWinnersLine(picked)))
	return card(container, { parse: [], users: picked })
}

export function buildModsResultCard(selected: boolean): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(
			text(selected ? modsResultSelectedHeading : modsResultNotSelectedHeading)
		)
		.addSeparatorComponents(divider())
		.addTextDisplayComponents(text(selected ? modsResultSelectedBody : modsResultNotSelectedBody))
	return card(container)
}

export function buildModsNoticeCard(content: string): CardPayload {
	return card(
		new ContainerBuilder()
			.setAccentColor(PALETTE.betterLyricsRed)
			.addTextDisplayComponents(text(content))
	)
}
