import { TIER_ORDER } from "@/config"
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

export const helpApplyLine =
	"`/council-apply` starts your Council entry exam when you are eligible."

export const helpCouncilLabel = "**For the council**"

export const helpSealLine =
	"`/seal add` seals a lyric variant as council-approved, `/seal remove` lifts a seal you placed, and `/seal quota` shows how many seals you have left this month."

export const helpQueueLine =
	"`/queue` reposts the current review board so the council can pick it back up, with each card marked open, sealed, or rejected."

export const helpAdminLabel = "**For server admins**"

export const helpSetupLine = "`/setup` sets butler's channels and tier roles for this server."

export const helpCouncilLine =
	"`/council add` and `/council remove` manage council members, and `/council list` shows them."

export const helpConfigLine =
	"`/config` changes one setting at a time (a channel, a tier role, the council role, the council channel, or the exam min role), `/config clear` unsets the mod channel, council role, council channel, or exam min role, and `/config view` shows the current setup."

export const helpApplicantsLine =
	"`/council-applicants` shows who passed the exam so you can approve or reject them."

export const helpWelcomePreviewLine =
	"`/council-welcome-preview` DMs you the welcome message new members receive."

export const helpSyncLine = "`/sync` runs the role sync now instead of waiting for the hourly pass."

export const helpDigestLine =
	"`/digest` posts a fresh review board now instead of waiting for the weekly run."

export const helpPowerLine = "`/activate` and `/deactivate` turn butler on and off here."

export const helpPreviewLine = "`/preview` shows a card without waiting for a real trigger."

export const configGuildOnly = "This command can only be used in a server."

export const configNoPermission = "You need the Manage Server permission to run this."

export const configError = "Something went wrong. Give it another try in a moment."

export const configConnectSet = "Connect channel set. Posted the connect card there."

export const configConnectFailed =
	"Connect channel saved, but I could not post the connect card. Check that I can send messages there."

export const configReportSet = "Report channel set."

export const configAnnounceSet = "Announce channel set."

export const configModChannelSet = "Mod channel set."

export const configModChannelCleared = "Mod channel cleared. I will not post moderator logs."

export const configReviewChannelSet =
	"Council channel set. I will post the weekly review board there for the council."

export const configReviewChannelCleared =
	"Council channel cleared. I will not post the review board there."

export const configCouncilRoleCleared =
	"Council role cleared. I will not assign a role when adding members."

export function configCouncilRoleSet(mention: string): string {
	return `Council role set to ${mention}. I will assign it when you add a member.`
}

export function configExamMinRoleSet(mention: string): string {
	return `Exam applications now open to ${mention} and anyone with a role above it.`
}

export const configExamMinRoleCleared =
	"Exam minimum role cleared. It falls back to the Lyricist role."

export function configTierRoleSet(tier: string, mention: string): string {
	return `${TIER_LABELS[tier] ?? tier} role set to ${mention}.`
}

export function configView(
	config: {
		connectChannelId: string | null
		reportChannelId: string | null
		announceChannelId: string | null
		modChannelId: string | null
		councilRoleId: string | null
		reviewChannelId: string | null
		roleIds: Record<string, string>
	} | null
): string {
	if (!config) {
		return "Nothing is configured yet. Run `/setup` for the full flow, or set fields one at a time with `/config`."
	}
	const channel = (id: string | null) => (id ? `<#${id}>` : "not set")
	const role = (id: string | null) => (id ? `<@&${id}>` : "not set")
	const tierRoles = TIER_ORDER.map((tier) => `${tier}: ${role(config.roleIds[tier] ?? null)}`).join(
		", "
	)
	return [
		"**butler configuration**",
		`Connect channel: ${channel(config.connectChannelId)}`,
		`Report channel: ${channel(config.reportChannelId)}`,
		`Announce channel: ${channel(config.announceChannelId)}`,
		`Mod channel: ${channel(config.modChannelId)}`,
		`Council channel: ${channel(config.reviewChannelId)}`,
		`Council role: ${role(config.councilRoleId)}`,
		`Tier roles: ${tierRoles}`,
	].join("\n")
}

export const queueEmpty = "The review queue is clear. Nothing is waiting to be sealed right now."

export const queueError = "Something went wrong loading the queue. Try again in a moment."

export const queueNotCouncil = "The review queue is for Better Lyrics Council members only."

export const queueUnknownUser =
	"I could not find your Better Lyrics account. If it was removed, link again and retry."

export const queueVerifyButtonLabel = "Open in YT Music"

export const queueSealButtonLabel = "Seal"

export const queueRejectButtonLabel = "Reject"

export const queueConfirmSealButtonLabel = "Confirm seal"

export const queueCancelButtonLabel = "Cancel"

export const queueUndoSealButtonLabel = "Undo seal"

export const queueUndoRejectButtonLabel = "Undo reject"

export const queueConfirmSealBody =
	"Seal this lyric as council-approved? This marks it approved and boosts its ranking."

export const queueSealCancelled = "Cancelled. Nothing was sealed."

export const queueSealUndone = "Seal removed."

export const queueRejectModalTitle = "Reject lyric"

