import { ALBUM_ART_SIZE, SYNC_INTERVAL_MS, TIERS, TIER_ORDER, loadConfig } from "@/config"
import { type GuildConfig, getGuildConfig, listGuildConfigs } from "@/db/guild-config"
import { deleteHolding, getAllHoldings, setHolding } from "@/db/holdings"
import { applySchema, createPool } from "@/db/pool"
import { createDiscordClient } from "@/discord/client"
import {
	activateCommand,
	deactivateCommand,
	handleActivate,
	handleDeactivate,
} from "@/discord/commands/power"
import { handlePreview, previewCommand } from "@/discord/commands/preview"
import { handleSetup, setupCommand } from "@/discord/commands/setup"
import { type SyncTrigger, handleSync, syncCommand } from "@/discord/commands/sync"
import { buildPromotionCard } from "@/discord/components/promotion-card"
import { handleAddToBoard, handleReportMessage } from "@/discord/flows/report"
import { routeInteraction } from "@/discord/interactions/router"
import { type ModLogEvent, formatModLogEvent } from "@/discord/mod-log"
import { assertRoleHierarchy, createRoleApplier } from "@/roles/apply"
import { type SyncResult, runSync } from "@/roles/sync"
import { createUnisonClient } from "@/unison/client"
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

async function handleButton(interaction: ButtonInteraction): Promise<void> {
	const route = routeInteraction(interaction.customId)
	if (route?.handler !== "report.add") return

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
			getBlacklist: () => unison.getBotBlacklist(),
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
			tiers: TIERS,
			tierOrder: TIER_ORDER,
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

async function runAll(): Promise<void> {
	for (const gc of await listGuildConfigs(pool)) {
		if (gc.guildId !== config.guildId) continue
		if (!gc.enabled) continue
		await runSyncForGuild(gc)
	}
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
		]
		await client.application.commands.set(commands, config.guildId)
		await client.application.commands.set([])
	} catch (err) {
		console.error("failed to register slash commands", err)
	}
	await runAll()
	syncHandle = setInterval(() => {
		runAll().catch((err) => console.error("scheduled sync failed", err))
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
	if (interaction.isButton()) {
		handleButton(interaction).catch((err) => console.error("button handler failed", err))
	}
})

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, async () => {
		if (syncHandle) clearInterval(syncHandle)
		await discord.destroy()
		await pool.end()
		process.exit(0)
	})
}

await discord.login(config.discordBotToken)
