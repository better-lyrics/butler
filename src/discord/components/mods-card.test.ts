import {
	modsBoardClosedHeading,
	modsBoardEmpty,
	modsBoardHeading,
	modsPickNoApplicants,
	modsResultNotSelectedBody,
	modsResultSelectedBody,
} from "@/copy/strings"
import type { ModAnswers, ModApplication } from "@/db/mod-sessions"
import { MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import {
	buildModsApplicationCard,
	buildModsBoardCard,
	buildModsNoticeCard,
	buildModsPickCard,
	buildModsPickConfirmCard,
	buildModsResultCard,
	buildModsWinnersCard,
} from "./mods-card"

const SESSION = "9c1f6d2e-5b1a-4f7e-9a51-6f0d4c3b2a10"
const ALICE = "719388223508070471"
const BOB = "1049311214321823774"
const CARA = "902118370052309012"
const CLOSES_AT = 1_790_604_800_000

const ANSWERS: ModAnswers = {
	why: "I am in the server most evenings and already answer the setup questions in #help.",
	hours: "UTC+1, weekday evenings",
	experience: "Ran a 4k member Minecraft server for two years.",
	scenario: "Warn once in DM, then a short timeout, then flag it in the staff channel.",
	extra: null,
}

function application(discordId: string, support: number, over: Partial<ModApplication> = {}) {
	return {
		sessionId: SESSION,
		discordId,
		displayName: `user-${discordId.slice(-4)}`,
		answers: ANSWERS,
		submittedAt: 1_790_000_000_000 + support,
		channelId: "1300000000000000001",
		messageId: "1300000000000000002",
		picked: false,
		support,
		...over,
	} satisfies ModApplication
}

function textLength(card: { components: { toJSON(): unknown }[] }): number {
	let total = 0
	const walk = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(walk)
		if (node && typeof node === "object") {
			const n = node as { type?: number; content?: string; components?: unknown }
			if (n.type === 10 && n.content) total += n.content.length
			walk(n.components)
		}
	}
	walk(card.components.map((c) => c.toJSON()))
	return total
}

function json(card: unknown): string {
	return JSON.stringify(card)
}

interface ButtonJson {
	type: number
	custom_id?: string
	label?: string
	style?: number
}

function buttons(card: { components: { toJSON(): unknown }[] }): ButtonJson[] {
	const found: ButtonJson[] = []
	const walk = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(walk)
		if (node && typeof node === "object") {
			const n = node as ButtonJson & { components?: unknown }
			if (n.type === 2) found.push(n)
			walk(n.components)
		}
	}
	walk(card.components.map((c) => c.toJSON()))
	return found
}

interface SelectJson {
	type: number
	custom_id: string
	min_values: number
	max_values: number
	options: { value: string; label: string; default?: boolean; description?: string }[]
}

function selects(card: { components: { toJSON(): unknown }[] }): SelectJson[] {
	const found: SelectJson[] = []
	const walk = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(walk)
		if (node && typeof node === "object") {
			const n = node as SelectJson & { components?: unknown }
			if (n.type === 3) found.push(n)
			walk(n.components)
		}
	}
	walk(card.components.map((c) => c.toJSON()))
	return found
}

function select(card: { components: { toJSON(): unknown }[] }): SelectJson | null {
	return selects(card)[0] ?? null
}

