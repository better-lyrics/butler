import type { DiscordNotification } from "@/unison/client"
import { describe, expect, it } from "vitest"
import {
	NOTIFICATIONS_PER_MESSAGE,
	type NotificationMessage,
	buildNotificationMessages,
} from "./notification-card"

function item(overrides: Partial<DiscordNotification> = {}): DiscordNotification {
	return {
		id: 1,
		kind: "suggestion_new",
		discordId: "123456789012345678",
		refStatus: "pending",
		actor: { displayName: "Ren" },
		song: { lyricsId: 42, videoId: "8ylRSepPra4", song: "Paper Moths", artist: "Glass Signal" },
		data: { revNo: 5, revisionId: 901 },
		...overrides,
	}
}

function text(messages: NotificationMessage[]): string {
	return JSON.stringify(messages.flatMap((m) => m.components.map((c) => c.toJSON())))
}

describe("buildNotificationMessages", () => {
	it("splits items across messages so none passes the per-message limit", () => {
		const items = Array.from({ length: NOTIFICATIONS_PER_MESSAGE + 1 }, (_, i) =>
			item({ id: i + 1 })
		)
		const messages = buildNotificationMessages(items)
		expect(messages.map((m) => m.components.length)).toEqual([NOTIFICATIONS_PER_MESSAGE + 1, 2])
	})

	it("skips a suggestion that is no longer waiting and kinds it does not know", () => {
		const messages = buildNotificationMessages([
			item({ refStatus: "live" }),
			item({ kind: "reviewer_tier_granted" }),
		])
		expect(messages).toEqual([])
	})

	it("names the council when the council decided", () => {
		const messages = buildNotificationMessages([
			item({
				kind: "suggestion_rejected",
				refStatus: "rejected",
				actor: null,
				data: {
					revNo: 5,
					decidedBy: "council",
					note: "Timing drifts in verse two",
					revisionId: 901,
				},
			}),
		])
		expect(text(messages)).toContain("The council rejected your suggestion for")
		expect(text(messages)).toContain("Note from the council")
	})
})
