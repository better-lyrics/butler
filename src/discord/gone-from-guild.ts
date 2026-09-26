import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js"

const GONE_CODES: ReadonlySet<number | string> = new Set([
	RESTJSONErrorCodes.UnknownMember,
	RESTJSONErrorCodes.UnknownUser,
])

export async function unlessGoneFromGuild<T>(work: Promise<T>): Promise<T | null> {
	try {
		return await work
	} catch (err) {
		if (err instanceof DiscordAPIError && GONE_CODES.has(err.code)) return null
		throw err
	}
}
