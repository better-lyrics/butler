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
import { type FlagOutcome, buildFlagVoteConfirmCard } from "@/discord/components/flag-card"
import { buildQueueResultCard } from "@/discord/components/queue-card"
import { ephemeralCard, ephemeralText } from "@/discord/migrate/reply"
import type { FlagVoteResult } from "@/unison/client"
import type { QueueReplyInteraction, QueueUpdateInteraction } from "./queue"

export type FlagVoteFailure = Exclude<
	FlagVoteResult,
	{ status: "open" } | { status: "removed" } | { status: "kept" }
>

export type FlagVerdict = Exclude<FlagOutcome, { kind: "resolved" }>

export interface FlagVoteDeps {
	resolveKeyId(discordId: string): Promise<string | null>
	voteFlag(caseId: number, keyId: string, remove: boolean): Promise<FlagVoteResult>
	refreshBoardCard(caseId: string): Promise<{ needed: number } | null>
	resolveBoardCard(caseId: string, outcome: FlagVerdict, actorId: string): Promise<void>
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
	interaction: QueueUpdateInteraction,
	caseId: string,
	choice: string,
	deps: FlagVoteDeps
): Promise<void> {
	const id = parseCaseId(caseId)
	if (id === null || (choice !== "1" && choice !== "0")) {
		await interaction.update(buildQueueResultCard(flagError))
		return
	}
	const keyId = await deps.resolveKeyId(interaction.user.id)
	if (!keyId) {
		await interaction.update(buildConnectCard({ linkPageUrl: deps.linkPageUrl }))
		return
	}
	const result = await deps.voteFlag(id, keyId, choice === "1")
	switch (result.status) {
		case "open": {
			const board = await deps.refreshBoardCard(caseId)
			await interaction.update(
				buildQueueResultCard(flagVoteCounted(result.removals, board?.needed ?? null))
			)
			return
		}
		case "removed":
		case "kept":
			await interaction.update(
				buildQueueResultCard(result.status === "removed" ? flagRemoved : flagKept)
			)
			await deps.resolveBoardCard(caseId, { kind: result.status }, interaction.user.id)
			return
		default:
			await interaction.update(buildQueueResultCard(flagVoteErrorCopy(result)))
	}
}
