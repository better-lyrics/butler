const SHORT_ID_LENGTH = 6

/** The last 6 chars of a key id, lowercased. Shown to the user and typed to confirm. */
export function migrateShortId(keyId: string): string {
	return keyId.slice(-SHORT_ID_LENGTH).toLowerCase()
}

/** Whether the typed confirmation matches the new key's short id (trimmed, case-insensitive). */
export function matchesConfirmToken(typed: string, keyId: string): boolean {
	const short = migrateShortId(keyId)
	if (short.length < SHORT_ID_LENGTH) {
		return false
	}
	return typed.trim().toLowerCase() === short
}
