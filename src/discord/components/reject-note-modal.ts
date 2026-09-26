import { queueRejectNoteLabel } from "@/copy/strings"
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js"

const NOTE_INPUT = "note"

export const REJECT_NOTE_MAX_LENGTH = 300

export function buildRejectNoteModal(submitId: string, title: string): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(submitId)
		.setTitle(title)
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(NOTE_INPUT)
					.setLabel(queueRejectNoteLabel)
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(false)
					.setMaxLength(REJECT_NOTE_MAX_LENGTH)
			)
		)
}

export function readRejectNote(fields: { getTextInputValue(id: string): string }): string | null {
	return fields.getTextInputValue(NOTE_INPUT).trim() || null
}
