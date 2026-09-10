import type { BoardCard } from "@/db/review-board"

export interface BoardMessageRef {
	channelId: string
	messageId: string
}

export interface PlannedCard {
	send(): Promise<string | null>
	build(messageId: string): Omit<BoardCard, "position">
}

export interface SyncBoardDeps {
	deleteMessages(refs: BoardMessageRef[]): Promise<void>
	persist(cards: BoardCard[]): Promise<void>
}

export type SyncBoardResult = "posted" | "failed"

export async function syncBoard(
	previous: BoardMessageRef[],
	planned: PlannedCard[],
	deps: SyncBoardDeps
): Promise<SyncBoardResult> {
	const cards: BoardCard[] = []
	for (const card of planned) {
		const messageId = await card.send()
		if (!messageId) {
			await deps.deleteMessages(cards)
			return "failed"
		}
		cards.push({ ...card.build(messageId), position: cards.length })
	}
	await deps.deleteMessages(previous)
	await deps.persist(cards)
	return "posted"
}
