import type { DiscordNotification, UnisonClient } from "@/unison/client"
import { type NotificationMessage, buildNotificationMessages } from "./components/notification-card"

export interface NotificationDeliveryDeps {
	unison: Pick<UnisonClient, "fetchDiscordNotifications" | "ackDiscordNotifications">
	send: (discordId: string, message: NotificationMessage) => Promise<void>
}

export async function deliverNotifications({
	unison,
	send,
}: NotificationDeliveryDeps): Promise<void> {
	const queue = await unison.fetchDiscordNotifications()
	if (queue.status === "error") console.error("notification queue fetch failed", queue.code)
	if (queue.status !== "ok" || queue.items.length === 0) return

	const byPerson = new Map<string, DiscordNotification[]>()
	for (const item of queue.items) {
		byPerson.set(item.discordId, [...(byPerson.get(item.discordId) ?? []), item])
	}
	for (const [discordId, items] of byPerson) {
		try {
			for (const message of buildNotificationMessages(items)) await send(discordId, message)
		} catch (err) {
			console.error("notification dm failed", discordId, err)
		}
	}

	const ack = await unison.ackDiscordNotifications(queue.items.map((item) => item.id))
	if (ack.status !== "ok") console.error("notification ack failed", ack)
}
