import { tierLabel } from "@/copy/strings"
import type { BotRequestResult } from "@/unison/client"
import { TimestampStyles, time } from "discord.js"

export type ModLogEvent =
	| { kind: "sync_triggered"; discordId: string }
	| {
			kind: "sync_summary"
			trigger: "scheduled" | "manual"
			granted: number
			removed: number
			announced: number
	  }
	| { kind: "sync_skipped" }
	| { kind: "sync_failed"; reason: string }
	| { kind: "role_granted"; discordId: string; tier: string }
	| { kind: "role_removed"; discordId: string; tier: string }
	| { kind: "role_moved"; discordId: string; from: string; to: string }
	| { kind: "report_posted"; discordId: string; title: string; artist: string }
	| {
			kind: "request_result"
			discordId: string
			title: string
			artist: string
			result: BotRequestResult
	  }
	| { kind: "setup_updated"; discordId: string }
	| { kind: "power_toggled"; discordId: string; on: boolean }
	| { kind: "digest_triggered"; discordId: string }
	| { kind: "mods_opened"; discordId: string; closesAt: number }
	| { kind: "mods_applied"; discordId: string }
	| { kind: "mods_closed"; applicants: number }
	| {
			kind: "mods_finalized"
			discordId: string
			picked: string[]
			grantFailed: number
			dmFailed: number
	  }

export type ModLog = (event: ModLogEvent) => void

function mention(discordId: string): string {
	return `<@${discordId}>`
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`
}

function finalizedLine(event: Extract<ModLogEvent, { kind: "mods_finalized" }>): string {
	const picks =
		event.picked.length > 0 ? `picked ${event.picked.map(mention).join(", ")}` : "picked nobody"
	const failures = [
		event.grantFailed > 0 ? `${plural(event.grantFailed, "role grant")} failed` : null,
		event.dmFailed > 0 ? `${plural(event.dmFailed, "DM")} failed` : null,
	].filter((f) => f !== null)
	const tail = failures.length > 0 ? ` (${failures.join(", ")})` : ""
	return `**Mods** ${mention(event.discordId)} ${picks}${tail}.`
}

function track(title: string, artist: string): string {
	return `"${title}" by ${artist}`
}

function requestLine(
	event: { discordId: string; title: string; artist: string } & {
		result: BotRequestResult
	}
): string {
	const who = mention(event.discordId)
	const what = track(event.title, event.artist)
	switch (event.result.status) {
		case "created":
			return `**Request** ${who} added ${what} to the board (demand ${event.result.demand}, ${event.result.requestCount} requests).`
		case "already_requested":
			return `**Request** ${who} bumped ${what}, already on the board (demand ${event.result.demand}, ${event.result.requestCount} requests).`
		case "already_available":
			return `**Request** ${who} tried ${what}, which already has synced lyrics.`
		case "error":
			return `**Request** ${who} hit an error adding ${what} (code ${event.result.code}).`
	}
}

export function formatModLogEvent(event: ModLogEvent): string {
	switch (event.kind) {
		case "sync_triggered":
			return `**Sync** ${mention(event.discordId)} started a manual sync.`
		case "sync_summary": {
			const tag = event.trigger === "manual" ? " (manual)" : ""
			return `**Sync** done${tag}: granted ${event.granted}, removed ${event.removed}, announced ${event.announced}.`
		}
		case "sync_skipped":
			return "**Sync** skipped: the leaderboard came back empty, so no roles changed."
		case "sync_failed":
			return `**Sync** failed: ${event.reason}`
		case "role_granted":
			return `**Roles** ${mention(event.discordId)} earned ${tierLabel(event.tier)}.`
		case "role_removed":
			return `**Roles** ${mention(event.discordId)} dropped off the board and lost ${tierLabel(event.tier)}.`
		case "role_moved":
			return `**Roles** ${mention(event.discordId)} went from ${tierLabel(event.from)} to ${tierLabel(event.to)}.`
		case "report_posted":
			return `**Report** ${mention(event.discordId)} flagged ${track(event.title, event.artist)}.`
		case "request_result":
			return requestLine(event)
		case "setup_updated":
			return `**Setup** ${mention(event.discordId)} updated butler's configuration.`
		case "power_toggled":
			return `**Power** ${mention(event.discordId)} turned butler ${event.on ? "on" : "off"}.`
		case "digest_triggered":
			return `**Digest** ${mention(event.discordId)} posted a fresh review board.`
		case "mods_opened":
			return `**Mods** ${mention(event.discordId)} opened mod applications. Voting ends ${time(new Date(event.closesAt), TimestampStyles.RelativeTime)}.`
		case "mods_applied":
			return `**Mods** ${mention(event.discordId)} applied to be a mod.`
		case "mods_closed":
			return `**Mods** Voting closed with ${plural(event.applicants, "applicant")}.`
		case "mods_finalized":
			return finalizedLine(event)
	}
}
