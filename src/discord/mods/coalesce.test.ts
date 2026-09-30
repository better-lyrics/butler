import { describe, expect, it } from "vitest"
import { createCoalescer } from "./coalesce"

function manualClock() {
	const pending: Array<() => void> = []
	return {
		schedule: (run: () => void, _delayMs: number) => {
			pending.push(run)
		},
		flush: () => {
			for (const run of pending.splice(0)) run()
		},
		size: () => pending.length,
	}
}

describe("createCoalescer", () => {
	describe("happy paths", () => {
		it("runs the task once the delay passes", () => {
			const clock = manualClock()
			const runs: string[] = []
			const request = createCoalescer(
				5000,
				async (key: string) => {
					runs.push(key)
				},
				clock.schedule
			)
			request("s1")
			expect(runs).toEqual([])
			clock.flush()
			expect(runs).toEqual(["s1"])
		})

		it("folds a burst of requests for one key into a single run", () => {
			const clock = manualClock()
			const runs: string[] = []
			const request = createCoalescer(
				5000,
				async (key: string) => {
					runs.push(key)
				},
				clock.schedule
			)
			request("s1")
			request("s1")
			request("s1")
			expect(clock.size()).toBe(1)
			clock.flush()
			expect(runs).toEqual(["s1"])
		})
	})

	describe("cross-field interactions", () => {
		it("keeps separate keys independent", () => {
			const clock = manualClock()
			const runs: string[] = []
			const request = createCoalescer(
				5000,
				async (key: string) => {
					runs.push(key)
				},
				clock.schedule
			)
			request("s1")
			request("s2")
			clock.flush()
			expect(runs.sort()).toEqual(["s1", "s2"])
		})
	})

	describe("invariants", () => {
		it("accepts a new request for a key after its run fires", () => {
			const clock = manualClock()
			const runs: string[] = []
			const request = createCoalescer(
				5000,
				async (key: string) => {
					runs.push(key)
				},
				clock.schedule
			)
			request("s1")
			clock.flush()
			request("s1")
			clock.flush()
			expect(runs).toEqual(["s1", "s1"])
		})

		it("passes the delay through to the scheduler", () => {
			const delays: number[] = []
			const request = createCoalescer(
				5000,
				async () => {},
				(_run, delayMs) => {
					delays.push(delayMs)
				}
			)
			request("s1")
			expect(delays).toEqual([5000])
		})
	})

	describe("error paths", () => {
		it("regression: a failed run does not wedge the key", async () => {
			const clock = manualClock()
			let calls = 0
			const request = createCoalescer(
				5000,
				async () => {
					calls++
					throw new Error("discord 500")
				},
				clock.schedule
			)
			request("s1")
			clock.flush()
			await Promise.resolve()
			request("s1")
			expect(clock.size()).toBe(1)
			clock.flush()
			await Promise.resolve()
			expect(calls).toBe(2)
		})
	})
})
