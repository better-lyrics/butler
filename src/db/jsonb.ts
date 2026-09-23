// Real pg returns JSONB parsed, but pg-mem returns the raw string.
export function parseJsonb<T>(value: unknown): T {
	return (typeof value === "string" ? JSON.parse(value) : value) as T
}
