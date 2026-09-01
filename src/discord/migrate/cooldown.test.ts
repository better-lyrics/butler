import { describe, expect, it } from "vitest"
import { createCooldown } from "./cooldown"

function clock(start = 0) {
	let t = start
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms
		},
	}
}

describe("createCooldown happy path", () => {
	it("allows the first call for a discord id", () => {
		const c = clock()
		const cooldown = createCooldown({ windowMs: 10_000, now: c.now })
		expect(cooldown.check("disc-1")).toEqual({ allowed: true })
	})
})

describe("createCooldown edge cases", () => {
	it("denies a second call inside the window with the remaining time", () => {
		const c = clock()
		const cooldown = createCooldown({ windowMs: 10_000, now: c.now })
		cooldown.check("disc-1")
		c.advance(3_000)
		expect(cooldown.check("disc-1")).toEqual({ allowed: false, retryAfterMs: 7_000 })
	})

	it("allows again once the window has fully elapsed", () => {
		const c = clock()
		const cooldown = createCooldown({ windowMs: 10_000, now: c.now })
		cooldown.check("disc-1")
		c.advance(10_000)
		expect(cooldown.check("disc-1")).toEqual({ allowed: true })
	})

	it("tracks each discord id independently", () => {
		const c = clock()
		const cooldown = createCooldown({ windowMs: 10_000, now: c.now })
		cooldown.check("disc-1")
		expect(cooldown.check("disc-2")).toEqual({ allowed: true })
	})
})