describe("buildModsBoardCard", () => {
	describe("happy paths", () => {
		it("is a Components V2 card that never pings", () => {
			const card = buildModsBoardCard({ open: true, closesAt: CLOSES_AT, applicants: [] })
			expect(card.flags).toBe(MessageFlags.IsComponentsV2)
			expect(card.allowedMentions).toEqual({ parse: [] })
		})

		it("lists applicants ranked by support with bars and counts", () => {
			const text = json(
				buildModsBoardCard({
					open: true,
					closesAt: CLOSES_AT,
					applicants: [
						{ discordId: ALICE, support: 2, submittedAt: 1 },
						{ discordId: BOB, support: 4, submittedAt: 2 },
					],
				})
			)
			expect(text).toContain(modsBoardHeading)
			expect(text).toContain(`\`#1\` <@${BOB}>  ▰▰▰▰▰▰▰▰▰▰  4`)
			expect(text).toContain(`\`#2\` <@${ALICE}>  ▰▰▰▰▰▱▱▱▱▱  2`)
			expect(text.indexOf(BOB)).toBeLessThan(text.indexOf(ALICE))
		})

		it("shows when voting ends while open", () => {
			const text = json(buildModsBoardCard({ open: true, closesAt: CLOSES_AT, applicants: [] }))
			expect(text).toContain(`<t:${CLOSES_AT / 1000}:R>`)
		})
	})

	describe("edge cases", () => {
		it("invites the first applicant when the board is empty", () => {
			const text = json(buildModsBoardCard({ open: true, closesAt: CLOSES_AT, applicants: [] }))
			expect(text).toContain(modsBoardEmpty)
		})

		it("switches to the closed heading after voting ends", () => {
			const text = json(buildModsBoardCard({ open: false, closesAt: CLOSES_AT, applicants: [] }))
			expect(text).toContain(modsBoardClosedHeading)
			expect(text).not.toContain(modsBoardHeading)
			expect(text).not.toContain(`<t:${CLOSES_AT / 1000}:R>`)
		})

		it("lists the top 25 and counts the rest", () => {
			const applicants = Array.from({ length: 30 }, (_, i) => ({
				discordId: `13000000000000000${String(i).padStart(2, "0")}`,
				support: 30 - i,
				submittedAt: i,
			}))
			const text = json(buildModsBoardCard({ open: true, closesAt: CLOSES_AT, applicants }))
			expect(text).toContain("`#25`")
			expect(text).not.toContain("`#26`")
			expect(text).toContain("And 5 more.")
		})
	})

	describe("invariants", () => {
		it("has no buttons, so the board itself can never take a vote", () => {
			const card = buildModsBoardCard({
				open: true,
				closesAt: CLOSES_AT,
				applicants: [{ discordId: ALICE, support: 1, submittedAt: 1 }],
			})
			expect(buttons(card)).toEqual([])
		})
	})
})

