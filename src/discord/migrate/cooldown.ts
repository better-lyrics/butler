export type CooldownResult = { allowed: true } | { allowed: false; retryAfterMs: number }

export interface Cooldown {
	check(discordId: string): CooldownResult
}

export function createCooldown(opts: { windowMs: number; now: () => number }): Cooldown {
	const last = new Map<string, number>()
	return {
		check(discordId) {
			const t = opts.now()
			const prev = last.get(discordId)
			if (prev !== undefined && t - prev < opts.windowMs) {
				return { allowed: false, retryAfterMs: opts.windowMs - (t - prev) }
			}
			last.set(discordId, t)
			return { allowed: true }
		},
	}
}
