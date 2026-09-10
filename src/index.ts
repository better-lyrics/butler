import {
	ALBUM_ART_SIZE,
	MIGRATE_COOLDOWN_MS,
	SYNC_INTERVAL_MS,
	TIER_ORDER,
	isReviewDue,
	loadConfig,
	shouldConnectToDiscord,
} from "@/config"
import { queueEmpty } from "@/copy/strings"
import { getBadgeHoldings, isSeeded, markSeeded, setBadgeHolding } from "@/db/badge-holdings"
import {
	type GuildConfig,
	getGuildConfig,
	getReviewLastPostedAt,
	listGuildConfigs,
	markReviewPosted,
	setGuildField,
	setTierRole,
} from "@/db/guild-config"
import { deleteHolding, getAllHoldings, setHolding } from "@/db/holdings"
import { applySchema, createPool } from "@/db/pool"
import { getBoard, getBoardCard, replaceBoard, updateBoardCard } from "@/db/review-board"
import { type PlannedCard, syncBoard } from "@/discord/board-sync"
import { createDiscordClient } from "@/discord/client"
import { configCommand, handleConfig } from "@/discord/commands/config"
import { type CouncilRoleOutcome, councilCommand, handleCouncil } from "@/discord/commands/council"
import { type DigestResult, digestCommand, handleDigest } from "@/discord/commands/digest"
import { handleHelp, helpCommand } from "@/discord/commands/help"
import { handleMigrate, migrateCommand } from "@/discord/commands/migrate"
import {
	activateCommand,
	deactivateCommand,
	handleActivate,
	handleDeactivate,
} from "@/discord/commands/power"
import { handlePreview, previewCommand } from "@/discord/commands/preview"
import {
	QUEUE_LIMIT,
	handleQueue,
	handleQueueReject,
	handleQueueRejectSubmit,
	handleQueueRejectUndo,
	handleQueueSeal,
	handleQueueSealCancel,
	handleQueueSealConfirm,
	handleQueueSealUndo,
	queueCommand,
} from "@/discord/commands/queue"
import { handleSeal, handleSealPick, handleSealUnpick, sealCommand } from "@/discord/commands/seal"
import { handleSetup, setupCommand } from "@/discord/commands/setup"
import { type SyncTrigger, handleSync, syncCommand } from "@/discord/commands/sync"
import { buildAnnounceSummaryCard } from "@/discord/components/announce-summary-card"
import { buildBadgeAwardCard } from "@/discord/components/badge-award-card"
import { buildConnectCard } from "@/discord/components/connect-card"
import { buildPromotionCard } from "@/discord/components/promotion-card"
import {
	buildBoardCard,
	buildQueueCard,
	buildQueueSealedCard,
} from "@/discord/components/queue-card"
import { handleAddToBoard, handleReportMessage } from "@/discord/flows/report"
import { routeInteraction } from "@/discord/interactions/router"
import { handleMigrateCommit, handleMigrateConfirm } from "@/discord/migrate/confirm"
import { handleMigrateContinue } from "@/discord/migrate/continue"
import { createCooldown } from "@/discord/migrate/cooldown"
import { type ModLogEvent, formatModLogEvent } from "@/discord/mod-log"
import { assertRoleHierarchy, createRoleApplier } from "@/roles/apply"
import { type SyncResult, runSync } from "@/roles/sync"
import { type QueueEntry, createUnisonClient } from "@/unison/client"
import { createYoutubeiSource, fetchTrackMeta } from "@/ytm/metadata"
import {
	type ButtonInteraction,
	Events,
	type Interaction,
	type Message,
	PermissionFlagsBits,
} from "discord.js"

const config = loadConfig(process.env)

const pool = createPool(config.databaseUrl)
await applySchema(pool)

const unison = createUnisonClient({
	baseUrl: config.unison.baseUrl,
	botSecret: config.unison.botSecret,
})

const migrateCooldown = createCooldown({ windowMs: MIGRATE_COOLDOWN_MS, now: () => Date.now() })

async function resolveKeyId(discordId: string): Promise<string | null> {
	const links = await unison.getBotLinks()
	return links.find((l) => l.discordId === discordId)?.keyId ?? null
}

