export function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
