import { TimestampStyles, time } from "discord.js"

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
	"Add it to the request board and a curator can pick it up, or fix it yourself in Composer."

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
	"To fix it yourself, open Composer and sync the lyrics. If you get stuck, there's a tutorial in the help section, and a getting-started walkthrough runs the first time you open it. Once the lyrics look right, head back to YouTube Music, scroll down to the **Submit lyrics with Unison** button, and upload what you made."

export const blockedMetadataFallback =
	"Couldn't pull the track details, so this can't go on the request board yet."

interface PromotionLine {
	title: (mention: string) => string
	subtitle: string
}

const PROMOTION_LINES: Record<string, PromotionLine> = {
	legendary: {
		title: (m) => `${m} just took the top spot!`,
		subtitle: "Top of the board, most trusted of them all.",
	},
	grandmaster: {
		title: (m) => `${m} climbed to Grandmaster Lyricist!`,
		subtitle: "Second on the whole board now, and gaining.",
	},
	master: {
		title: (m) => `${m} broke into the top three!`,
		subtitle: "Master Lyricist now, and that is rare air.",
	},
	elite: {
		title: (m) => `${m} leveled up to Elite Lyricist!`,
		subtitle: "One of the sharpest curators on the board.",
	},
	lyricist: {
		title: (m) => `${m} earned the Lyricist role!`,
		subtitle: "On the board, with plenty of room to climb.",
	},
}

// Custom emojis from the community guild (1268184963266908220). Animated ones use the `a:` prefix.
// The bot must be a member of that guild, and needs "Use External Emojis" in any other guild it posts in.
const TIER_EMOJI: Record<string, string> = {
	legendary: "<a:PogFishAnimated:1519140120014622731>",
	grandmaster: "<a:pogseizure:1519140203304845403>",
	master: "<a:CatInsanity:1519139827419709450>",
	elite: "<a:bussin:1516783244291477630>",
	lyricist: "<:blobcat_flower:1516783964092760095>",
}

export function promotionTitle(params: { discordId: string; tier: string }): string {
	const mention = `<@${params.discordId}>`
	const line = PROMOTION_LINES[params.tier]
	return line ? line.title(mention) : `${mention} reached ${tierLabel(params.tier)}!`
}

