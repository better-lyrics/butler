import type { FlagBoardRow } from "@/db/flag-board"
import type { FlagCard } from "@/unison/client"

export interface FlagBoardPlan {
	toPost: FlagCard[]
	toUpdate: { row: FlagBoardRow; card: FlagCard }[]
	toResolve: { row: FlagBoardRow; card: FlagCard | null }[]
	toForget: FlagBoardRow[]
}

export function planFlagBoard(tracked: FlagBoardRow[], cards: FlagCard[]): FlagBoardPlan {
	const byId = new Map<string, FlagCard>()
	for (const card of cards) {
		const id = String(card.id)
		if (!byId.has(id)) byId.set(id, card)
	}
	const trackedIds = new Set(tracked.map((row) => row.caseId))

	const toPost = [...byId.entries()]
		.filter(([id, card]) => card.status === "open" && !trackedIds.has(id))
		.map(([, card]) => card)

	const plan: FlagBoardPlan = { toPost, toUpdate: [], toResolve: [], toForget: [] }
	for (const row of tracked) {
		const card = byId.get(row.caseId) ?? null
		if (card === null) plan.toForget.push(row)
		if (row.state !== "pending") continue
		if (card === null || card.status !== "open") {
			plan.toResolve.push({ row, card })
		} else if (card.removals !== row.card.removals || card.keeps !== row.card.keeps) {
			plan.toUpdate.push({ row, card })
		}
	}
	return plan
}