async function setCouncilRole(discordId: string, on: boolean): Promise<CouncilRoleOutcome> {
	const gc = await getGuildConfig(pool, config.guildId)
	if (!gc?.councilRoleId) return "not_configured"
	try {
		const guild = await discord.guilds.fetch(config.guildId)
		const member = await guild.members.fetch(discordId).catch(() => null)
		if (!member) return "failed"
		if (on) await member.roles.add(gc.councilRoleId)
		else await member.roles.remove(gc.councilRoleId)
		return "done"
	} catch (err) {
		console.error("council role change failed", err)
		return "failed"
	}
}

async function postConnectCard(channelId: string): Promise<boolean> {
	const channel = await discord.channels.fetch(channelId).catch(() => null)
	if (!channel?.isTextBased() || !channel.isSendable()) return false
	return channel
		.send(buildConnectCard({ linkPageUrl: config.linkPageUrl }))
		.then(() => true)
		.catch(() => false)
}

const ytmSource = createYoutubeiSource(config.ytmCookie)
const fetchMeta = (videoId: string) => fetchTrackMeta(ytmSource, videoId, ALBUM_ART_SIZE)

const discord = createDiscordClient()

async function sendModLog(modChannelId: string | null, event: ModLogEvent): Promise<void> {
	if (!modChannelId) return
	const channel = await discord.channels.fetch(modChannelId).catch(() => null)
	if (!channel?.isTextBased() || !channel.isSendable()) return
	await channel.send(formatModLogEvent(event))
}

function modLog(modChannelId: string | null, event: ModLogEvent): void {
	sendModLog(modChannelId, event).catch((err) => console.error("mod log failed", err))
}

function isGuildMod(interaction: {
	memberPermissions: ButtonInteraction["memberPermissions"]
}): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
}

async function handleReportButton(interaction: ButtonInteraction): Promise<void> {
	const gc = interaction.guildId ? await getGuildConfig(pool, interaction.guildId) : null

	const outcome = await handleAddToBoard(interaction, {
		isMod: () => isGuildMod(interaction),
		fetchMeta,
		submitRequest: async (body) => {
			const r = await unison.submitBotRequest(body)
			if (r.status === "error") console.error("request submit failed", r.code)
			return r
		},
	})

	if (outcome && gc?.modChannelId) {
		modLog(gc.modChannelId, {
			kind: "request_result",
			discordId: outcome.posterId,
			title: outcome.title,
			artist: outcome.artist,
			result: outcome.result,
		})
	}
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
	const route = routeInteraction(interaction.customId)
	if (!route) return
	switch (route.handler) {
		case "report.add":
			await handleReportButton(interaction)
			return
		case "migrate.continue":
		case "migrate.nick":
			await handleMigrateContinue(interaction, {
				getMigrationStatus: (sessionId) => unison.getMigrationStatus(sessionId),
			})
			return
		case "migrate.confirm":
			await handleMigrateConfirm(interaction)
			return
		case "seal.pick":
			await handleSealPick(interaction, route.args[0] ?? "", {
				resolveKeyId,
				boostLyrics: (lyricsId, keyId) => unison.boostLyrics(lyricsId, keyId),
				linkPageUrl: config.linkPageUrl,
			})
			return
		case "seal.unpick":
			await handleSealUnpick(interaction, route.args[0] ?? "", {
				resolveKeyId,
				unboostLyrics: (lyricsId, keyId) => unison.unboostLyrics(lyricsId, keyId),
				linkPageUrl: config.linkPageUrl,
			})
			return
		case "queue.seal":
			await handleQueueSeal(interaction, route.args[0] ?? "")
			return
		case "queue.seal.confirm":
			await handleQueueSealConfirm(interaction, route.args[0] ?? "", {
				resolveKeyId,
				boostLyrics: (lyricsId, keyId) => unison.boostLyrics(lyricsId, keyId),
				sealBoardCard,
				linkPageUrl: config.linkPageUrl,
			})
			return
		case "queue.seal.cancel":
			await handleQueueSealCancel(interaction)
			return
		case "queue.seal.undo":
			await handleQueueSealUndo(interaction, route.args[0] ?? "", {
				resolveKeyId,
				unboostLyrics: (lyricsId, keyId) => unison.unboostLyrics(lyricsId, keyId),
				getEntry: boardEntry,
				markPending: markBoardPending,
				linkPageUrl: config.linkPageUrl,
			})
			return
		case "queue.reject":
			await handleQueueReject(interaction, route.args[0] ?? "")
			return
		case "queue.reject.undo":
			await handleQueueRejectUndo(interaction, route.args[0] ?? "", {
				resolveKeyId,
				unrejectLyric: (lyricsId, keyId) => unison.unrejectLyric(lyricsId, keyId),
				getEntry: boardEntry,
				markPending: markBoardPending,
				linkPageUrl: config.linkPageUrl,
			})
			return
	}
}

