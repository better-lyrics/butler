import type { BoardCard, BoardCardState } from "@/db/review-board"
import type { QueueEntry } from "@/unison/client"

export interface BoardMessageRef {
	channelId: string
	messageId: string
}

export interface CarriedState {
	entry: QueueEntry
	state: BoardCardState
	actorId: string | null
	note: string | null
}

export function carryForwardStates(previous: BoardCard[], entries: QueueEntry[]): CarriedState[] {
	const priorByLyric = new Map(previous.map((card) => [card.lyricId, card]))
	return entries.map((entry) => {
		const prior = priorByLyric.get(String(entry.id))
		return {
			entry,
			state: prior?.state ?? "pending",
			actorId: prior?.actorId ?? null,
			note: prior?.note ?? null,
		}
	})
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
