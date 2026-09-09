import {
	configAnnounceSet,
	configConnectFailed,
	configConnectSet,
	configCouncilRoleCleared,
	configCouncilRoleSet,
	configError,
	configGuildOnly,
	configModChannelCleared,
	configModChannelSet,
	configNoPermission,
	configReportSet,
	configReviewChannelCleared,
	configReviewChannelSet,
	configTierRoleSet,
} from "@/copy/strings"
import type { GuildConfig, GuildTextField } from "@/db/guild-config"
import { MessageFlags, PermissionFlagsBits } from "discord.js"
import { describe, expect, it } from "vitest"
import { type ConfigCommandDeps, type ConfigCommandInteraction, handleConfig } from "./config"

function sampleConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
	return {
		guildId: "g1",
		connectChannelId: "connect-1",
		reportChannelId: "report-1",
		announceChannelId: "announce-1",
		modChannelId: "mod-1",
		roleIds: { legendary: "1", grandmaster: "2", master: "3", elite: "4", lyricist: "5" },
		tierOverrides: null,
		councilRoleId: "council-1",
		reviewChannelId: "review-1",
		enabled: true,
		...overrides,
	}
}

function interaction(opts: {
	sub: string
	guildId?: string | null
	manage?: boolean
	channelId?: string
	roleId?: string
	tier?: string
	field?: string
}) {
	const replies: Array<{ content?: string; flags?: number }> = []
	const int: ConfigCommandInteraction = {
		guildId: opts.guildId === undefined ? "g1" : opts.guildId,
		memberPermissions: { has: () => opts.manage ?? true },
		options: {
			getSubcommand: () => opts.sub,
			getChannel: () => (opts.channelId ? { id: opts.channelId } : null),
			getRole: () => (opts.roleId ? { id: opts.roleId } : null),
			getString: (name) => {
				if (name === "tier") return opts.tier ?? null
				if (name === "field") return opts.field ?? null
				return null
			},
		},
		reply: async (p) => {
			replies.push(p as { content?: string; flags?: number })
		},
	}
	return { interaction: int, replies }
}

function deps(overrides: Partial<ConfigCommandDeps> = {}): {
	deps: ConfigCommandDeps
	calls: {
		setField: Array<[GuildTextField, string | null]>
		setTierRole: Array<[string, string]>
		postConnectCard: string[]
		getConfig: number
	}
} {
	const calls = {
		setField: [] as Array<[GuildTextField, string | null]>,
		setTierRole: [] as Array<[string, string]>,
		postConnectCard: [] as string[],
		getConfig: 0,
	}
	const base: ConfigCommandDeps = {
		setField: async (field, value) => {
			calls.setField.push([field, value])
		},
		setTierRole: async (tier, roleId) => {
			calls.setTierRole.push([tier, roleId])
		},
		getConfig: async () => {
			calls.getConfig++
			return sampleConfig()
		},
		postConnectCard: async (channelId) => {
			calls.postConnectCard.push(channelId)
			return true
		},
		...overrides,
	}
	return { deps: base, calls }
}

