import { PALETTE, UNISON_SITE_URL } from "@/config"
import {
	notificationActor,
	notificationDmFooter,
	notificationOpenSuggestionLabel,
	notificationSongLink,
	suggestionApprovedBody,
	suggestionApprovedTitle,
	suggestionDeadlineBody,
	suggestionDeadlineTitle,
	suggestionNewBody,
	suggestionNewTitle,
	suggestionRejectedNoteLabel,
	suggestionRejectedTitle,
} from "@/copy/strings"
import type { DiscordNotification } from "@/unison/client"
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	type MessageMentionOptions,
	TextDisplayBuilder,
} from "discord.js"
import { truncate } from "./truncate"

export const NOTIFICATIONS_PER_MESSAGE = 5
const MAX_NOTE = 1000

export interface NotificationMessage {
	components: (ContainerBuilder | TextDisplayBuilder)[]
	flags: number
	allowedMentions: MessageMentionOptions
}

type Song = NonNullable<DiscordNotification["song"]>

interface Lines {
	title: string
	body?: string
	note?: { label: string; text: string }
}

function decider(item: DiscordNotification): string | null {
	return item.data.decidedBy === "council" || !item.actor
		? null
		: notificationActor(item.actor.displayName)
}

function isWaiting(item: DiscordNotification): boolean {
	return item.refStatus === "pending"
}

// Keys mirror DM_KINDS in Unison src/notifications/kinds.ts.
const LINES: Record<string, (item: DiscordNotification, song: string) => Lines | null> = {
	suggestion_new: (item, song) => {
		if (!isWaiting(item)) return null
		const actor = notificationActor(item.actor?.displayName ?? null)
		return { title: suggestionNewTitle(song), body: suggestionNewBody(actor) }
	},
	suggestion_deadline: (item, song) => {
		if (!isWaiting(item)) return null
		const actor = notificationActor(item.actor?.displayName ?? null)
		return { title: suggestionDeadlineTitle(actor, song), body: suggestionDeadlineBody }
	},
	suggestion_approved: (item, song) => {
		if (item.data.revNo === undefined) return null
		return {
			title: suggestionApprovedTitle(song),
			body: suggestionApprovedBody(decider(item), item.data.revNo),
		}
	},
	suggestion_rejected: (item, song) => {
		const who = decider(item)
		const note = item.data.note?.trim()
		return {
			title: suggestionRejectedTitle(who, song),
			note: note ? { label: suggestionRejectedNoteLabel(who), text: note } : undefined,
		}
	},
}

function songUrl(song: Song, item: DiscordNotification): string {
	const url = `${UNISON_SITE_URL}/song/${song.videoId}?variantId=${song.lyricsId}`
	return isWaiting(item) ? `${url}&suggestion=${item.data.revisionId}` : url
}

function buildContainer(item: DiscordNotification): ContainerBuilder | null {
	const song = item.song
	if (!song) return null
	const lines = LINES[item.kind]?.(item, notificationSongLink(song.song, songUrl(song, item)))
	if (!lines) return null

	const text = lines.body ? `${lines.title}\n${lines.body}` : lines.title
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
	if (lines.note) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`**${lines.note.label}**\n>>> ${truncate(lines.note.text, MAX_NOTE)}`
			)
		)
	}
	if (isWaiting(item)) {
		container.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setStyle(ButtonStyle.Link)
					.setURL(songUrl(song, item))
					.setLabel(notificationOpenSuggestionLabel)
			)
		)
	}
	return container
}

export function buildNotificationMessages(items: DiscordNotification[]): NotificationMessage[] {
	const containers = items.flatMap((item) => buildContainer(item) ?? [])
	const messages: NotificationMessage[] = []
	for (let i = 0; i < containers.length; i += NOTIFICATIONS_PER_MESSAGE) {
		messages.push({
			components: [
				...containers.slice(i, i + NOTIFICATIONS_PER_MESSAGE),
				new TextDisplayBuilder().setContent(notificationDmFooter),
			],
			flags: MessageFlags.IsComponentsV2,
			allowedMentions: { parse: [] },
		})
	}
	return messages
}