describe("buildModsApplicationCard", () => {
	describe("happy paths", () => {
		it("shows the applicant and every answer", () => {
			const text = json(
				buildModsApplicationCard({ application: application(ALICE, 3), open: true })
			)
			expect(text).toContain(`<@${ALICE}>`)
			for (const answer of [ANSWERS.why, ANSWERS.hours, ANSWERS.experience, ANSWERS.scenario]) {
				expect(text).toContain(answer)
			}
		})

		it("carries a support button with the live count while open", () => {
			const [button] = buttons(
				buildModsApplicationCard({ application: application(ALICE, 3), open: true })
			)
			expect(button?.label).toBe("Support · 3")
			expect(button?.custom_id).toBe(`mods.support:${SESSION}:${ALICE}`)
		})
	})

	describe("edge cases", () => {
		it("drops the button and shows the final count once closed", () => {
			const card = buildModsApplicationCard({ application: application(ALICE, 1), open: false })
			expect(buttons(card)).toEqual([])
			expect(json(card)).toContain("Voting closed with 1 supporter.")
		})

		it("shows the optional answer only when given", () => {
			const without = json(
				buildModsApplicationCard({ application: application(ALICE, 0), open: true })
			)
			expect(without).not.toContain("Anything else we should know?")
			const withExtra = json(
				buildModsApplicationCard({
					application: application(ALICE, 0, { answers: { ...ANSWERS, extra: "Night owl" } }),
					open: true,
				})
			)
			expect(withExtra).toContain("Anything else we should know?")
			expect(withExtra).toContain("Night owl")
		})

		it("keeps the scenario visible so voters know what was asked", () => {
			const text = json(
				buildModsApplicationCard({ application: application(ALICE, 0), open: true })
			)
			expect(text).toContain("Someone keeps derailing chat after a friendly warning.")
		})
	})

	describe("invariants", () => {
		it("never pings, not even an @everyone typed into an answer", () => {
			const card = buildModsApplicationCard({
				application: application(ALICE, 0, { answers: { ...ANSWERS, why: "@everyone hi" } }),
				open: true,
			})
			expect(card.allowedMentions).toEqual({ parse: [] })
		})

		it("stays under Discord's 4000 character text limit with every answer at its cap", () => {
			const full: ModAnswers = {
				why: "w".repeat(800),
				hours: "h".repeat(100),
				experience: "e".repeat(800),
				scenario: "s".repeat(800),
				extra: "x".repeat(400),
			}
			const card = buildModsApplicationCard({
				application: application(ALICE, 0, { answers: full }),
				open: true,
			})
			const texts: string[] = []
			const walk = (node: unknown) => {
				if (Array.isArray(node)) return node.forEach(walk)
				if (node && typeof node === "object") {
					const n = node as { type?: number; content?: string; components?: unknown }
					if (n.type === 10 && n.content) texts.push(n.content)
					walk(n.components)
				}
			}
			walk(card.components.map((c) => c.toJSON()))
			expect(texts.join("").length).toBeLessThanOrEqual(4000)
		})
	})

	describe("regressions", () => {
		it("regression: a multi-line answer stays inside its quote block", () => {
			const text = json(
				buildModsApplicationCard({
					application: application(ALICE, 0, {
						answers: { ...ANSWERS, why: "line one\nline two" },
					}),
					open: true,
				})
			)
			expect(text).toContain("> line one\\n> line two")
		})

		it("regression: a capped answer full of line breaks keeps every character", () => {
			const why = Array.from({ length: 100 }, (_, i) => `l${String(i).padStart(5, "0")}`).join("\n")
			expect(why.length).toBeLessThanOrEqual(800)
			const text = json(
				buildModsApplicationCard({
					application: application(ALICE, 0, { answers: { ...ANSWERS, why } }),
					open: true,
				})
			)
			expect(text).toContain("l00000")
			expect(text).toContain("l00099")
			expect(text).not.toContain("…")
		})

		it("regression: every answer at its cap and full of line breaks still fits 4000 characters", () => {
			const lines = (n: number) => "x\n".repeat(n).slice(0, n * 2 - 1)
			const full: ModAnswers = {
				why: lines(400),
				hours: lines(50),
				experience: lines(400),
				scenario: lines(400),
				extra: lines(200),
			}
			const card = buildModsApplicationCard({
				application: application(ALICE, 0, { answers: full }),
				open: true,
			})
			expect(textLength(card)).toBeLessThanOrEqual(4000)
		})
	})
})

describe("buildModsPickCard", () => {
	describe("happy paths", () => {
		it("offers every applicant ranked by support, marking current picks", () => {
			const card = buildModsPickCard({
				sessionId: SESSION,
				applications: [
					application(ALICE, 1),
					application(BOB, 5, { picked: true }),
					application(CARA, 3),
				],
			})
			const menu = select(card)
			expect(menu?.custom_id).toBe(`mods.pick.select:${SESSION}:0`)
			expect(menu?.options.map((o) => o.value)).toEqual([BOB, CARA, ALICE])
			expect(menu?.options.map((o) => o.default ?? false)).toEqual([true, false, false])
			expect(menu?.options[0]?.description).toBe("#1 with 5 supporters")
		})

		it("lets the admin pick anyone from none to all", () => {
			const menu = select(
				buildModsPickCard({
					sessionId: SESSION,
					applications: [application(ALICE, 1), application(BOB, 2)],
				})
			)
			expect(menu?.min_values).toBe(0)
			expect(menu?.max_values).toBe(2)
		})

		it("has a review button", () => {
			const [button] = buttons(buildModsPickCard({ sessionId: SESSION, applications: [] }))
			expect(button?.custom_id).toBe(`mods.pick.review:${SESSION}`)
		})
	})

	describe("edge cases", () => {
		it("skips the menu when nobody applied but still lets the admin close the round", () => {
			const card = buildModsPickCard({ sessionId: SESSION, applications: [] })
			expect(select(card)).toBeNull()
			expect(json(card)).toContain(modsPickNoApplicants)
			expect(buttons(card)).toHaveLength(1)
		})

		it("regression: splits more than 25 applicants across menus so everyone can be picked", () => {
			const applications = Array.from({ length: 30 }, (_, i) =>
				application(`13000000000000000${String(i).padStart(2, "0")}`, i)
			)
			const menus = selects(buildModsPickCard({ sessionId: SESSION, applications }))
			expect(menus.map((m) => m.custom_id)).toEqual([
				`mods.pick.select:${SESSION}:0`,
				`mods.pick.select:${SESSION}:1`,
			])
			expect(menus.map((m) => m.options.length)).toEqual([25, 5])
			expect(menus.map((m) => m.max_values)).toEqual([25, 5])
			expect(new Set(menus.flatMap((m) => m.options.map((o) => o.value))).size).toBe(30)
		})

		it("shows up to four menus and says how many more are not listed", () => {
			const applications = Array.from({ length: 120 }, (_, i) =>
				application(`1300000000000000${String(i).padStart(3, "0")}`, i)
			)
			const card = buildModsPickCard({ sessionId: SESSION, applications })
			expect(selects(card)).toHaveLength(4)
			expect(json(card)).toContain("20 more")
		})

		it("clips a long display name to Discord's 100 character label cap", () => {
			const menu = select(
				buildModsPickCard({
					sessionId: SESSION,
					applications: [application(ALICE, 0, { displayName: "n".repeat(150) })],
				})
			)
			expect(menu?.options[0]?.label.length).toBeLessThanOrEqual(100)
		})
	})
})

