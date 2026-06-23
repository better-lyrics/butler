import { connectButtonLabel } from "@/copy/strings"
import type { ContainerBuilder } from "discord.js"
import { ButtonStyle, MessageFlags } from "discord.js"
import { describe, expect, it } from "vitest"
import { buildConnectCard } from "./connect-card"

interface ButtonNode {
	type: 2
	style: number
	custom_id?: string
	url?: string
	label?: string
}

interface ThumbnailNode {
	type: 11
	media: { url: string }
}

interface TextNode {
	type: 10
	content: string
}

interface ComponentNode {
	type: number
	content?: string
	url?: string
	custom_id?: string
	media?: { url: string }
	components?: ComponentNode[]
	accessory?: ComponentNode
}

function walk(node: ComponentNode, out: ComponentNode[]): void {
	out.push(node)
	if (node.components) {
		for (const child of node.components) {
			walk(child, out)
		}
	}
	if (node.accessory) {
		walk(node.accessory, out)
	}
}

function collect(container: ContainerBuilder): ComponentNode[] {
	const json = container.toJSON() as unknown as ComponentNode
	const out: ComponentNode[] = []
	walk(json, out)
	return out
}

function buttons(container: ContainerBuilder): ButtonNode[] {
	return collect(container).filter((n): n is ButtonNode => n.type === 2)
}

function thumbnails(container: ContainerBuilder): ThumbnailNode[] {
	return collect(container).filter((n): n is ThumbnailNode => n.type === 11)
}

function texts(container: ContainerBuilder): TextNode[] {
	return collect(container).filter((n): n is TextNode => n.type === 10)
}

const linkPageUrl = "https://link.example.com/abc"

describe("connect card", () => {
	it("has a single link button pointing at the link page url", () => {
		const payload = buildConnectCard({ linkPageUrl })
		const found = buttons(payload.components[0] as ContainerBuilder)
		expect(found).toHaveLength(1)
		expect(found[0]?.url).toBe(linkPageUrl)
		expect(found[0]?.style).toBe(ButtonStyle.Link)
		expect(found[0]?.label).toBe(connectButtonLabel)
	})

	it("has no custom-id on the link button", () => {
		const payload = buildConnectCard({ linkPageUrl })
		expect(buttons(payload.components[0] as ContainerBuilder)[0]?.custom_id).toBeUndefined()
	})

	it("includes the prompt body text", () => {
		const payload = buildConnectCard({ linkPageUrl })
		const content = texts(payload.components[0] as ContainerBuilder)
			.map((t) => t.content)
			.join("\n")
		expect(content.length).toBeGreaterThan(0)
	})

	it("has no thumbnail", () => {
		const payload = buildConnectCard({ linkPageUrl })
		expect(thumbnails(payload.components[0] as ContainerBuilder)).toHaveLength(0)
	})

	it("flags are non-ephemeral components v2", () => {
		const payload = buildConnectCard({ linkPageUrl })
		expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
	})
})
