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

export const connectHeading = "**Link your Better Lyrics account**"

export const connectPromptBody =
	"Connect your account and every fix you request in this server counts toward your curator roles. Takes about ten seconds."

export const connectPerk = "Climb the board, earn a rank, and get the role to show for it."

export const connectButtonLabel = "Link Better Lyrics"

export const reportHeading = "**These lyrics look off**"

export const reportHelp =
	"Add it to the request board so a curator can pick it up, or open the composer and fix it yourself."

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
	"Couldn't pull the track details, so this can't go on the request board yet."

const PROMOTION_HEADLINES: Record<string, (mention: string) => string> = {
	legendary: (m) =>
		`${m} just took the top spot. Legendary Lyricist, the most trusted curator in the server right now.`,
	grandmaster: (m) =>
		`${m} climbed to Grandmaster Lyricist. Second on the whole board and gaining.`,
	master: (m) => `${m} broke into the top three. Master Lyricist now, and that is rare air.`,
	elite: (m) => `${m} leveled up to Elite Lyricist. Top 5% of curators and it shows.`,
	lyricist: (m) => `${m} cracked the top 20%. Lyricist now, a ranked curator on the board.`,
}

export function promotionHeadline(params: { discordId: string; tier: string }): string {
	const mention = `<@${params.discordId}>`
	const make = PROMOTION_HEADLINES[params.tier]
	return make ? make(mention) : `${mention} reached ${tierLabel(params.tier)}.`
}

function countLabel(n: number, word: string): string {
	return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`
}

export function promotionStats(params: {
	rank: number
	submissionCount: number
	totalUpvotes: number
}): string {
	const subs = countLabel(params.submissionCount, "submission")
	const ups = countLabel(params.totalUpvotes, "upvote")
	return `Rank #${params.rank}  ·  ${subs}  ·  ${ups}`
}

export const notYourReport = "Only the person who posted this and the mods can use these buttons."

export const reportAddToBoardButtonLabel = "Add to request board"

export const reportFixItMyselfButtonLabel = "Fix it myself"
