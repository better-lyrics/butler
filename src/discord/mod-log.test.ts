import { tierLabel } from "@/copy/strings"
import { describe, expect, it } from "vitest"
import { type ModLogEvent, formatModLogEvent } from "./mod-log"

const discordId = "111222333444555666"
const mention = `<@${discordId}>`

describe("formatModLogEvent", () => {
	describe("sync events", () => {
		it("notes who started a manual sync", () => {
			expect(formatModLogEvent({ kind: "sync_triggered", discordId })).toContain(mention)
		})

		it("summarizes a scheduled sync with counts and no manual tag", () => {
			const line = formatModLogEvent({
				kind: "sync_summary",
				trigger: "scheduled",
				granted: 2,
				removed: 1,
				announced: 1,
			})
			expect(line).toContain("granted 2")
			expect(line).toContain("removed 1")
			expect(line).toContain("announced 1")
			expect(line).not.toContain("manual")
		})

		it("tags a manual sync summary", () => {
			const line = formatModLogEvent({
				kind: "sync_summary",
				trigger: "manual",
				granted: 0,
				removed: 0,
				announced: 0,
			})
			expect(line).toContain("(manual)")
		})

		it("explains a skip and a failure", () => {
			expect(formatModLogEvent({ kind: "sync_skipped" })).toContain("empty")
			expect(formatModLogEvent({ kind: "sync_failed", reason: "hierarchy guard" })).toContain(
				"hierarchy guard"
			)
		})
	})

	describe("role events", () => {
		it("uses the tier label for grants, removals, and moves", () => {
			expect(formatModLogEvent({ kind: "role_granted", discordId, tier: "elite" })).toContain(
				tierLabel("elite")
			)
			expect(formatModLogEvent({ kind: "role_removed", discordId, tier: "lyricist" })).toContain(
				tierLabel("lyricist")
			)
			const moved = formatModLogEvent({
				kind: "role_moved",
				discordId,
				from: "master",
				to: "legendary",
			})
			expect(moved).toContain(tierLabel("master"))
			expect(moved).toContain(tierLabel("legendary"))
		})

		it("pings the affected member", () => {
			expect(formatModLogEvent({ kind: "role_granted", discordId, tier: "elite" })).toContain(
				mention
			)
		})
	})

	describe("report and request events", () => {
		it("names the flagged track", () => {
			const line = formatModLogEvent({
				kind: "report_posted",
				discordId,
				title: "Around the Fur",
				artist: "Deftones",
			})
			expect(line).toContain("Around the Fur")
			expect(line).toContain("Deftones")
		})

		const base = { kind: "request_result" as const, discordId, title: "Bloc", artist: "B" }

		it("reports a created request with demand and count", () => {
			const line = formatModLogEvent({
				...base,
				result: { status: "created", demand: 4, requestCount: 2 },
			})
			expect(line).toContain("demand 4")
			expect(line).toContain("2 requests")
		})

		it("reports an already-requested bump", () => {
			const line = formatModLogEvent({
				...base,
				result: { status: "already_requested", demand: 9, requestCount: 7 },
			})
			expect(line).toContain("demand 9")
		})

		it("reports an already-available track", () => {
			const line = formatModLogEvent({ ...base, result: { status: "already_available" } })
			expect(line).toContain("synced lyrics")
		})

		it("reports an error with its code", () => {
			const line = formatModLogEvent({ ...base, result: { status: "error", code: 429 } })
			expect(line).toContain("429")
		})
	})

	describe("setup event", () => {
		it("notes who changed the configuration", () => {
			expect(formatModLogEvent({ kind: "setup_updated", discordId })).toContain(mention)
		})
	})

	describe("power event", () => {
		it("says who turned butler on or off", () => {
			expect(formatModLogEvent({ kind: "power_toggled", discordId, on: true })).toContain("on")
			expect(formatModLogEvent({ kind: "power_toggled", discordId, on: true })).toContain(mention)
			expect(formatModLogEvent({ kind: "power_toggled", discordId, on: false })).toContain("off")
		})
	})

	describe("digest event", () => {
		it("names who posted a fresh review board", () => {
			const line = formatModLogEvent({ kind: "digest_triggered", discordId })
			expect(line).toContain("Digest")
			expect(line).toContain(mention)
		})
	})

	describe("mod application events", () => {
		it("notes who opened a round and when voting ends", () => {
			const line = formatModLogEvent({
				kind: "mods_opened",
				discordId,
				closesAt: 1_790_604_800_000,
			})
			expect(line).toContain(mention)
			expect(line).toContain("<t:1790604800:R>")
		})

		it("notes a new application", () => {
			expect(formatModLogEvent({ kind: "mods_applied", discordId })).toContain(mention)
		})

		it("counts applicants when voting closes, with singular and plural", () => {
			expect(formatModLogEvent({ kind: "mods_closed", applicants: 1 })).toContain("1 applicant.")
			expect(formatModLogEvent({ kind: "mods_closed", applicants: 0 })).toContain("0 applicants.")
		})

		it("names the picks and any failures when a round is wrapped up", () => {
			const line = formatModLogEvent({
				kind: "mods_finalized",
				discordId: "999888777666555444",
				picked: [discordId],
				grantFailed: 1,
				dmFailed: 2,
			})
			expect(line).toContain("<@999888777666555444>")
			expect(line).toContain(mention)
			expect(line).toContain("1 role grant failed")
			expect(line).toContain("2 DMs failed")
		})

		it("says so when nobody was picked", () => {
			const line = formatModLogEvent({
				kind: "mods_finalized",
				discordId,
				picked: [],
				grantFailed: 0,
				dmFailed: 0,
			})
			expect(line).toContain("picked nobody")
			expect(line).not.toContain("failed")
		})
	})

	describe("invariants", () => {
		const samples: ModLogEvent[] = [
			{ kind: "sync_triggered", discordId },
			{ kind: "sync_summary", trigger: "scheduled", granted: 1, removed: 0, announced: 0 },
			{ kind: "sync_skipped" },
			{ kind: "sync_failed", reason: "boom" },
			{ kind: "role_granted", discordId, tier: "elite" },
			{ kind: "role_removed", discordId, tier: "elite" },
			{ kind: "role_moved", discordId, from: "elite", to: "master" },
			{ kind: "report_posted", discordId, title: "t", artist: "a" },
			{
				kind: "request_result",
				discordId,
				title: "t",
				artist: "a",
				result: { status: "error", code: 1 },
			},
			{ kind: "setup_updated", discordId },
			{ kind: "power_toggled", discordId, on: true },
			{ kind: "digest_triggered", discordId },
			{ kind: "mods_opened", discordId, closesAt: 1_790_604_800_000 },
			{ kind: "mods_applied", discordId },
			{ kind: "mods_closed", applicants: 4 },
			{ kind: "mods_finalized", discordId, picked: [discordId], grantFailed: 0, dmFailed: 1 },
		]

		it("every event produces a non-empty single-line message with a bold tag", () => {
			for (const event of samples) {
				const line = formatModLogEvent(event)
				expect(line.length).toBeGreaterThan(0)
				expect(line).not.toContain("\n")
				expect(line.startsWith("**")).toBe(true)
			}
		})
	})
})