export function promotionSubtitle(tier: string): string {
	const line = PROMOTION_LINES[tier]
	if (!line) return ""
	const emoji = TIER_EMOJI[tier]
	return emoji ? `${emoji} ${line.subtitle}` : line.subtitle
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

export function badgeAwardTitle(params: { discordId: string; badgeName: string }): string {
	return `<@${params.discordId}> earned the ${params.badgeName} badge!`
}

export const announceSummaryHeading = "**Fresh wins on the board**"

export const announceSummaryPromotionsLabel = "**Role promotions**"

export const announceSummaryBadgesLabel = "**New badges**"

export function announceSummaryPromotionLine(params: {
	displayName: string
	tier: string
}): string {
	const emoji = TIER_EMOJI[params.tier]
	const lead = emoji ? `${emoji} ` : ""
	return `- ${lead}**${params.displayName}** reached ${tierLabel(params.tier)}`
}

export function announceSummaryBadgeLine(params: {
	displayName: string
	badgeName: string
}): string {
	return `- **${params.displayName}** earned ${params.badgeName}`
}

export const notYourReport = "Only the person who posted this and the mods can use these buttons."

export const reportAddToBoardButtonLabel = "Add to request board"

export const reportFixItMyselfButtonLabel = "Fix it myself"

export const migrateStartHeading = "**Move your account to a new key**"

export const migrateStartBody =
	"Open https://unison.boidu.dev, sign in with Better Lyrics and click Link Discord under https://unison.boidu.dev/me. When that's done, come back and tap Continue."

export function migrateMovingAccount(shortId: string): string {
	return `Moving account \`${shortId}\`.`
}

export function migrateExpiresLine(timestamp: string): string {
	return `This migration expires ${timestamp}.`
}

export const migrateContinueButtonLabel = "Continue"

export const migratePreviewHeading = "**Review your migration**"

export function migratePreviewBody(name: string): string {
	return `You keep everything below, and it all moves onto your new key \`${name}\`:`
}

export function migratePreviewCounts(counts: {
	submissions: number
	votes: number
	reports: number
	fulfillments: number
}): string {
	const subs = countLabel(counts.submissions, "submission")
	const votes = countLabel(counts.votes, "vote")
	const reports = countLabel(counts.reports, "report")
	const fills = countLabel(counts.fulfillments, "fulfillment")
	return `${subs}  ·  ${votes}  ·  ${reports}  ·  ${fills}`
}

export function migratePreviewCollisions(n: number): string | null {
	if (n <= 0) return null
	const dupes = countLabel(n, "duplicate")
	return `${dupes} (vote, report, or request) will be dropped, keeping the one you already have.`
}

export function migrateKeyLine(
	oldDisplayName: string,
	oldShort: string,
	newDisplayName: string,
	newShort: string
): string {
	return `${oldDisplayName} (\`${oldShort}\`)  ->  ${newDisplayName} (\`${newShort}\`)`
}

export function migrateNicknameKept(name: string | null): string {
	return name ? `Nickname kept: **${name}**` : "No nickname to carry over."
}

export function migrateNicknameChoosing(current: string): string {
	return `Nickname: **${current}**`
}

export function migrateNicknameToggleLabel(other: string): string {
	return `Use "${other}"`
}

export const migratePreviewWarning = "This cannot be undone from Discord."

export const migrateConfirmButtonLabel = "Confirm migration"

export const migrateSuccessHeading = "**Migration complete**"

export function migrateSuccessBody(moved: {
	submissions: number
	votes: number
	reports: number
	fulfillments: number
	collisionsDropped: number
}): string {
	const subs = countLabel(moved.submissions, "submission")
	const votes = countLabel(moved.votes, "vote")
	const reports = countLabel(moved.reports, "report")
	const fills = countLabel(moved.fulfillments, "fulfillment")
	const dropped =
		moved.collisionsDropped > 0
			? ` Dropped ${countLabel(moved.collisionsDropped, "duplicate")}.`
			: ""
	return `Moved ${subs}, ${votes}, ${reports}, and ${fills} onto your new key.${dropped}`
}

export const migrateNotLinkedHeading = "**Link your old identity first**"

export const migrateNotLinkedBody =
	"This Discord is not linked to any Better Lyrics key yet, so there is nothing to move. Link your OLD identity first, then run /migrate."

export const migrateLinkButtonLabel = "Link Better Lyrics"

export const migrateNotYet =
	"Your new key is not linked yet. Finish linking from your new install, then tap Continue again."

export function migrateCooldown(retryAfterMs: number): string {
	return `Slow down a moment. Try /migrate again in ${Math.ceil(retryAfterMs / 1000)}s.`
}

export function migrateTokenMismatch(shortId: string): string {
	return `That did not match. Type the new key id \`${shortId}\` exactly to confirm.`
}

export const migrateAlreadyActive =
	"You already have a migration in progress. Finish or wait for it before starting another."

export const migrateBlacklisted =
	"This account is blocked from linking, so it cannot be migrated. Reach out to a mod if you think this is a mistake."

export const migrateLinkingDisabled =
	"Account linking is switched off right now. Try again a little later."

export const migrateFailed =
	"That migration could not go through (the two keys may be the same). Run /migrate to try again."

export const migrateNotReady =
	"This migration is not ready to commit yet. Finish linking your new key first."

export const migrateNotOwner =
	"This Discord no longer owns the old identity, so the migration was stopped."

export const migrateAlreadyCommitted = "This migration was already completed."

export const migrateExpired = "This migration expired. Run /migrate to start a fresh one."

export const migrateSessionNotFound =
	"That migration session is no longer around. Run /migrate to start again."

export const migrateGenericError =
	"Something went wrong with the migration. Give it another try in a moment."

export const migrateConfirmModalTitle = "Confirm migration"

export const migrateConfirmInputLabel = "Type the new key id to confirm"

export const sealPickHeading = "**Seal a lyric**"

export const sealPickBody =
	"Pick which version to seal. A seal marks the lyric as council-approved and gives its ranking a boost."

export const sealPickPlaceholder = "Choose a version to seal"

export const unsealPickHeading = "**Lift a seal**"

export const unsealPickBody = "Pick which version to unseal. You can only lift a seal you placed."

export const unsealPickPlaceholder = "Choose a version to unseal"

export const sealConfirmButtonLabel = "Seal this version"

export const unsealConfirmButtonLabel = "Lift this seal"

export function sealVariantLabel(song: string): string {
	return song
}

export function sealVariantDescription(params: {
	artist: string
	format: string
	score: number
	submitterName: string | null
}): string {
	const parts = [params.artist, params.format]
	if (params.submitterName) parts.push(params.submitterName)
	parts.push(`score ${params.score}`)
	return parts.join(" · ")
}

export function sealQuotaSummary(quota: {
	quota: number
	used: number
	remaining: number
}): string {
	return `${quota.used} of ${quota.quota} seals used this month. ${quota.remaining} left.`
}

export function sealResetsLine(resetsAt: number): string {
	return `Resets ${time(resetsAt, TimestampStyles.RelativeTime)}.`
}

export const sealSuccessHeading = "**Sealed**"

export const sealSuccessBody = "This lyric now carries a council seal and a ranking boost."

export const unsealSuccessHeading = "**Seal lifted**"

export const unsealSuccessBody = "The council seal and its boost are off this lyric."

export const sealQuotaHeading = "**Your council seals**"

export const sealNotCouncil = "Sealing is for Better Lyrics Council members only."

export const sealUnknownUser =
	"I could not find your Better Lyrics account. If it was removed, link again and retry."

export const sealOverQuota =
	"You are out of seals for this month. They reset at the start of next month."

export const sealNotFound = "Could not find that lyric. It may have been removed."

export const sealSelf = "You cannot seal a lyric you submitted yourself."

export const sealTargetCouncil =
	"That lyric was submitted by a council member, so it cannot be sealed."

export const sealAlreadyActive = "That lyric already has an active seal."

export const sealNotOwner = "You can only lift a seal you placed."

export const sealNoVariants = "No lyrics found for that video yet."

export const sealBadVideo =
	"That does not look like a YouTube Music link or video id. Paste the song's link or its 11-character id."

export const sealError = "Something went wrong. Give it another try in a moment."

export const helpHeading = "**What butler can do**"

export const helpEveryoneLabel = "**For everyone**"

export const helpReportLine =
	"Spot wrong lyrics? Drop the YouTube Music link in the report channel and butler cards it up for a curator to pick up."

export const helpMigrateLine = "`/migrate` moves your history from an old key onto a new one."

export const helpCouncilLabel = "**For the council**"

export const helpSealLine =
	"`/seal add` seals a lyric variant as council-approved, `/seal remove` lifts a seal you placed, and `/seal quota` shows how many seals you have left this month."

export const helpAdminLabel = "**For server admins**"

export const helpSetupLine = "`/setup` sets butler's channels and tier roles for this server."

export const helpCouncilLine =
	"`/council add` and `/council remove` manage council members, `/council list` shows them, and `/council role` picks the role they get."

export const helpSyncLine = "`/sync` runs the role sync now instead of waiting for the hourly pass."

export const helpPowerLine = "`/activate` and `/deactivate` turn butler on and off here."

export const helpPreviewLine = "`/preview` shows a card without waiting for a real trigger."