export const queueRejectNoteLabel = "Reason (optional)"

export const queueRejectUndone = "Rejection lifted. The lyric can surface in the queue again."

export const queueAlreadyRejected = "That lyric is already rejected."

export function queueSealedBy(userId: string): string {
	return `Sealed by <@${userId}>. It now carries a council seal and a ranking boost.`
}

export function queueRejectedBy(userId: string): string {
	return `Rejected by <@${userId}>. It will not surface in the queue again.`
}

export function queueEntryHeading(song: string): string {
	return `**${song}**`
}

export function queueEntryDetails(entry: {
	artist: string
	voteCount: number
	score: number
	submitterName: string | null
}): string {
	const parts = [entry.artist, `${entry.voteCount} votes`, `score ${entry.score}`]
	if (entry.submitterName) parts.push(`by ${entry.submitterName}`)
	return parts.join(" · ")
}

const QUEUE_SIGNAL_LABELS: Record<string, string> = {
	"line-synced": "line-synced (not word-by-word)",
	"filler-line": "filler/instrumental lines",
	"not-sentence-case": "capitalization",
	"unbracketed-bg": "unbracketed background vocals",
	"multi-bracket-bg": "multiple bracket pairs",
	"distant-adlib": "distant ad-lib",
	"handoff-candidate": "mid-line voice change",
	"possible-unison-mistag": "possible unison mistag",
	"stretched-spelling": "stretched spelling",
	"split-without-stretch": "syllable split without a stretch",
	"flattened-pauses": "flattened pauses",
	"linked-repeat-drift": "linked-repeat drift",
}

export function queueSignalLabel(code: string): string {
	return QUEUE_SIGNAL_LABELS[code] ?? code
}

export function queueSignalsLine(format: string, signals: string[]): string | null {
	if (format !== "ttml") return null
	if (signals.length === 0) return "TTML: no issues flagged."
	return `TTML signals: ${signals.map(queueSignalLabel).join(", ")}`
}

export const queueSealedGeneric =
	"Sealed by the council. It carries a council seal and a ranking boost."

export const queueRejectedGeneric =
	"Rejected by the council. It will not surface in the queue again."

export function queueRejectNoteLine(note: string): string {
	return `Reason: ${note}`
}

export const queueResendPosted =
	"Reposted the review board so it is back at the bottom of the channel."

export const queueResendEmpty =
	"There is no review board yet. An admin can run `/digest` to post one."

export const queueResendFailed =
	"Could not repost the review board. The current one is still in place, so try again in a moment."

export const digestNoPermission = "You need the Manage Server permission to run this."

export const digestNoChannel =
	"No council channel is set. Point one with `/config council-channel` first."

export const digestPosted = "Posted a fresh review board to the council channel."

export const digestEmpty = "The review queue is clear. Nothing to post right now."

export const digestDisabled = "butler is off here. Run `/activate` first."

export const examIntroHeading = "**Apply to the Better Lyrics Council**"

export const examIntroWhat =
	'The Council is an elite team that seals rare, exceptional lyrics. If you spot "Better Lyrics Council Approved" unison lyrics in the wild, you have them to thank!'

export const examIntroCatch =
	"They play a vital role in our ecosystem, but this duty comes with a sacrifice. Council members voluntarily forfeit the right to have their own lyrics sealed. Since you ran this command, you're probably looking to join the team!"

export const examIntroExam =
	"Well, this exam is your chance to prove you have what it takes. You only get one attempt, so make it count! We highly recommend reviewing the lyrics guide before you start. Once you're ready and confident, hit Begin exam below."

export function examIntroExpiry(expiresAt: number): string {
	return `The link expires ${time(expiresAt, TimestampStyles.RelativeTime)}.`
}

export const examBeginButtonLabel = "Begin exam"

export const examGuideButtonLabel = "Read the lyric guide"

export const examApplicantsHeading = "**Council applicants**"

export function examApplicantsSubheading(count: number): string {
	return `${count} waiting for review.`
}

export const examApplicantsEmpty = "No one is waiting for Council review right now."

export function examApplicantHeading(displayName: string): string {
	return `**${displayName}**`
}

type BreakdownRow = { section: string; score: number; max: number }

const sectionList = new Intl.ListFormat("en", { style: "long", type: "conjunction" })

