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
