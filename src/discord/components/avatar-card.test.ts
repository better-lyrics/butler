import { describe, expect, it } from "vitest"
import { buildAvatarApproveConfirmCard, buildAvatarCard } from "./avatar-card"

const input = {
	suggestionId: "sug-1",
	proposedId: "el-gato",
	label: "El Gato",
	proposerId: "111111111111111111",
	imageName: "el-gato.png",
}

function serialize(components: { toJSON(): unknown }[]): string {
	return JSON.stringify(components.map((component) => component.toJSON()))
}

describe("buildAvatarCard", () => {
	it("shows the image and approve/reject buttons while pending", () => {
		const payload = buildAvatarCard(input, Buffer.from("image-bytes"))
		expect(payload.files).toHaveLength(1)
		expect(payload.files[0]?.name).toBe("el-gato.png")
		const json = serialize(payload.components)
		expect(json).toContain("avatar.approve:sug-1")
		expect(json).toContain("avatar.reject:sug-1")
		expect(json).toContain("el-gato")
	})

	it("drops the buttons and image and shows the outcome once approved", () => {
		const payload = buildAvatarCard(input, null, { kind: "approved", actorId: "42" })
		expect(payload.files).toHaveLength(0)
		const json = serialize(payload.components)
		expect(json).not.toContain("avatar.approve:sug-1")
		expect(json).not.toContain("avatar.reject:sug-1")
		expect(json).toContain("Approved by <@42>")
	})

	it("shows the reject note when present", () => {
		const payload = buildAvatarCard(input, null, {
			kind: "rejected",
			actorId: "42",
			note: "too blurry",
		})
		const json = serialize(payload.components)
		expect(json).toContain("Rejected by <@42>")
		expect(json).toContain("too blurry")
	})
})

describe("buildAvatarApproveConfirmCard", () => {
	it("carries confirm and cancel actions for the suggestion", () => {
		const payload = buildAvatarApproveConfirmCard("sug-1")
		const json = serialize(payload.components)
		expect(json).toContain("avatar.approve.confirm:sug-1")
		expect(json).toContain("avatar.approve.cancel")
	})
})
