import { ActivityType, Client, GatewayIntentBits } from "discord.js"

/**
 * Construct the discord.js client with the intents butler needs.
 *
 * Construction only: login is performed by the entrypoint, not here. The presence
 * is set in client options so discord.js re-sends it on every (re)connect, keeping
 * butler shown as online with its activity.
 */
export function createDiscordClient(): Client {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
		],
		presence: {
			status: "online",
			activities: [{ name: "mondegreens", type: ActivityType.Listening }],
		},
	})
}
