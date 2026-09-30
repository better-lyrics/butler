export type Schedule = (run: () => void, delayMs: number) => void

// Folds a burst of requests per key into one delayed run, so a vote burst makes one message edit.
export function createCoalescer(
	delayMs: number,
	task: (key: string) => Promise<void>,
	schedule: Schedule
): (key: string) => void {
	const pending = new Set<string>()
	return (key) => {
		if (pending.has(key)) return
		pending.add(key)
		schedule(() => {
			pending.delete(key)
			task(key).catch((err) => console.error("coalesced task failed", err))
		}, delayMs)
	}
}
