import type { BookmarkItemType, CouncilBookmark } from "@/unison/client"

export function bookmarkLookup(
	bookmarks: CouncilBookmark[]
): (itemType: BookmarkItemType, itemId: number) => CouncilBookmark | null {
	const byItem = new Map(bookmarks.map((b) => [`${b.itemType}:${b.itemId}`, b]))
	return (itemType, itemId) => byItem.get(`${itemType}:${itemId}`) ?? null
}

function sameBookmark(a: CouncilBookmark | null, b: CouncilBookmark | null): boolean {
	if (a === null || b === null) return a === b
	return (
		a.expiresAt === b.expiresAt &&
		a.holder.discordId === b.holder.discordId &&
		a.holder.displayName === b.holder.displayName
	)
}

export function planBookmarkEdits<T extends { state: string; bookmark: CouncilBookmark | null }>(
	rows: T[],
	desired: (row: T) => CouncilBookmark | null
): { row: T; bookmark: CouncilBookmark | null }[] {
	return rows.flatMap((row) => {
		if (row.state !== "pending") return []
		const bookmark = desired(row)
		return sameBookmark(row.bookmark, bookmark) ? [] : [{ row, bookmark }]
	})
}

interface ShownCard {
	state: string
	messageId: string
	bookmark: CouncilBookmark | null
}

export interface BookmarkEditDeps<T extends ShownCard> {
	current(row: T): Promise<T | null>
	edit(row: T, bookmark: CouncilBookmark | null): Promise<boolean>
	redraw(row: T): Promise<void>
	store(row: T, bookmark: CouncilBookmark | null): Promise<void>
}

// Re-reads each card around its edit: a decision can land mid-sync and must win.
export async function applyBookmarkEdits<T extends ShownCard>(
	edits: { row: T; bookmark: CouncilBookmark | null }[],
	deps: BookmarkEditDeps<T>
): Promise<void> {
	const sameCard = (now: T | null, row: T): now is T => now?.messageId === row.messageId
	for (const { row, bookmark } of edits) {
		const before = await deps.current(row)
		if (!sameCard(before, row) || before.state !== "pending") continue
		const shown = await deps.edit(row, bookmark)
		const after = await deps.current(row)
		if (!sameCard(after, row)) continue
		if (after.state !== "pending") await deps.redraw(after)
		else if (shown) await deps.store(row, bookmark)
	}
}
