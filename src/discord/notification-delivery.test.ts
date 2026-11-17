import type { DiscordNotification } from "@/unison/client"
import { describe, expect, it } from "vitest"
import { deliverNotifications } from "./notification-delivery"

function item(id: number, discordId: string): DiscordNotification {
	return {
		id,
		kind: "suggestion_new",
		discordId,
		refStatus: "pending",
		actor: { displayName: "Ren" },
		song: { lyricsId: 42, videoId: "8ylRSepPra4", song: "Paper Moths", artist: "Glass Signal" },
		data: { revNo: 5, revisionId: 900 + id },
	}
}

describe("deliverNotifications", () => {
	it("sends one batch per person and acks every fetched id, even when a DM fails", async () => {
		const sentTo: string[] = []
		const acked: number[][] = []
		await deliverNotifications({
			unison: {
				fetchDiscordNotifications: async () => ({
					status: "ok",
					items: [
						item(1, "111111111111111111"),
						item(2, "222222222222222222"),
						item(3, "111111111111111111"),
					],
				}),
				ackDiscordNotifications: async (ids) => {
					acked.push(ids)
					return { status: "ok", acked: ids.length }
				},
			},
			send: async (discordId) => {
				sentTo.push(discordId)
				if (discordId === "222222222222222222") throw new Error("Cannot send messages to this user")
			},
		})
		expect(sentTo).toEqual(["111111111111111111", "222222222222222222"])
		expect(acked).toEqual([[1, 2, 3]])
	})
})
