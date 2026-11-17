import { notificationsError } from "@/copy/strings"
import { describe, expect, it } from "vitest"
import { handleNotifications } from "./notifications"

describe("handleNotifications", () => {
	it("acknowledges first and still answers when Unison throws", async () => {
		const calls: string[] = []
		let edited: unknown = null
		await handleNotifications(
			{
				user: { id: "123456789012345678" },
				options: { getSubcommand: () => "on" },
				deferReply: async () => calls.push("defer"),
				editReply: async (payload) => {
					edited = payload
				},
			},
			{
				setNotificationDms: async () => {
					calls.push("request")
					throw new Error("fetch failed")
				},
			}
		)
		expect(calls).toEqual(["defer", "request"])
		expect(edited).toEqual({ content: notificationsError })
	})
})
