import { MessageFlags } from "discord.js"

export function ephemeralText(content: string) {
	return { content, flags: MessageFlags.Ephemeral }
}
