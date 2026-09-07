export interface TierConfig {
	podium: string[]
	special: { topPercent: number; tier: string }
	base: { topPercent: number; tier: string }
}
