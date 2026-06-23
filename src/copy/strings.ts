const TIER_LABELS: Record<string, string> = {
	legendary: "#1 Legendary Lyricist",
	grandmaster: "#2 Grandmaster Lyricist",
	master: "#3 Master Lyricist",
	elite: "Elite Lyricist",
	lyricist: "Lyricist",
}

export function tierLabel(tier: string): string {
	return TIER_LABELS[tier] ?? tier
}

export const connectPromptBody =
	"Link your Better Lyrics account and any lyrics you request here count toward your curator roles. It takes a few seconds."

export const connectButtonLabel = "Link Better Lyrics"

export function requestAdded(params: { demand: number; requestCount: number }): string {
	const { demand, requestCount } = params
	return `On the request board now. That makes ${requestCount} requests, putting it at demand ${demand}.`
}

export const alreadyAvailable = "This one already has synced lyrics, so you are good to go."

export const requestFailed =
	"Something went wrong adding this to the request board. Give it another try in a moment."

export function alreadyRequested(params: { demand: number; requestCount: number }): string {
	const { demand, requestCount } = params
	return `Already on the request board. ${requestCount} people want this too, which puts it at demand ${demand}.`
}

export const selfFixInstructions =
	"Want to fix the lyrics yourself? Drop a YouTube Music link in the composer, or open the composer and start from there."

export const blockedMetadataFallback =
	"No YouTube Music link turned up and the track details would not load, so it cannot go on the request board yet. You can still fix it yourself: drop a YouTube Music link in the composer, or open the composer and start from there."

export function promotionAnnouncement(params: {
	displayName: string
	tierLabel: string
	rank: number
	submissionCount: number
	totalUpvotes: number
}): string {
	const { displayName, tierLabel, rank, submissionCount, totalUpvotes } = params
	return `${displayName} just made ${tierLabel}. Now at rank ${rank}, with ${submissionCount} submissions and ${totalUpvotes} upvotes. Nice work.`
}

export const notYourReport = "Only the person who posted this and the mods can use these buttons."

export const reportAddToBoardButtonLabel = "Add to request board"

export const reportFixItMyselfButtonLabel = "Fix it myself"