describe("handleConfig gates", () => {
	it("refuses outside a guild", async () => {
		const { interaction: int, replies } = interaction({ sub: "view", guildId: null })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(replies[0]?.content).toBe(configGuildOnly)
		expect(d.calls.getConfig).toBe(0)
	})

	it("refuses a member without Manage Server and writes nothing", async () => {
		const { interaction: int, replies } = interaction({
			sub: "mod-channel",
			manage: false,
			channelId: "mod-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(replies[0]?.content).toBe(configNoPermission)
		expect(d.calls.setField).toEqual([])
	})

	it("passes the Manage Server flag when checking", async () => {
		let checked: bigint | null = null
		const int: ConfigCommandInteraction = {
			guildId: "g1",
			memberPermissions: {
				has: (flag) => {
					checked = flag
					return true
				},
			},
			options: {
				getSubcommand: () => "view",
				getChannel: () => null,
				getRole: () => null,
				getString: () => null,
			},
			reply: async () => {},
		}
		await handleConfig(int, deps().deps)
		expect(checked).toBe(PermissionFlagsBits.ManageGuild)
	})
})

describe("handleConfig channel setters", () => {
	it("sets the connect channel and posts the connect card", async () => {
		const { interaction: int, replies } = interaction({
			sub: "connect-channel",
			channelId: "connect-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["connect", "connect-9"]])
		expect(d.calls.postConnectCard).toEqual(["connect-9"])
		expect(replies[0]?.content).toBe(configConnectSet)
	})

	it("notes when the connect card could not be posted but still saves the channel", async () => {
		const { interaction: int, replies } = interaction({
			sub: "connect-channel",
			channelId: "connect-9",
		})
		const d = deps({ postConnectCard: async () => false })
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["connect", "connect-9"]])
		expect(replies[0]?.content).toBe(configConnectFailed)
	})

	it("sets the report channel", async () => {
		const { interaction: int, replies } = interaction({
			sub: "report-channel",
			channelId: "report-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["report", "report-9"]])
		expect(replies[0]?.content).toBe(configReportSet)
	})

	it("sets the announce channel", async () => {
		const { interaction: int, replies } = interaction({
			sub: "announce-channel",
			channelId: "announce-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["announce", "announce-9"]])
		expect(replies[0]?.content).toBe(configAnnounceSet)
	})

	it("sets the mod channel", async () => {
		const { interaction: int, replies } = interaction({ sub: "mod-channel", channelId: "mod-9" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["mod", "mod-9"]])
		expect(replies[0]?.content).toBe(configModChannelSet)
	})

	it("sets the review channel", async () => {
		const { interaction: int, replies } = interaction({
			sub: "review-channel",
			channelId: "review-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["review", "review-9"]])
		expect(replies[0]?.content).toBe(configReviewChannelSet)
	})

	it("never posts the connect card for a non-connect channel", async () => {
		const { interaction: int } = interaction({ sub: "report-channel", channelId: "report-9" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.postConnectCard).toEqual([])
	})
})

describe("handleConfig role setters", () => {
	it("sets the council role", async () => {
		const { interaction: int, replies } = interaction({
			sub: "council-role",
			roleId: "council-9",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["council", "council-9"]])
		expect(replies[0]?.content).toBe(configCouncilRoleSet("<@&council-9>"))
	})

	it("sets a single tier role through setTierRole, not setField", async () => {
		const { interaction: int, replies } = interaction({
			sub: "tier-role",
			tier: "master",
			roleId: "role-m",
		})
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setTierRole).toEqual([["master", "role-m"]])
		expect(d.calls.setField).toEqual([])
		expect(replies[0]?.content).toBe(configTierRoleSet("master", "<@&role-m>"))
	})
})

describe("handleConfig clear", () => {
	it("clears the mod channel", async () => {
		const { interaction: int, replies } = interaction({ sub: "clear", field: "mod-channel" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["mod", null]])
		expect(replies[0]?.content).toBe(configModChannelCleared)
	})

	it("clears the council role", async () => {
		const { interaction: int, replies } = interaction({ sub: "clear", field: "council-role" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["council", null]])
		expect(replies[0]?.content).toBe(configCouncilRoleCleared)
	})

	it("clears the review channel", async () => {
		const { interaction: int, replies } = interaction({ sub: "clear", field: "review-channel" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.setField).toEqual([["review", null]])
		expect(replies[0]?.content).toBe(configReviewChannelCleared)
	})
})

describe("handleConfig view", () => {
	it("renders the current configuration as mentions", async () => {
		const { interaction: int, replies } = interaction({ sub: "view" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(d.calls.getConfig).toBe(1)
		const content = replies[0]?.content ?? ""
		expect(content).toContain("butler configuration")
		expect(content).toContain("<#connect-1>")
		expect(content).toContain("<#review-1>")
		expect(content).toContain("<@&council-1>")
		expect(content).toContain("master: <@&3>")
	})

	it("shows unset fields and the empty hint when nothing is configured", async () => {
		const { interaction: int, replies } = interaction({ sub: "view" })
		await handleConfig(int, deps({ getConfig: async () => null }).deps)
		expect(replies[0]?.content).toContain("Nothing is configured yet")
	})

	it("marks a missing optional field as not set", async () => {
		const { interaction: int, replies } = interaction({ sub: "view" })
		await handleConfig(
			int,
			deps({ getConfig: async () => sampleConfig({ modChannelId: null }) }).deps
		)
		expect(replies[0]?.content).toContain("Mod channel: not set")
	})
})

describe("edge cases", () => {
	it("shows a generic error when a channel option is missing", async () => {
		const { interaction: int, replies } = interaction({ sub: "mod-channel" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(replies[0]?.content).toBe(configError)
		expect(d.calls.setField).toEqual([])
	})

	it("shows a generic error for an unknown clear field and writes nothing", async () => {
		const { interaction: int, replies } = interaction({ sub: "clear", field: "connect-channel" })
		const d = deps()
		await handleConfig(int, d.deps)
		expect(replies[0]?.content).toBe(configError)
		expect(d.calls.setField).toEqual([])
	})

	it("shows a generic error for an unknown subcommand", async () => {
		const { interaction: int, replies } = interaction({ sub: "bogus" })
		await handleConfig(int, deps().deps)
		expect(replies[0]?.content).toBe(configError)
	})
})

describe("invariants", () => {
	it("replies ephemerally for every subcommand", async () => {
		const cases = [
			interaction({ sub: "connect-channel", channelId: "c" }),
			interaction({ sub: "council-role", roleId: "r" }),
			interaction({ sub: "tier-role", tier: "master", roleId: "r" }),
			interaction({ sub: "clear", field: "mod-channel" }),
			interaction({ sub: "view" }),
		]
		for (const { interaction: int, replies } of cases) {
			await handleConfig(int, deps().deps)
			expect(replies[0]?.flags).toBe(MessageFlags.Ephemeral)
		}
	})
})