async function handleMessage(message: Message): Promise<void> {
	if (message.author.bot) return
	if (message.guildId !== config.guildId) return
	const gc = message.guildId ? await getGuildConfig(pool, message.guildId) : null
	if (!gc?.reportChannelId || gc.reportChannelId !== message.channelId) return
	if (!gc.enabled) return

	const outcome = await handleReportMessage(message, {
		reportChannelId: gc.reportChannelId,
		fetchMeta,
		composerBaseUrl: config.composerBaseUrl,
	})

	if (outcome && gc.modChannelId) {
		modLog(gc.modChannelId, {
			kind: "report_posted",
			discordId: outcome.posterId,
			title: outcome.meta?.title ?? outcome.videoId,
			artist: outcome.meta?.artist ?? "unknown artist",
		})
	}
}

async function runSyncForGuild(
	gc: GuildConfig,
	trigger: SyncTrigger = { kind: "scheduled" }
): Promise<SyncResult | null> {
	if (trigger.kind === "manual") {
		modLog(gc.modChannelId, { kind: "sync_triggered", discordId: trigger.byDiscordId })
	}
	try {
		const guild = await discord.guilds.fetch(gc.guildId)
		const botHighest = guild.members.me?.roles.highest.position ?? 0
		const managedPositions: number[] = []
		for (const roleId of Object.values(gc.roleIds)) {
			const role = guild.roles.cache.get(roleId)
			if (role) managedPositions.push(role.position)
		}

		try {
			assertRoleHierarchy(botHighest, managedPositions)
		} catch (err) {
			console.error(`sync skipped for guild ${gc.guildId}: hierarchy guard failed`, err)
			modLog(gc.modChannelId, {
				kind: "sync_failed",
				reason: "my role must sit above the tier roles",
			})
			return null
		}

		const applier = createRoleApplier(guild, gc.roleIds)

		const links = await unison.getBotLinks()
		const keyToDiscord = new Map(links.map((l) => [l.keyId, l.discordId]))

		const result = await runSync({
			getLeaderboard: () => unison.getLeaderboard(),
			resolveMember: async (keyId) => {
				const discordId = keyToDiscord.get(keyId)
				if (!discordId) return null
				const member = await guild.members.fetch(discordId).catch(() => null)
				return member ? { discordId } : null
			},
			getHoldings: () => getAllHoldings(pool, gc.guildId),
			applyMemberRoles: (id, tier) => applier.applyMemberRoles(id, tier),
			persistHolding: (id, tier) =>
				tier
					? setHolding(pool, id, gc.guildId, tier, Date.now())
					: deleteHolding(pool, id, gc.guildId),
			announcePromotion: async (promo) => {
				if (!gc.announceChannelId) return
				const channel = await discord.channels.fetch(gc.announceChannelId).catch(() => null)
				if (!channel?.isTextBased() || !channel.isSendable()) return
				const member = await guild.members.fetch(promo.discordId).catch(() => null)
				const card = buildPromotionCard({
					discordId: promo.discordId,
					avatarUrl: member?.displayAvatarURL() ?? "",
					tier: promo.tier,
					rank: promo.entry.rank,
					submissionCount: promo.entry.submissionCount,
					totalUpvotes: promo.entry.totalUpvotes,
				})
				await channel.send(card)
			},
			getUserBadges: (keyId) => unison.getUserBadges(keyId).catch(() => null),
			getBadgeCatalogue: () => unison.getBadgeCatalogue().catch(() => null),
			getBadgeHoldings: (discordId) => getBadgeHoldings(pool, discordId, gc.guildId),
			recordBadge: (discordId, badge) =>
				setBadgeHolding(pool, {
					discordId,
					guildId: gc.guildId,
					badgeKey: badge.badgeKey,
					tier: badge.tier,
					awardedAt: badge.awardedAt,
				}),
			isSeeded: (discordId) => isSeeded(pool, discordId, gc.guildId),
			markSeeded: (discordId, seededAt) => markSeeded(pool, discordId, gc.guildId, seededAt),
			announceBadge: async (input) => {
				if (!gc.announceChannelId) return true
				const channel = await discord.channels.fetch(gc.announceChannelId).catch(() => null)
				if (!channel?.isTextBased() || !channel.isSendable()) return true
				const member = await guild.members.fetch(input.discordId).catch(() => null)
				const card = buildBadgeAwardCard({
					discordId: input.discordId,
					avatarUrl: member?.displayAvatarURL() ?? null,
					badgeName: input.badgeName,
					badgeDescription: input.badgeDescription,
				})
				return channel
					.send(card)
					.then(() => true)
					.catch(() => false)
			},
			announceSummary: async (input) => {
				if (!gc.announceChannelId) return true
				const channel = await discord.channels.fetch(gc.announceChannelId).catch(() => null)
				if (!channel?.isTextBased() || !channel.isSendable()) return true
				const card = buildAnnounceSummaryCard({
					promotions: input.promotions,
					badges: input.badges,
				})
				return channel
					.send(card)
					.then(() => true)
					.catch(() => false)
			},
			now: () => Date.now(),
			tierOrder: TIER_ORDER,
			batchThreshold: config.announce.batchThreshold,
		})

		if (result.skipped) {
			console.warn(`sync skipped for guild ${gc.guildId}: empty desired set`)
			modLog(gc.modChannelId, { kind: "sync_skipped" })
		} else {
			console.log(
				`sync done for guild ${gc.guildId}: granted=${result.granted} removed=${result.removed} announced=${result.announced}`
			)
			for (const t of result.transitions) {
				if (t.from === null && t.to !== null) {
					modLog(gc.modChannelId, { kind: "role_granted", discordId: t.discordId, tier: t.to })
				} else if (t.to === null && t.from !== null) {
					modLog(gc.modChannelId, { kind: "role_removed", discordId: t.discordId, tier: t.from })
				} else if (t.from !== null && t.to !== null) {
					modLog(gc.modChannelId, {
						kind: "role_moved",
						discordId: t.discordId,
						from: t.from,
						to: t.to,
					})
				}
			}
			// Skip the heartbeat line for a scheduled run that changed nothing; manual runs and
			// any run with changes still report a summary so the channel reflects real activity.
			const noop = result.granted === 0 && result.removed === 0 && result.announced === 0
			if (!(trigger.kind === "scheduled" && noop)) {
				modLog(gc.modChannelId, {
					kind: "sync_summary",
					trigger: trigger.kind,
					granted: result.granted,
					removed: result.removed,
					announced: result.announced,
				})
			}
		}
		return result
	} catch (err) {
		console.error(`sync failed for guild ${gc.guildId}`, err)
		modLog(gc.modChannelId, { kind: "sync_failed", reason: String(err) })
		return null
	}
}