function prettySection(section: string): string {
	const spaced = section.replace(/-/g, " ")
	return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Section names come from the exam API as bare slugs with no description, so butler owns
// the display blurb. Unknown slugs fall through and simply render without one.
const sectionBlurb: Record<string, string> = {
	"seal-or-not": "picking which of two syncs is seal-worthy, and what's wrong with the other",
	"a-vs-b": "picking which of two syncs tracks the vocal better, and the timing flaw in the other",
	"what-holds-back": "spotting the cleaner sync and naming what holds the other back",
	"is-exceptional": "calibration, is a clip genuinely seal-worthy or just correctly synced",
	"trap-exception": "applying a guide rule while catching its exception",
	"seal-discipline": "holding the bar against popularity, upvotes alone do not earn a seal",
	scenario: "a roleplay, declining a seal-on-request from a newcomer",
	capstone: "the full test under public pressure, hold the line instead of caving",
}

function sortedMisses(rows: BreakdownRow[]): BreakdownRow[] {
	return rows.filter((r) => r.score < r.max).sort((a, b) => b.max - b.score - (a.max - a.score))
}

export function examApplicantScore(params: {
	score: number
	maxScore: number
	cutoff: number
	belowCutoff: boolean
}): string {
	const tag = params.belowCutoff ? "below cutoff" : "passed"
	return `Score: ${params.score} / ${params.maxScore} (cutoff ${params.cutoff}), ${tag}`
}

export function examApplicantGrade(score: number, maxScore: number): string {
	const pct = maxScore <= 0 ? 0 : (score / maxScore) * 100
	if (pct >= 97) return "A+"
	if (pct >= 93) return "A"
	if (pct >= 90) return "A-"
	if (pct >= 87) return "B+"
	if (pct >= 83) return "B"
	if (pct >= 80) return "B-"
	if (pct >= 75) return "C+"
	if (pct >= 70) return "C"
	if (pct >= 60) return "D"
	return "F"
}

export function examApplicantVerdict(params: {
	score: number
	maxScore: number
	cutoff: number
	breakdown: BreakdownRow[]
}): string {
	const grade = examApplicantGrade(params.score, params.maxScore)
	const misses = sortedMisses(params.breakdown)
	const named = misses.map((r) => `${prettySection(r.section)} (${r.score}/${r.max})`)
	const head = `**Butler verdict: ${grade}**`

	if (params.score < params.cutoff) {
		const where = named.length ? ` Weakest on ${sectionList.format(named.slice(0, 2))}.` : ""
		return `${head}\nCame up short of the ${params.cutoff} bar.${where} Not there yet.`
	}
	if (misses.length === 0) {
		return `${head}\nFull marks across every section. As clean as it gets. Ready for the Council.`
	}
	const lost = misses.reduce((n, r) => n + (r.max - r.score), 0)
	const lead = grade.startsWith("A") ? "Nearly flawless." : "Solid overall."
	const close = grade.startsWith("C")
		? "Passed, but those areas want a second look. Your call."
		: "Nothing that should hold them back. Ready for the Council."
	return `${head}\n${lead} Lost ${lost} point${lost === 1 ? "" : "s"} on ${sectionList.format(named)}; everything else was full marks. ${close}`
}

export function examApplicantMisses(rows: BreakdownRow[]): string | null {
	const misses = sortedMisses(rows)
	if (misses.length === 0) return null
	const lines = misses.map((r) => {
		const blurb = sectionBlurb[r.section]
		const tail = blurb ? `: ${blurb}` : ""
		return `**${prettySection(r.section)}** (${r.score}/${r.max})${tail}`
	})
	return `**Needs a look**\n${lines.join("\n")}`
}

export function examApplicantFullMarks(rows: BreakdownRow[]): string | null {
	const perfect = rows.filter((r) => r.score >= r.max).map((r) => prettySection(r.section))
	if (perfect.length === 0) return null
	return `**Full marks**\n${perfect.join(", ")}`
}

export const examApproveButtonLabel = "Approve"

export const examRejectButtonLabel = "Reject"

export function examApproveConfirm(discordId: string): string {
	return `Approve <@${discordId}> to the Council? This grants the role and registers them, and it cannot be undone here.`
}

export function examRejectConfirm(discordId: string): string {
	return `Reject <@${discordId}>? This uses up their one attempt at the exam.`
}

export const examConfirmApproveButtonLabel = "Confirm approve"

export const examConfirmRejectButtonLabel = "Confirm reject"

export const examCancelButtonLabel = "Cancel"

export const examApplicantGone =
	"This applicant is no longer pending. Run /council-applicants to see the current list."

export function examApplicantsMore(n: number): string {
	return `${n} more applicant${n === 1 ? "" : "s"} not shown. Decide these first, then run the command again.`
}

export function examApprovedLine(params: { discordId: string; adminId: string }): string {
	return `<@${params.discordId}> approved by <@${params.adminId}>.`
}

export function examRejectedLine(params: { discordId: string; adminId: string }): string {
	return `<@${params.discordId}> not selected. Decided by <@${params.adminId}>.`
}

export function councilWelcomeMessage(gettingStartedUrl: string): string {
	return [
		"Welcome to the Better Lyrics Council <:peepolove:1269246856710324275>",
		"",
		"The Council has reviewed your application and deemed you worthy, and we can't wait to have you on the team!",
		"",
		`First order of business: ${gettingStartedUrl}`,
		"Second order of business: have fun <:okayman:1444330560632783060>",
		"",
		"Alright, I've got other bot stuff to take care of. Congrats again, and I hope you use your newfound powers responsibly!",
	].join("\n")
}

export const examApprovedRoleGranted = "Gave them the Council role."

export const examApprovedRoleFailed =
	"Could not assign the Council role. Check that my role sits above it and that I can manage roles."

export const examApprovedNoRole =
	"No Council role is set. Add one with /config council-role and I'll assign it automatically."
