/**
 * Codec for discord.js interaction `customId` strings.
 *
 * discord.js caps a button/select `customId` at 100 characters. We encode an
 * action and its args as `action:arg1:arg2` and decode them back safely.
 */

/** discord.js hard limit on the length of an interaction `customId`. */
const MAX_CUSTOM_ID_LENGTH = 100

/** Separator between the action and each arg in an encoded `customId`. */
const SEPARATOR = ":"

/**
 * Encode an action and its args into a `customId` string.
 *
 * @throws if the encoded id exceeds {@link MAX_CUSTOM_ID_LENGTH} characters.
 */
export function encodeCustomId(action: string, args: string[]): string {
	const id = [action, ...args].join(SEPARATOR)
	if (id.length > MAX_CUSTOM_ID_LENGTH) {
		throw new Error(
			`customId "${id}" is ${id.length} chars, exceeds the ${MAX_CUSTOM_ID_LENGTH}-char limit`
		)
	}
	return id
}

/**
 * Decode a `customId` string back into its action and args.
 *
 * Returns `null` for an unparseable id (the empty string).
 */
export function decodeCustomId(id: string): { action: string; args: string[] } | null {
	if (id === "") {
		return null
	}
	const [action = "", ...args] = id.split(SEPARATOR)
	return { action, args }
}