let syncHandle: ReturnType<typeof setInterval> | null = null
let reviewHandle: ReturnType<typeof setInterval> | null = null

async function runAll(): Promise<void> {
	for (const gc of await listGuildConfigs(pool)) {
		if (gc.guildId !== config.guildId) continue
		if (!gc.enabled) continue
		await runSyncForGuild(gc)
	}
}

async function deleteBoardMessages(
	refs: { channelId: string; messageId: string }[]
): Promise<void> {
	const byChannel = new Map<string, string[]>()
	for (const ref of refs) {
		byChannel.set(ref.channelId, [...(byChannel.get(ref.channelId) ?? []), ref.messageId])
	}
	for (const [channelId, ids] of byChannel) {
		const channel = await discord.channels.fetch(channelId).catch(() => null)
		if (!channel?.isTextBased()) continue
		for (const id of ids) {
			await channel.messages
				.delete(id)
				.catch((err) => console.error("board message delete failed", err))
		}
	}
}

async function editBoardMessage(
	channelId: string,
	messageId: string,
	payload: ReturnType<typeof buildQueueCard>
): Promise<void> {
	const channel = await discord.channels.fetch(channelId).catch(() => null)
	if (!channel?.isTextBased()) return
	await channel.messages
		.edit(messageId, payload)
		.catch((err) => console.error("board card edit failed", err))
}