describe("buildModsPickConfirmCard", () => {
	it("names the picks and the number of DMs, with go and back buttons", () => {
		const card = buildModsPickConfirmCard({
			sessionId: SESSION,
			picked: [ALICE, BOB],
			applicants: 3,
		})
		const text = json(card)
		expect(text).toContain(`<@${ALICE}>, <@${BOB}>`)
		expect(text).toContain("DM all 3 applicants")
		expect(buttons(card).map((b) => b.custom_id)).toEqual([
			`mods.pick.go:${SESSION}`,
			`mods.pick.back:${SESSION}`,
		])
	})

	describe("edge cases", () => {
		it("says plainly when nobody is picked", () => {
			const text = json(buildModsPickConfirmCard({ sessionId: SESSION, picked: [], applicants: 1 }))
			expect(text).toContain("Pick nobody this round")
			expect(text).toContain("DM all 1 applicant their result")
		})
	})
})

describe("buildModsWinnersCard", () => {
	it("pings only the new mods", () => {
		const card = buildModsWinnersCard([ALICE, BOB])
		expect(card.allowedMentions).toEqual({ parse: [], users: [ALICE, BOB] })
		expect(json(card)).toContain(`<@${ALICE}>, <@${BOB}>`)
	})
})

describe("buildModsResultCard", () => {
	it("tells a picked applicant they are in", () => {
		expect(json(buildModsResultCard(true))).toContain(modsResultSelectedBody)
	})

	it("thanks an applicant who was not picked", () => {
		const text = json(buildModsResultCard(false))
		expect(text).toContain(modsResultNotSelectedBody)
		expect(text).not.toContain(modsResultSelectedBody)
	})
})

describe("buildModsNoticeCard", () => {
	it("is a text-only Components V2 card with no buttons", () => {
		const card = buildModsNoticeCard("This round is already wrapped up.")
		expect(card.flags).toBe(MessageFlags.IsComponentsV2)
		expect(json(card)).toContain("This round is already wrapped up.")
		expect(buttons(card)).toEqual([])
		expect(select(card)).toBeNull()
	})

	it("never pings even when the notice mentions someone", () => {
		expect(buildModsNoticeCard(`Couldn't DM <@${ALICE}>.`).allowedMentions).toEqual({ parse: [] })
	})
})

describe("error paths", () => {
	it("renders an application whose answers are empty without crashing", () => {
		const blank = { why: "", hours: "", experience: "", scenario: "", extra: "" }
		const card = buildModsApplicationCard({
			application: application(ALICE, 0, { answers: blank }),
			open: true,
		})
		expect(json(card)).not.toContain("Anything else we should know?")
		expect(buttons(card)).toHaveLength(1)
	})

	it("draws a full bar for a lone applicant after voting closes", () => {
		const text = json(
			buildModsBoardCard({
				open: false,
				closesAt: CLOSES_AT,
				applicants: [{ discordId: ALICE, support: 3, submittedAt: 1 }],
			})
		)
		expect(text).toContain("▰▰▰▰▰▰▰▰▰▰  3")
	})
})
