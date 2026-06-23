import { Client, GatewayIntentBits } from "discord.js"

/**
 * Construct the discord.js client with the intents butler needs.
 *
 * Construction only: login is performed by the entrypoint, not here.
 */
export function createDiscordClient(): Client {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
		],
	})
}
