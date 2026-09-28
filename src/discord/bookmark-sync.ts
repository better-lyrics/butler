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
