import { ALBUM_ART_SIZE, SYNC_INTERVAL_MS, TIERS, TIER_ORDER, loadConfig } from "@/config"
import { type GuildConfig, getGuildConfig, listGuildConfigs } from "@/db/guild-config"
import { deleteHolding, getAllHoldings, setHolding } from "@/db/holdings"
import { applySchema, createPool } from "@/db/pool"
import { createDiscordClient } from "@/discord/client"
import { handleSetup, setupCommand } from "@/discord/commands/setup"
import { buildPromotionCard } from "@/discord/components/promotion-card"
import { handleAddToBoard, handleReportMessage } from "@/discord/flows/report"
import { routeInteraction } from "@/discord/interactions/router"
import { assertRoleHierarchy, createRoleApplier } from "@/roles/apply"
import { runSync } from "@/roles/sync"
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

function isGuildMod(interaction: {
	memberPermissions: ButtonInteraction["memberPermissions"]
}): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
	const route = routeInteraction(interaction.customId)
	if (route?.handler !== "report.add") return

	await handleAddToBoard(interaction, {
		isMod: () => isGuildMod(interaction),
		fetchMeta,
		submitRequest: async (body) => {
			const r = await unison.submitBotRequest(body)
			if (r.status === "error") console.error("request submit failed", r.code)
			return r
		},
	})
}

async function handleMessage(message: Message): Promise<void> {
	if (message.author.bot) return
	const gc = message.guildId ? await getGuildConfig(pool, message.guildId) : null
	if (!gc?.reportChannelId || gc.reportChannelId !== message.channelId) return

	await handleReportMessage(message, {
		reportChannelId: gc.reportChannelId,
		fetchMeta,
		composerBaseUrl: config.composerBaseUrl,
	})
}

async function runSyncForGuild(gc: GuildConfig): Promise<void> {
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
			return
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
					displayName: promo.entry.displayName,
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
			return
		}
		console.log(
			`sync done for guild ${gc.guildId}: granted=${result.granted} removed=${result.removed} announced=${result.announced}`
		)
	} catch (err) {
		console.error(`sync failed for guild ${gc.guildId}`, err)
	}
}

let syncHandle: ReturnType<typeof setInterval> | null = null

async function runAll(): Promise<void> {
	for (const gc of await listGuildConfigs(pool)) {
		await runSyncForGuild(gc)
	}
}

discord.once(Events.ClientReady, async (client) => {
	console.log(`logged in as ${client.user.tag}`)
	try {
		await client.application.commands.set([setupCommand.toJSON()])
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
	if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
		handleSetup(interaction, { pool, linkPageUrl: config.linkPageUrl }).catch((err) =>
			console.error("setup handler failed", err)
		)
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
