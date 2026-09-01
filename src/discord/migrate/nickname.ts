import type { MigrationStatus, NicknameChoice } from "@/unison/client"

export function parseNicknameChoice(arg: string | undefined): NicknameChoice {
	return arg === "new" ? "new" : "old"
}

/** The nickname toggle is only meaningful when both sides have a distinct name. */
export function canToggleNickname(data: MigrationStatus): boolean {
	return !!data.oldNickname && !!data.newNickname && data.oldNickname !== data.newNickname
}
