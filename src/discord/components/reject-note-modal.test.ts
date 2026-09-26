import { queueRejectModalTitle, queueRejectNoteLabel } from "@/copy/strings"
import { describe, expect, it } from "vitest"
import { REJECT_NOTE_MAX_LENGTH, buildRejectNoteModal, readRejectNote } from "./reject-note-modal"

interface ModalJson {
	custom_id: string
	title: string
	components: Array<{
		components: Array<{
			custom_id: string
			label: string
			style: number
			required: boolean
			max_length: number
		}>
	}>
}

function fieldsWith(note: string) {
	return {
		getTextInputValue: (id: string) => {
			if (id !== "note") throw new Error(`unexpected input ${id}`)
			return note
		},
	}
}

describe("buildRejectNoteModal", () => {
	describe("happy paths", () => {
		it("carries the submit id and title it was given", () => {
			const json = buildRejectNoteModal(
				"queue.reject.submit:4210",
				queueRejectModalTitle
			).toJSON() as unknown as ModalJson
			expect(json.custom_id).toBe("queue.reject.submit:4210")
			expect(json.title).toBe(queueRejectModalTitle)
		})

		it("asks for one optional paragraph note capped at 300 chars", () => {
			const json = buildRejectNoteModal("x", "Reject").toJSON() as unknown as ModalJson
			const input = json.components[0]?.components[0]
			expect(input?.custom_id).toBe("note")
			expect(input?.label).toBe(queueRejectNoteLabel)
			expect(input?.style).toBe(2)
			expect(input?.required).toBe(false)
			expect(input?.max_length).toBe(REJECT_NOTE_MAX_LENGTH)
			expect(REJECT_NOTE_MAX_LENGTH).toBe(300)
		})
	})
})

describe("readRejectNote", () => {
	describe("happy paths", () => {
		it("returns the trimmed note", () => {
			expect(readRejectNote(fieldsWith("  wrong sync throughout  "))).toBe("wrong sync throughout")
		})
	})

	describe("edge cases", () => {
		it("returns null for an empty note", () => {
			expect(readRejectNote(fieldsWith(""))).toBeNull()
		})

		it("returns null for a whitespace-only note", () => {
			expect(readRejectNote(fieldsWith(" \n\t "))).toBeNull()
		})

		it("keeps unicode intact", () => {
			expect(readRejectNote(fieldsWith("タイミングがずれている"))).toBe("タイミングがずれている")
		})
	})
})
