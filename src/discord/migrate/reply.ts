import type { CardPayload } from "@/discord/components/connect-card"
import { MessageFlags } from "discord.js"

export function ephemeralText(content: string) {
	return { content, flags: MessageFlags.Ephemeral }
}

export function ephemeralCard(card: CardPayload) {
	const flags = Array.isArray(card.flags)
		? card.flags.reduce((acc, f) => acc | f, MessageFlags.Ephemeral as number)
		: card.flags | MessageFlags.Ephemeral
	return { components: card.components, flags }
}