async function sealBoardCard(lyricsId: string, actorId: string): Promise<void> {
	const card = await getBoardCard(pool, config.guildId, lyricsId)
	if (!card) return
	await updateBoardCard(pool, config.guildId, lyricsId, { state: "sealed", actorId })
	await editBoardMessage(card.channelId, card.messageId, buildQueueSealedCard(card.entry, actorId))
}

async function boardEntry(lyricsId: string): Promise<QueueEntry | null> {
	return (await getBoardCard(pool, config.guildId, lyricsId))?.entry ?? null
}

async function markBoardPending(lyricsId: string): Promise<void> {
	await updateBoardCard(pool, config.guildId, lyricsId, {
		state: "pending",
		actorId: null,
		note: null,
	})
}

async function markBoardRejected(
	lyricsId: string,
	actorId: string,
	note: string | null
): Promise<void> {
	await updateBoardCard(pool, config.guildId, lyricsId, { state: "rejected", actorId, note })
}

async function advanceBoard(opts: { force: boolean; now?: number }): Promise<DigestResult> {
	const now = opts.now ?? Date.now()
	const gc = await getGuildConfig(pool, config.guildId)
	if (!gc?.reviewChannelId) return "no_channel"
	if (!gc.enabled) return "disabled"
	if (!opts.force && !isReviewDue(await getReviewLastPostedAt(pool, config.guildId), now)) {
		return "skipped"
	}
	const channel = await discord.channels.fetch(gc.reviewChannelId).catch(() => null)
	if (!channel?.isTextBased() || !channel.isSendable()) return "no_channel"
	const result = await unison.getLyricsQueue("top-rated", QUEUE_LIMIT)
	if (result.status !== "ok") return "skipped"

	const previous = await getBoard(pool, config.guildId)

	if (result.entries.length === 0) {
		await deleteBoardMessages(previous)
		await replaceBoard(pool, config.guildId, [])
		if (previous.length > 0) {
			await channel.send(queueEmpty).catch((err) => console.error("review board post failed", err))
		}
		await markReviewPosted(pool, config.guildId, now)
		return "empty"
	}

	const planned: PlannedCard[] = result.entries.map((entry) => ({
		send: async () => {
			const message = await channel.send(buildQueueCard(entry)).catch((err) => {
				console.error("review board post failed", err)
				return null
			})
			return message?.id ?? null
		},
		build: (messageId) => ({
			lyricId: String(entry.id),
			messageId,
			channelId: channel.id,
			state: "pending",
			actorId: null,
			note: null,
			entry,
		}),
	}))
	const synced = await syncBoard(previous, planned, {
		deleteMessages: deleteBoardMessages,
		persist: (cards) => replaceBoard(pool, config.guildId, cards),
	})
	if (synced === "failed") return "skipped"
	await markReviewPosted(pool, config.guildId, now)
	return "posted"
}

async function resendBoard(): Promise<"posted" | "empty" | "failed"> {
	const gc = await getGuildConfig(pool, config.guildId)
	if (!gc?.reviewChannelId) return "empty"
	const rows = await getBoard(pool, config.guildId)
	if (rows.length === 0) return "empty"
	const channel = await discord.channels.fetch(gc.reviewChannelId).catch(() => null)
	if (!channel?.isTextBased() || !channel.isSendable()) return "empty"

	const planned: PlannedCard[] = rows.map((row) => ({
		send: async () => {
			const message = await channel.send(buildBoardCard(row)).catch((err) => {
				console.error("review board resend failed", err)
				return null
			})
			return message?.id ?? null
		},
		build: (messageId) => ({ ...row, messageId, channelId: channel.id }),
	}))
	return syncBoard(rows, planned, {
		deleteMessages: deleteBoardMessages,
		persist: (cards) => replaceBoard(pool, config.guildId, cards),
	})
}

