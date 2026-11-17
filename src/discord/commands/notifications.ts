import {
	notificationsError,
	notificationsNotLinked,
	notificationsOff,
	notificationsOn,
} from "@/copy/strings"
import type { NotificationDmResult } from "@/unison/client"
import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js"

export const notificationsCommand = new SlashCommandBuilder()
	.setName("notifications")
	.setDescription("Get your Unison notifications as DMs")
	.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
	.addSubcommand((sub) => sub.setName("on").setDescription("DM me my Unison notifications"))
	.addSubcommand((sub) => sub.setName("off").setDescription("Stop DMing me notifications"))

export interface NotificationsInteraction {
	user: { id: string }
	options: { getSubcommand(): string }
	deferReply(options: unknown): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export interface NotificationsDeps {
	setNotificationDms(discordId: string, on: boolean): Promise<NotificationDmResult>
}

function replyFor(linked: boolean, on: boolean): string {
	if (!linked) return notificationsNotLinked
	return on ? notificationsOn : notificationsOff
}

export async function handleNotifications(
	interaction: NotificationsInteraction,
	deps: NotificationsDeps
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral })
	const on = interaction.options.getSubcommand() === "on"
	const result = await deps.setNotificationDms(interaction.user.id, on).catch((err) => {
		console.error("notification dm setting failed", err)
		return null
	})
	const content = result?.status === "ok" ? replyFor(result.linked, on) : notificationsError
	await interaction.editReply({ content })
}
