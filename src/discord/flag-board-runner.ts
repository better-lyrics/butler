import {
	forgetFlagRow,
	getFlagBoardRow,
	listFlagBoard,
	markFlagDecided,
	recordFlagPost,
	updateFlagCard,
} from "@/db/flag-board"
import type { FlagCard, FlagTally, UnisonClient } from "@/unison/client"
import type { Pool } from "pg"
import type { CardPayload } from "./components/connect-card"
import { type FlagOutcome, type FlagVerdict, buildFlagCard } from "./components/flag-card"
import { flagOutcomeOf, planFlagBoard } from "./flag-board-sync"

export interface FlagBoardRunnerDeps {
	pool: Pool
	guildId: string
	unison: Pick<UnisonClient, "getFlags">
	councilChannelId(): Promise<string | null>
	editBoardMessage(channelId: string, messageId: string, payload: CardPayload): Promise<boolean>
	postToChannel(
		channelId: string,
		payload: CardPayload
	): Promise<{ channelId: string; messageId: string } | null>
}

interface FlagBoardRunner {
	sync(): Promise<void>
	refresh(caseId: string, tally: FlagTally): Promise<void>
	resolve(caseId: string, outcome: FlagVerdict, tally: FlagTally): Promise<void>
}

export function createFlagBoardRunner(deps: FlagBoardRunnerDeps): FlagBoardRunner {
	const { pool, guildId } = deps
	const tails = new Map<string, Promise<unknown>>()

	function locked<T>(caseId: string, work: () => Promise<T>): Promise<T> {
		const run = (tails.get(caseId) ?? Promise.resolve()).then(work)
		const tail = run.catch(() => undefined)
		tails.set(caseId, tail)
		void tail.then(() => {
			if (tails.get(caseId) === tail) tails.delete(caseId)
		})
		return run
	}

	function edit(channelId: string, messageId: string, payload: CardPayload): Promise<boolean> {
		return deps.editBoardMessage(channelId, messageId, payload).catch((err) => {
			console.error("flag board edit failed", err)
			return false
		})
	}

	function redrawOpen(
		caseId: string,
		toCard: (stored: FlagCard) => FlagCard,
		needed: number
	): Promise<void> {
		return locked(caseId, async () => {
			const row = await getFlagBoardRow(pool, guildId, caseId)
			if (row?.state !== "pending") return
			const card = toCard(row.card)
			if (!(await updateFlagCard(pool, guildId, caseId, card))) return
			if (!(await edit(row.channelId, row.messageId, buildFlagCard(card, needed)))) {
				await updateFlagCard(pool, guildId, caseId, row.card)
			}
		})
	}

	function close(
		caseId: string,
		toCard: (stored: FlagCard) => FlagCard,
		outcome: FlagOutcome,
		needed: number
	): Promise<boolean> {
		return locked(caseId, async () => {
			const row = await getFlagBoardRow(pool, guildId, caseId)
			if (row?.state !== "pending") return true
			const card = toCard(row.card)
			if (!(await edit(row.channelId, row.messageId, buildFlagCard(card, needed, outcome)))) {
				return false
			}
			if (outcome.kind !== "resolved") {
				await markFlagDecided(pool, guildId, caseId, { state: outcome.kind, card })
			}
			return true
		})
	}

	return {
		async sync() {
			const channelId = await deps.councilChannelId()
			if (!channelId) return
			const result = await deps.unison.getFlags()
			if (result.status !== "ok") return
			const plan = planFlagBoard(await listFlagBoard(pool, guildId), result.cards)
			for (const { row, card } of plan.toUpdate) {
				await redrawOpen(row.caseId, () => card, result.needed)
			}
			const stillShown = new Set<string>()
			for (const { row, card } of plan.toResolve) {
				const closed = await close(
					row.caseId,
					(stored) => card ?? stored,
					flagOutcomeOf(card),
					result.needed
				)
				if (!closed) stillShown.add(row.caseId)
			}
			for (const row of plan.toForget) {
				if (!stillShown.has(row.caseId)) await forgetFlagRow(pool, guildId, row.caseId)
			}
			for (const card of plan.toPost) {
				const posted = await deps.postToChannel(channelId, buildFlagCard(card, result.needed))
				if (!posted) continue
				await recordFlagPost(pool, guildId, { caseId: String(card.id), ...posted, card })
			}
		},

		refresh(caseId, tally) {
			return redrawOpen(
				caseId,
				(stored) => ({ ...stored, removals: tally.removals, keeps: tally.keeps }),
				tally.needed
			)
		},

		async resolve(caseId, outcome, tally) {
			await close(
				caseId,
				(stored) => ({
					...stored,
					status: outcome.kind,
					removals: tally.removals,
					keeps: tally.keeps,
				}),
				outcome,
				tally.needed
			)
		},
	}
}
