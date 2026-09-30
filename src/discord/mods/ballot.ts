export type ModSessionState = "open" | "closed" | "finalized"

export interface ApplicantTally {
	discordId: string
	support: number
	submittedAt: number
}

export interface RankedApplicant extends ApplicantTally {
	rank: number
}

const BAR_WIDTH = 10

function compareTallies(a: ApplicantTally, b: ApplicantTally): number {
	if (a.support !== b.support) return b.support - a.support
	if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt
	return a.discordId < b.discordId ? -1 : a.discordId > b.discordId ? 1 : 0
}

export function rankApplicants(tallies: readonly ApplicantTally[]): RankedApplicant[] {
	const sorted = [...tallies].sort(compareTallies)
	return sorted.map((tally) => {
		const firstWithSameSupport = sorted.findIndex((t) => t.support === tally.support)
		return { ...tally, rank: firstWithSameSupport + 1 }
	})
}

export function supportBar(support: number, max: number): string {
	const ratio = max > 0 ? Math.min(support, max) / max : 0
	const filled = support > 0 ? Math.max(1, Math.round(ratio * BAR_WIDTH)) : 0
	return "▰".repeat(filled) + "▱".repeat(BAR_WIDTH - filled)
}

export function isVotingOpen(
	session: { state: ModSessionState; closesAt: number },
	now: number
): boolean {
	return session.state === "open" && now < session.closesAt
}