discord.once(Events.ClientReady, async (client) => {
	console.log(`logged in as ${client.user.tag}`)
	try {
		// butler serves exactly one guild. Register guild-scoped (instant, never shows elsewhere)
		// and wipe any global commands left over from earlier deploys.
		const commands = [
			setupCommand.toJSON(),
			syncCommand.toJSON(),
			previewCommand.toJSON(),
			activateCommand.toJSON(),
			deactivateCommand.toJSON(),
			migrateCommand.toJSON(),
			sealCommand.toJSON(),
			councilCommand.toJSON(),
			configCommand.toJSON(),
			queueCommand.toJSON(),
			digestCommand.toJSON(),
			helpCommand.toJSON(),
		]
		await client.application.commands.set(commands, config.guildId)
		await client.application.commands.set([])
	} catch (err) {
		console.error("failed to register slash commands", err)
	}
	await runAll()
	await advanceBoard({ force: false }).catch((err) =>
		console.error("startup review board failed", err)
	)
	syncHandle = setInterval(() => {
		runAll().catch((err) => console.error("scheduled sync failed", err))
	}, SYNC_INTERVAL_MS)
	reviewHandle = setInterval(() => {
		advanceBoard({ force: false }).catch((err) =>
			console.error("scheduled review board failed", err)
		)
	}, SYNC_INTERVAL_MS)
})

discord.on(Events.MessageCreate, (message) => {
	handleMessage(message).catch((err) => console.error("message handler failed", err))
})

