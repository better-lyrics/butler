import { describe, expect, it } from "vitest"
import { MAX_ATTACHMENT_BYTES, MAX_NAME_LENGTH, buildProposal } from "./propose"

function base(overrides: Record<string, unknown> = {}) {
	return {
		channelId: "pfp",
		suggestChannelId: "pfp",
		memberEligible: true,
		attachment: { name: "El Gato.png", contentType: "image/png", size: 1000 },
		...overrides,
	}
}

describe("buildProposal", () => {
	it("derives id and label from the attachment name", () => {
		expect(buildProposal(base())).toEqual({ ok: true, id: "el-gato", label: "El Gato" })
	})

	it("prefers an explicit name over the filename", () => {
		expect(buildProposal(base({ name: "Sky Cat" }))).toEqual({
			ok: true,
			id: "sky-cat",
			label: "Sky Cat",
		})
	})

	it("accepts a gif for animated avatars", () => {
		const result = buildProposal(
			base({ attachment: { name: "dance.gif", contentType: "image/gif", size: 2000 } })
		)
		expect(result).toEqual({ ok: true, id: "dance", label: "Dance" })
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

		it("rejects a name that slugs to empty", () => {
			expect(
				buildProposal(
					base({ name: "!!!", attachment: { name: "!!!.png", contentType: "image/png", size: 10 } })
				)
			).toEqual({ ok: false, reason: "bad_name" })
		})
	})

	describe("edge cases", () => {
		it("normalizes a content type with parameters", () => {
			const result = buildProposal(
				base({ attachment: { name: "x.png", contentType: "image/png; charset=binary", size: 10 } })
			)
			expect(result).toEqual({ ok: true, id: "x", label: "X" })
		})
	})

	describe("regressions", () => {
		function proposeFile(name: string) {
			const result = buildProposal(
				base({ attachment: { name, contentType: "image/png", size: 1000 } })
			)
			if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
			return result
		}

		it("regression: clips a long camera file name to what unison accepts", () => {
			const { id, label } = proposeFile(
				"IMG_20260926_123456789_portrait_mode_edited_final_version_2_really_final.png"
			)
			expect(id.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
			expect(label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(label).toBe(label.trim())
		})

		it("regression: clips a long explicit name", () => {
			const result = buildProposal(base({ name: "a ".repeat(100) }))
			if (!result.ok) throw new Error(result.reason)
			expect(result.id.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(result.label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
		})

		it("regression: never splits an emoji when clipping the label", () => {
			const { label } = proposeFile(`${"x".repeat(MAX_NAME_LENGTH - 1)}😺.png`)
			expect(label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
			expect(label).not.toMatch(/[\uD800-\uDBFF]$/)
		})
	})

	describe("invariants", () => {
		it("keeps a name at exactly the limit unchanged", () => {
			const name = "a".repeat(MAX_NAME_LENGTH)
			expect(buildProposal(base({ name }))).toEqual({
				ok: true,
				id: name,
				label: `A${name.slice(1)}`,
			})
		})
	})
})
