import type { ExamApplicant } from "@/unison/client"
import type { Pool } from "pg"

export async function getPostedApplicantIds(pool: Pool, guildId: string): Promise<Set<string>> {
	const result = await pool.query<{ applicant_id: string }>(
		"SELECT applicant_id FROM exam_applicant_post WHERE guild_id = $1",
		[guildId]
	)
	return new Set(result.rows.map((r) => r.applicant_id))
}

export async function recordApplicantPost(
	pool: Pool,
	guildId: string,
	post: { applicantId: string; messageId: string; channelId: string; postedAt: number }
): Promise<void> {
	await pool.query(
		`INSERT INTO exam_applicant_post (guild_id, applicant_id, message_id, channel_id, posted_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (guild_id, applicant_id) DO NOTHING`,
		[guildId, post.applicantId, post.messageId, post.channelId, post.postedAt]
	)
}

/** Applicants not yet posted to the council channel, in the order Unison returned them. */
export function planApplicantPosts(
	applicants: ExamApplicant[],
	postedIds: Set<string>
): ExamApplicant[] {
	return applicants.filter((a) => !postedIds.has(a.applicantId))
}
