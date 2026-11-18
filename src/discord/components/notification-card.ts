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
import { MAX_MESSAGE_TEXT } from "./limits"
import { truncate } from "./truncate"

export const NOTIFICATIONS_PER_MESSAGE = 5
const MAX_NAME = 100
const MAX_NOTE = 500

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

function actorName(item: DiscordNotification): string | null {
	return item.actor ? truncate(item.actor.displayName, MAX_NAME) : null
}

function decider(item: DiscordNotification): string | null {
	const name = item.data.decidedBy === "council" ? null : actorName(item)
	return name === null ? null : notificationActor(name)
}

function isWaiting(item: DiscordNotification): boolean {
	return item.refStatus === "pending"
}

// Keys mirror DM_KINDS in Unison src/notifications/kinds.ts.
const LINES: Record<string, (item: DiscordNotification, song: string) => Lines | null> = {
	suggestion_new: (item, song) => {
		if (!isWaiting(item)) return null
		const actor = notificationActor(actorName(item))
		return { title: suggestionNewTitle(song), body: suggestionNewBody(actor) }
	},
	suggestion_deadline: (item, song) => {
		if (!isWaiting(item)) return null
		const actor = notificationActor(actorName(item))
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

interface Card {
	container: ContainerBuilder
	textLength: number
}

function buildCard(item: DiscordNotification): Card | null {
	const song = item.song
	if (!song) return null
	const lines = LINES[item.kind]?.(
		item,
		notificationSongLink(truncate(song.song, MAX_NAME), songUrl(song, item))
	)
	if (!lines) return null

	const text = lines.body ? `${lines.title}\n${lines.body}` : lines.title
	const note = lines.note
		? `**${lines.note.label}**\n>>> ${truncate(lines.note.text, MAX_NOTE)}`
		: null
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
	if (note) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(note))
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
	return { container, textLength: text.length + (note?.length ?? 0) }
}

function toMessage(cards: Card[]): NotificationMessage {
	return {
		components: [
			...cards.map((card) => card.container),
			new TextDisplayBuilder().setContent(notificationDmFooter),
		],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { parse: [] },
	}
}

export function buildNotificationMessages(items: DiscordNotification[]): NotificationMessage[] {
	const budget = MAX_MESSAGE_TEXT - notificationDmFooter.length
	const messages: NotificationMessage[] = []
	let batch: Card[] = []
	let used = 0
	for (const card of items.flatMap((item) => buildCard(item) ?? [])) {
		const full = batch.length === NOTIFICATIONS_PER_MESSAGE || used + card.textLength > budget
		if (batch.length > 0 && full) {
			messages.push(toMessage(batch))
			batch = []
			used = 0
		}
		batch.push(card)
		used += card.textLength
	}
	if (batch.length > 0) messages.push(toMessage(batch))
	return messages
}
