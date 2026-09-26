import type { DiscordProfile, UnisonClient } from "@/unison/client"

const BATCH_SIZE = 100

export interface ProfilePushOutcome {
	updated: number
	notDeployed: boolean
	failures: string[]
}

export function toDiscordProfile(user: {
	id: string
	avatar: string | null
	globalName: string | null
	username: string
}): DiscordProfile {
	return { discordId: user.id, avatar: user.avatar, username: user.globalName ?? user.username }
}

export async function pushDiscordProfiles(
	client: Pick<UnisonClient, "syncDiscordProfiles">,
	profiles: DiscordProfile[]
): Promise<ProfilePushOutcome> {
	const outcome: ProfilePushOutcome = { updated: 0, notDeployed: false, failures: [] }
	for (let start = 0; start < profiles.length; start += BATCH_SIZE) {
		const chunk = profiles.slice(start, start + BATCH_SIZE)
		const label = `profiles ${start + 1}-${start + chunk.length} of ${profiles.length}`
		try {
			const result = await client.syncDiscordProfiles(chunk)
			if (result.status === "not_deployed") {
				outcome.notDeployed = true
				return outcome
			}
			if (result.status === "error") {
				outcome.failures.push(`${label}: HTTP ${result.code}`)
				continue
			}
			outcome.updated += result.updated
		} catch (err) {
			outcome.failures.push(`${label}: ${String(err)}`)
		}
	}
	return outcome
}
