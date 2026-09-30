export type ModSessionState = "open" | "closed" | "finalized"

export interface ApplicantTally {
	discordId: string
	support: number
	submittedAt: number
}

export type Ranked<T extends ApplicantTally> = T & { rank: number }

const BAR_WIDTH = 10

export const PICK_PAGE_SIZE = 25

export const MAX_PICK_PAGES = 4

function compareTallies(a: ApplicantTally, b: ApplicantTally): number {
	if (a.support !== b.support) return b.support - a.support
	if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt
	return a.discordId < b.discordId ? -1 : a.discordId > b.discordId ? 1 : 0
}

export function rankApplicants<T extends ApplicantTally>(tallies: readonly T[]): Ranked<T>[] {
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

// Discord caps a select menu at 25 options, so the pick list spreads over several menus.
export function pickPages<T extends ApplicantTally>(tallies: readonly T[]): Ranked<T>[][] {
	const ranked = rankApplicants(tallies)
	const pages: Ranked<T>[][] = []
	for (let i = 0; i < ranked.length && pages.length < MAX_PICK_PAGES; i += PICK_PAGE_SIZE) {
		pages.push(ranked.slice(i, i + PICK_PAGE_SIZE))
	}
	return pages
}
