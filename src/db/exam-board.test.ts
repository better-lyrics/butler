import type { ExamApplicant } from "@/unison/client"
import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { getPostedApplicantIds, planApplicantPosts, recordApplicantPost } from "./exam-board"
import { applySchema } from "./pool"

async function freshPool(): Promise<Pool> {
	const db = newDb({ noAstCoverageCheck: true })
	const { Pool } = db.adapters.createPg()
	const pool = new Pool() as unknown as Pool
	await applySchema(pool)
	return pool
}

function applicant(id: string): ExamApplicant {
	return {
		applicantId: id,
		discordId: `disc-${id}`,
		keyId: "a".repeat(64),
		displayName: `name-${id}`,
		score: 90,
		maxScore: 100,
		cutoff: 85,
		breakdown: [{ section: "timing", score: 4, max: 5 }],
		submittedAt: 1_789_000_000,
		state: "pending_review",
	}
}

describe("exam applicant board store", () => {
	let pool: Pool

	beforeEach(async () => {
		pool = await freshPool()
	})

	describe("recordApplicantPost and getPostedApplicantIds", () => {
		it("records a post and reads its applicant id back", async () => {
			await recordApplicantPost(pool, "g1", {
				applicantId: "42",
				messageId: "m1",
				channelId: "c1",
				postedAt: 1,
			})
			const posted = await getPostedApplicantIds(pool, "g1")
			expect(posted).toBeInstanceOf(Set)
			expect(posted.has("42")).toBe(true)
			expect(posted.size).toBe(1)
		})

		it("scopes posts to their guild", async () => {
			await recordApplicantPost(pool, "g1", {
				applicantId: "42",
				messageId: "m1",
				channelId: "c1",
				postedAt: 1,
			})
			await recordApplicantPost(pool, "g2", {
				applicantId: "43",
				messageId: "m2",
				channelId: "c2",
				postedAt: 1,
			})
			expect([...(await getPostedApplicantIds(pool, "g1"))]).toEqual(["42"])
			expect([...(await getPostedApplicantIds(pool, "g2"))]).toEqual(["43"])
		})
	})

	describe("invariants", () => {
		it("is idempotent: re-recording the same applicant keeps a single row and never throws", async () => {
			await recordApplicantPost(pool, "g1", {
				applicantId: "42",
				messageId: "m1",
				channelId: "c1",
				postedAt: 1,
			})
			await expect(
				recordApplicantPost(pool, "g1", {
					applicantId: "42",
					messageId: "m-different",
					channelId: "c1",
					postedAt: 2,
				})
			).resolves.toBeUndefined()
			expect((await getPostedApplicantIds(pool, "g1")).size).toBe(1)
		})
	})

	describe("edge cases", () => {
		it("returns an empty set for a guild with no posts", async () => {
			const posted = await getPostedApplicantIds(pool, "empty")
			expect(posted).toBeInstanceOf(Set)
			expect(posted.size).toBe(0)
		})
	})
})

describe("planApplicantPosts", () => {
	it("returns applicants not already posted, in order", () => {
		const applicants = [applicant("1"), applicant("2"), applicant("3")]
		const plan = planApplicantPosts(applicants, new Set(["2"]))
		expect(plan.map((a) => a.applicantId)).toEqual(["1", "3"])
	})

	it("returns nothing when every applicant is already posted", () => {
		const applicants = [applicant("1"), applicant("2")]
		expect(planApplicantPosts(applicants, new Set(["1", "2"]))).toEqual([])
	})

	it("returns nothing for an empty applicant list", () => {
		expect(planApplicantPosts([], new Set())).toEqual([])
	})

	it("posts everyone when nothing has been posted yet", () => {
		const applicants = [applicant("1"), applicant("2")]
		expect(planApplicantPosts(applicants, new Set()).map((a) => a.applicantId)).toEqual(["1", "2"])
	})
})
