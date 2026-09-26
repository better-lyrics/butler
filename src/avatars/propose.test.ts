import { describe, expect, it } from "vitest"
import { MAX_ATTACHMENT_BYTES, MAX_NAME_LENGTH, buildProposal } from "./propose"

function base(overrides: Record<string, unknown> = {}) {
	return {
		channelId: "pfp",
		suggestChannelId: "pfp",
		memberEligible: true,
		attachment: { name: "IMG_1234.png", contentType: "image/png", size: 1000 },
		name: "El Gato",
		id: "el-gato",
		...overrides,
	}
}

describe("buildProposal", () => {
	it("uses the given id and name, never the file name", () => {
		expect(buildProposal(base())).toEqual({ ok: true, id: "el-gato", label: "El Gato" })
	})

	it("keeps the name as typed", () => {
		expect(buildProposal(base({ name: "DJ cat_2", id: "dj-cat-2" }))).toEqual({
			ok: true,
			id: "dj-cat-2",
			label: "DJ cat_2",
		})
	})

	it("accepts a gif for animated avatars", () => {
		const result = buildProposal(
			base({ attachment: { name: "dance.gif", contentType: "image/gif", size: 2000 } })
		)
		expect(result).toEqual({ ok: true, id: "el-gato", label: "El Gato" })
	})

	describe("rejections", () => {
		it("rejects the wrong channel", () => {
			expect(buildProposal(base({ channelId: "other" }))).toEqual({
				ok: false,
				reason: "wrong_channel",
			})
		})

		it("rejects an ineligible member", () => {
			expect(buildProposal(base({ memberEligible: false }))).toEqual({
				ok: false,
				reason: "not_eligible",
			})
		})

		it("rejects a missing image", () => {
			expect(buildProposal(base({ attachment: null }))).toEqual({ ok: false, reason: "no_image" })
		})

		it("rejects an unsupported type", () => {
			expect(
				buildProposal(
					base({ attachment: { name: "a.svg", contentType: "image/svg+xml", size: 10 } })
				)
			).toEqual({ ok: false, reason: "bad_type" })
		})

		it("rejects a missing content type", () => {
			expect(
				buildProposal(base({ attachment: { name: "a.png", contentType: null, size: 10 } }))
			).toEqual({ ok: false, reason: "bad_type" })
		})

		it("rejects an oversized image", () => {
			expect(
				buildProposal(
					base({
						attachment: {
							name: "big.png",
							contentType: "image/png",
							size: MAX_ATTACHMENT_BYTES + 1,
						},
					})
				)
			).toEqual({ ok: false, reason: "too_big" })
		})

		it("rejects a missing or blank name", () => {
			for (const name of [null, "", "   "]) {
				expect(buildProposal(base({ name }))).toEqual({ ok: false, reason: "bad_name" })
			}
		})

		it("rejects a missing or blank id", () => {
			for (const id of [null, "", "   "]) {
				expect(buildProposal(base({ id }))).toEqual({ ok: false, reason: "bad_id" })
			}
		})

		it("rejects an id with uppercase letters", () => {
			expect(buildProposal(base({ id: "El-Gato" }))).toEqual({ ok: false, reason: "bad_id" })
		})

		it("rejects an id with symbols other than a hyphen", () => {
			for (const id of ["el_gato", "el gato", "el.gato", "el/gato", "gato!", "café"]) {
				expect(buildProposal(base({ id }))).toEqual({ ok: false, reason: "bad_id" })
			}
		})
	})

	describe("edge cases", () => {
		it("normalizes a content type with parameters", () => {
			const result = buildProposal(
				base({ attachment: { name: "x.png", contentType: "image/png; charset=binary", size: 10 } })
			)
			expect(result).toMatchObject({ ok: true })
		})

		it("accepts digits and single hyphens in an id", () => {
			expect(buildProposal(base({ id: "bow-kitten-5" }))).toMatchObject({
				ok: true,
				id: "bow-kitten-5",
			})
			expect(buildProposal(base({ id: "42" }))).toMatchObject({ ok: true, id: "42" })
		})

		it("rejects leading, trailing, or doubled hyphens", () => {
			for (const id of ["-cat", "cat-", "el--gato", "-"]) {
				expect(buildProposal(base({ id }))).toEqual({ ok: false, reason: "bad_id" })
			}
		})

		it("trims the id and collapses whitespace in the name", () => {
			expect(buildProposal(base({ id: " el-gato ", name: "  El   Gato " }))).toEqual({
				ok: true,
				id: "el-gato",
				label: "El Gato",
			})
		})

		it("rejects an id over the length limit instead of clipping it", () => {
			expect(buildProposal(base({ id: "a".repeat(MAX_NAME_LENGTH + 1) }))).toEqual({
				ok: false,
				reason: "bad_id",
			})
		})
	})

	describe("regressions", () => {
		it("regression: clips a long name to what unison accepts", () => {
			const result = buildProposal(base({ name: "a ".repeat(100) }))
			if (!result.ok) throw new Error(result.reason)
			expect(result.label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(result.label).toBe(result.label.trim())
		})

		it("regression: never splits an emoji when clipping the name", () => {
			const result = buildProposal(base({ name: `${"x".repeat(MAX_NAME_LENGTH - 1)}😺` }))
			if (!result.ok) throw new Error(result.reason)
			expect(result.label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(result.label).not.toMatch(/[\uD800-\uDBFF]$/)
		})
	})

	describe("invariants", () => {
		it("keeps an id and name at exactly the limit unchanged", () => {
			const value = "a".repeat(MAX_NAME_LENGTH)
			expect(buildProposal(base({ id: value, name: value }))).toEqual({
				ok: true,
				id: value,
				label: value,
			})
		})

		it("reports a bad name before a bad id", () => {
			expect(buildProposal(base({ name: "", id: "BAD" }))).toEqual({
				ok: false,
				reason: "bad_name",
			})
		})
	})
})
