import {
	type ModSession,
	closeSession,
	getApplication,
	getSession,
	listApplications,
	listExpiredSessions,
} from "@/db/mod-sessions"
import type { CardPayload } from "@/discord/components/connect-card"
import { buildModsApplicationCard, buildModsBoardCard } from "@/discord/components/mods-card"
import type { ModLogEvent } from "@/discord/mod-log"
import type { Pool } from "pg"
import { isVotingOpen } from "./ballot"

export interface ModsDiscord {
	postCard(channelId: string, card: CardPayload): Promise<string | null>
	editCard(channelId: string, messageId: string, card: CardPayload): Promise<boolean>
	meetsMinRole(discordId: string, minRoleId: string): Promise<boolean>
	canAssignRole(roleId: string): Promise<boolean>
	grantRole(discordId: string, roleId: string): Promise<boolean>
	sendDm(discordId: string, card: CardPayload): Promise<boolean>
}

export interface ModsDeps {
	pool: Pool
	guildId: string
	now(): number
	newId(): string
	discord: ModsDiscord
	refresh: {
		board(sessionId: string): void
		card(sessionId: string, applicantId: string): void
	}
	modLog(event: ModLogEvent): void
}

export async function renderBoard(deps: ModsDeps, sessionId: string): Promise<void> {
	const session = await getSession(deps.pool, sessionId)
	if (!session?.boardChannelId || !session.boardMessageId) return
	const applications = await listApplications(deps.pool, sessionId)
	await deps.discord.editCard(
		session.boardChannelId,
		session.boardMessageId,
		buildModsBoardCard({
			open: isVotingOpen(session, deps.now()),
			closesAt: session.closesAt,
			applicants: applications,
		})
	)
}

export async function renderCard(
	deps: ModsDeps,
	sessionId: string,
	applicantId: string
): Promise<void> {
	const session = await getSession(deps.pool, sessionId)
	const application = await getApplication(deps.pool, sessionId, applicantId)
	if (!session || !application?.channelId || !application.messageId) return
	await deps.discord.editCard(
		application.channelId,
		application.messageId,
		buildModsApplicationCard({ application, open: isVotingOpen(session, deps.now()) })
	)
}

export async function closeRound(deps: ModsDeps, session: ModSession): Promise<boolean> {
	if (!(await closeSession(deps.pool, session.id))) return false
	const applications = await listApplications(deps.pool, session.id)
	for (const application of applications) {
		if (!application.channelId || !application.messageId) continue
		await deps.discord.editCard(
			application.channelId,
			application.messageId,
			buildModsApplicationCard({ application, open: false })
		)
	}
	await renderBoard(deps, session.id)
	deps.modLog({ kind: "mods_closed", applicants: applications.length })
	return true
}

export async function closeExpiredRounds(deps: ModsDeps): Promise<void> {
	for (const session of await listExpiredSessions(deps.pool, deps.now())) {
		if (session.guildId !== deps.guildId) continue
		await closeRound(deps, session)
	}
}