discord.on(Events.InteractionCreate, (interaction: Interaction) => {
	// butler only acts in its one guild; ignore anything from anywhere else.
	if (interaction.guildId !== config.guildId) return
	if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
		handleSetup(interaction, { pool, linkPageUrl: config.linkPageUrl })
			.then((saved) => {
				if (saved?.modChannelId) {
					modLog(saved.modChannelId, { kind: "setup_updated", discordId: interaction.user.id })
				}
			})
			.catch((err) => console.error("setup handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "sync") {
		handleSync(interaction, { pool, runSyncForGuild }).catch((err) =>
			console.error("sync handler failed", err)
		)
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "activate") {
		handleActivate(interaction, { pool, runSyncForGuild })
			.then((out) => {
				if (out.changed) {
					modLog(out.modChannelId, {
						kind: "power_toggled",
						discordId: interaction.user.id,
						on: true,
					})
				}
			})
			.catch((err) => console.error("activate handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "deactivate") {
		handleDeactivate(interaction, { pool, runSyncForGuild })
			.then((out) => {
				if (out.changed) {
					modLog(out.modChannelId, {
						kind: "power_toggled",
						discordId: interaction.user.id,
						on: false,
					})
				}
			})
			.catch((err) => console.error("deactivate handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "preview") {
		handlePreview(interaction, {
			linkPageUrl: config.linkPageUrl,
			composerBaseUrl: config.composerBaseUrl,
			fetchMeta,
		}).catch((err) => console.error("preview handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "migrate") {
		handleMigrate(interaction, {
			startMigration: (discordId) => unison.startMigration(discordId),
			getMigrationStatus: (sessionId) => unison.getMigrationStatus(sessionId),
			cooldown: migrateCooldown,
			linkPageUrl: config.linkPageUrl,
			now: () => Date.now(),
			schedule: (callback, delayMs) => {
				setTimeout(callback, delayMs)
			},
		}).catch((err) => console.error("migrate handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "seal") {
		handleSeal(interaction, {
			resolveKeyId,
			getBoostQuota: (keyId) => unison.getBoostQuota(keyId),
			getVariants: (videoId) => unison.getLyricsVariants(videoId),
			linkPageUrl: config.linkPageUrl,
		}).catch((err) => console.error("seal handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "help") {
		handleHelp(interaction).catch((err) => console.error("help handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "council") {
		handleCouncil(interaction, {
			resolveKeyId,
			listLinks: () => unison.getBotLinks(),
			addCouncilMember: (keyId) => unison.addCouncilMember(keyId),
			removeCouncilMember: (keyId) => unison.removeCouncilMember(keyId),
			getCouncil: () => unison.getCouncil(),
			grantCouncilRole: (id) => setCouncilRole(id, true),
			revokeCouncilRole: (id) => setCouncilRole(id, false),
		}).catch((err) => console.error("council handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "queue") {
		handleQueue(interaction, {
			resolveKeyId,
			getBoostQuota: (keyId) => unison.getBoostQuota(keyId),
			resendBoard,
			linkPageUrl: config.linkPageUrl,
		}).catch((err) => console.error("queue handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "digest") {
		handleDigest(interaction, {
			runDigest: async () => {
				const result = await advanceBoard({ force: true })
				if (result === "posted" || result === "empty") {
					const gc = await getGuildConfig(pool, config.guildId)
					modLog(gc?.modChannelId ?? null, {
						kind: "digest_triggered",
						discordId: interaction.user.id,
					})
				}
				return result
			},
		}).catch((err) => console.error("digest handler failed", err))
		return
	}
	if (interaction.isChatInputCommand() && interaction.commandName === "config") {
		handleConfig(interaction, {
			setField: (field, value) => setGuildField(pool, config.guildId, field, value),
			setTierRole: (tier, roleId) => setTierRole(pool, config.guildId, tier, roleId),
			getConfig: () => getGuildConfig(pool, config.guildId),
			postConnectCard,
		}).catch((err) => console.error("config handler failed", err))
		return
	}
	if (interaction.isButton()) {
		handleButton(interaction).catch((err) => console.error("button handler failed", err))
		return
	}
	if (interaction.isStringSelectMenu()) {
		const route = routeInteraction(interaction.customId)
		const lyricsId = interaction.values[0] ?? ""
		if (route?.handler === "seal.pick") {
			handleSealPick(interaction, lyricsId, {
				resolveKeyId,
				boostLyrics: (id, keyId) => unison.boostLyrics(id, keyId),
				linkPageUrl: config.linkPageUrl,
			}).catch((err) => console.error("seal pick handler failed", err))
		} else if (route?.handler === "seal.unpick") {
			handleSealUnpick(interaction, lyricsId, {
				resolveKeyId,
				unboostLyrics: (id, keyId) => unison.unboostLyrics(id, keyId),
				linkPageUrl: config.linkPageUrl,
			}).catch((err) => console.error("seal unpick handler failed", err))
		}
		return
	}
	if (interaction.isModalSubmit()) {
		const modalRoute = routeInteraction(interaction.customId)
		if (modalRoute?.handler === "migrate.commit") {
			handleMigrateCommit(interaction, {
				getMigrationStatus: (sessionId) => unison.getMigrationStatus(sessionId),
				commitMigration: (sessionId, discordId, keepNickname) =>
					unison.commitMigration(sessionId, discordId, keepNickname),
			}).catch((err) => console.error("migrate commit handler failed", err))
		} else if (modalRoute?.handler === "queue.reject.submit" && interaction.isFromMessage()) {
			handleQueueRejectSubmit(interaction, modalRoute.args[0] ?? "", {
				resolveKeyId,
				rejectLyric: (id, keyId, note) => unison.rejectLyric(id, keyId, note),
				getEntry: boardEntry,
				markRejected: markBoardRejected,
				linkPageUrl: config.linkPageUrl,
			}).catch((err) => console.error("queue reject submit handler failed", err))
		}
	}
})

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, async () => {
		if (syncHandle) clearInterval(syncHandle)
		if (reviewHandle) clearInterval(reviewHandle)
		await discord.destroy()
		await pool.end()
		process.exit(0)
	})
}

if (shouldConnectToDiscord(process.env)) {
	await discord.login(config.discordBotToken)
} else {
	console.log(
		`Butler stays offline in ${process.env.RAILWAY_ENVIRONMENT_NAME}; only production connects to Discord.`
	)
	// Keep alive without a gateway; a never-resolving top-level await exits with code 13 here.
	setInterval(() => {}, 1 << 30)
}
