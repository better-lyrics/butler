import {
	modsModalTitle,
	modsPublicNotice,
	modsQuestionExperience,
	modsQuestionExtra,
	modsQuestionHours,
	modsQuestionScenario,
	modsQuestionWhy,
	modsScenarioPrompt,
} from "@/copy/strings"
import type { ModAnswers } from "@/db/mod-sessions"
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js"

const QUESTIONS = [
	{
		id: "why",
		label: modsQuestionWhy,
		style: TextInputStyle.Paragraph,
		max: 800,
		required: true,
		placeholder: modsPublicNotice,
	},
	{ id: "hours", label: modsQuestionHours, style: TextInputStyle.Short, max: 100, required: true },
	{
		id: "experience",
		label: modsQuestionExperience,
		style: TextInputStyle.Paragraph,
		max: 800,
		required: true,
	},
	{
		id: "scenario",
		label: modsQuestionScenario,
		style: TextInputStyle.Paragraph,
		max: 800,
		required: true,
		placeholder: modsScenarioPrompt,
	},
	{
		id: "extra",
		label: modsQuestionExtra,
		style: TextInputStyle.Paragraph,
		max: 400,
		required: false,
	},
] as const satisfies readonly {
	id: keyof ModAnswers
	label: string
	style: TextInputStyle
	max: number
	required: boolean
	placeholder?: string
}[]

export function buildModsApplyModal(submitId: string, existing: ModAnswers | null): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(submitId)
		.setTitle(modsModalTitle)
		.addComponents(
			QUESTIONS.map((q) => {
				const input = new TextInputBuilder()
					.setCustomId(q.id)
					.setLabel(q.label)
					.setStyle(q.style)
					.setRequired(q.required)
					.setMaxLength(q.max)
				if ("placeholder" in q) input.setPlaceholder(q.placeholder)
				const value = existing?.[q.id]
				if (value) input.setValue(value)
				return new ActionRowBuilder<TextInputBuilder>().addComponents(input)
			})
		)
}

export function readModsAnswers(fields: { getTextInputValue(id: string): string }): ModAnswers {
	const read = (id: keyof ModAnswers) => fields.getTextInputValue(id).trim()
	return {
		why: read("why"),
		hours: read("hours"),
		experience: read("experience"),
		scenario: read("scenario"),
		extra: read("extra") || null,
	}
}
