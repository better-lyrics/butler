import {
	flagAlreadyDecided,
	flagConflict,
	flagError,
	flagKept,
	flagNotFound,
	flagRemoved,
	flagVoteCancelled,
	flagVoteCounted,
	queueNotCouncil,
} from "@/copy/strings"
import { buildConnectCard } from "@/discord/components/connect-card"
import { type FlagVerdict, buildFlagVoteConfirmCard } from "@/discord/components/flag-card"
import { buildQueueResultCard } from "@/discord/components/queue-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type { FlagTally, FlagVoteResult } from "@/unison/client"
import type { QueueReplyInteraction } from "./queue"

export interface FlagConfirmInteraction {
	user: { id: string }
	deferUpdate(): Promise<unknown>
	editReply(payload: unknown): Promise<unknown>
}

export type FlagVoteFailure = Exclude<FlagVoteResult, FlagTally>

export interface FlagVoteDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	voteFlag(caseId: number, keyId: string, remove: boolean): Promise<FlagVoteResult>
	refreshBoardCard(caseId: string, tally: FlagTally): Promise<void>
	resolveBoardCard(caseId: string, outcome: FlagVerdict, tally: FlagTally): Promise<void>
	linkPageUrl: string
}

export function flagVoteErrorCopy(result: FlagVoteFailure): string {
	switch (result.status) {
		case "not_council":
			return queueNotCouncil
		case "not_found":
			return flagNotFound
		case "already_decided":
			return flagAlreadyDecided
		case "conflict":
			return flagConflict
		default:
			return flagError
	}
}

function tallyOf({ removals, keeps, needed }: FlagTally): FlagTally {
	return { removals, keeps, needed }
}

function parseCaseId(caseId: string): number | null {
	if (!/^\d+$/.test(caseId)) return null
	const id = Number(caseId)
	return Number.isSafeInteger(id) ? id : null
}

export async function handleFlagVote(
	interaction: QueueReplyInteraction,
	caseId: string,
	remove: boolean
): Promise<void> {
	if (parseCaseId(caseId) === null) {
		await interaction.reply(ephemeralText(flagError))
		return
	}
	await interaction.reply(ephemeralCard(buildFlagVoteConfirmCard(caseId, remove)))
}

export async function handleFlagVoteCancel(interaction: {
	update(payload: unknown): Promise<unknown>
}): Promise<void> {
	await interaction.update(buildQueueResultCard(flagVoteCancelled))
}

export async function handleFlagVoteConfirm(
	interaction: FlagConfirmInteraction,
	caseId: string,
	choice: string,
	deps: FlagVoteDeps
): Promise<void> {
	await interaction.deferUpdate()
	const answer = (payload: unknown) =>
		interaction.editReply(payload).catch((err) => console.error("flag vote reply failed", err))
	const id = parseCaseId(caseId)
	if (id === null || (choice !== "1" && choice !== "0")) {
		await answer(buildQueueResultCard(flagError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await answer(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}
	const result = await deps.voteFlag(id, keyId, choice === "1")
	switch (result.status) {
		case "open":
			await answer(buildQueueResultCard(flagVoteCounted(result.removals, result.needed)))
			await deps.refreshBoardCard(caseId, tallyOf(result))
			return
		case "removed":
		case "kept":
			await answer(buildQueueResultCard(result.status === "removed" ? flagRemoved : flagKept))
			await deps.resolveBoardCard(caseId, { kind: result.status }, tallyOf(result))
			return
		default:
			await answer(buildQueueResultCard(flagVoteErrorCopy(result)))
	}
}
