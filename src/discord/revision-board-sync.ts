import type { RevisionBoardRow } from "@/db/revision-board"
import type { PendingRevisionCard } from "@/unison/client"

export interface RevisionBoardPlan {
	toPost: PendingRevisionCard[]
	toResolve: RevisionBoardRow[]
	toForget: RevisionBoardRow[]
}

export function planRevisionBoard(
	tracked: RevisionBoardRow[],
	pending: PendingRevisionCard[]
): RevisionBoardPlan {
	const seen = new Set(tracked.map((row) => row.revisionId))
	const toPost: PendingRevisionCard[] = []
	for (const card of pending) {
		const id = String(card.revisionId)
		if (seen.has(id)) continue
		seen.add(id)
		toPost.push(card)
	}
	const pendingIds = new Set(pending.map((card) => String(card.revisionId)))
	const toForget = tracked.filter((row) => !pendingIds.has(row.revisionId))
	return { toPost, toResolve: toForget.filter((row) => row.state === "pending"), toForget }
}
