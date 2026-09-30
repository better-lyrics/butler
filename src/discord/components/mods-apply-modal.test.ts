import {
	modsModalTitle,
	modsQuestionExtra,
	modsQuestionHours,
	modsQuestionScenario,
	modsQuestionWhy,
	modsScenarioPrompt,
} from "@/copy/strings"
import type { ModAnswers } from "@/db/mod-sessions"
import { describe, expect, it } from "vitest"
import { buildModsApplyModal, readModsAnswers } from "./mods-apply-modal"

const SUBMIT_ID = "mods.apply.submit:9c1f6d2e-5b1a-4f7e-9a51-6f0d4c3b2a10"

const ANSWERS: ModAnswers = {
	why: "I am in the server most evenings and already answer the setup questions in #help.",
	hours: "UTC+1, weekday evenings",
	experience: "Ran a 4k member Minecraft server for two years.",
	scenario: "Warn once in DM, then a short timeout, then flag it in the staff channel.",
	extra: null,
}

interface InputJson {
	custom_id: string
	label: string
	required: boolean
	max_length: number
	value?: string
	placeholder?: string
}

function inputs(modal: ReturnType<typeof buildModsApplyModal>): InputJson[] {
	const json = modal.toJSON() as unknown as { components: { components: InputJson[] }[] }
	return json.components.map((row) => row.components[0] as InputJson)
}

function fields(values: Record<string, string>) {
	return { getTextInputValue: (id: string) => values[id] ?? "" }
}

describe("buildModsApplyModal", () => {
	describe("happy paths", () => {
		it("asks the five questions in order under the submit id", () => {
			const modal = buildModsApplyModal(SUBMIT_ID, null)
			const json = modal.toJSON() as unknown as { custom_id: string; title: string }
			expect(json.custom_id).toBe(SUBMIT_ID)
			expect(json.title).toBe(modsModalTitle)
			expect(inputs(modal).map((i) => i.label)).toEqual([
				modsQuestionWhy,
				modsQuestionHours,
				"Any moderation experience?",
				modsQuestionScenario,
				modsQuestionExtra,
			])
		})

		it("puts the scenario in the placeholder", () => {
			const scenario = inputs(buildModsApplyModal(SUBMIT_ID, null))[3]
			expect(scenario?.placeholder).toBe(modsScenarioPrompt)
		})

		it("prefills an existing application so an edit starts from the old answers", () => {
			const values = inputs(buildModsApplyModal(SUBMIT_ID, { ...ANSWERS, extra: "Night owl" }))
			expect(values.map((i) => i.value)).toEqual([
				ANSWERS.why,
				ANSWERS.hours,
				ANSWERS.experience,
				ANSWERS.scenario,
				"Night owl",
			])
		})
	})

	describe("invariants", () => {
		it("keeps every label within Discord's 45 character cap", () => {
			for (const input of inputs(buildModsApplyModal(SUBMIT_ID, null))) {
				expect(input.label.length).toBeLessThanOrEqual(45)
			}
		})

		it("keeps every placeholder within Discord's 100 character cap", () => {
			for (const input of inputs(buildModsApplyModal(SUBMIT_ID, null))) {
				expect((input.placeholder ?? "").length).toBeLessThanOrEqual(100)
			}
		})

		it("caps the answers so a full application fits one card", () => {
			const total = inputs(buildModsApplyModal(SUBMIT_ID, null)).reduce(
				(sum, i) => sum + i.max_length,
				0
			)
			expect(total).toBeLessThanOrEqual(3000)
		})

		it("requires everything except the last question", () => {
			expect(inputs(buildModsApplyModal(SUBMIT_ID, null)).map((i) => i.required)).toEqual([
				true,
				true,
				true,
				true,
				false,
			])
		})
	})

	describe("edge cases", () => {
		it("leaves the extra field empty when the old application had none", () => {
			expect(inputs(buildModsApplyModal(SUBMIT_ID, ANSWERS))[4]?.value).toBeUndefined()
		})
	})
})

describe("readModsAnswers", () => {
	it("reads every answer", () => {
		expect(
			readModsAnswers(
				fields({
					why: ANSWERS.why,
					hours: ANSWERS.hours,
					experience: ANSWERS.experience,
					scenario: ANSWERS.scenario,
					extra: "Night owl",
				})
			)
		).toEqual({ ...ANSWERS, extra: "Night owl" })
	})

	describe("edge cases", () => {
		it("trims surrounding whitespace", () => {
			const read = readModsAnswers(
				fields({ why: "  because  ", hours: "\nUTC\n", experience: " none ", scenario: " x " })
			)
			expect(read).toEqual({
				why: "because",
				hours: "UTC",
				experience: "none",
				scenario: "x",
				extra: null,
			})
		})

		it("treats a whitespace-only extra answer as no answer", () => {
			expect(readModsAnswers(fields({ ...ANSWERS, extra: "   " })).extra).toBeNull()
		})

		it("keeps unicode answers intact", () => {
			expect(readModsAnswers(fields({ why: "日本語のサーバーも手伝えます" })).why).toBe(
				"日本語のサーバーも手伝えます"
			)
		})
	})
})
