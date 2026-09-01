import { decodeCustomId } from "@/interactions/custom-id"

/** Name of the handler an interaction is dispatched to. */
export type HandlerName = "report.add" | "migrate.continue" | "migrate.nick" | "migrate.confirm"

const HANDLERS: readonly HandlerName[] = [
	"report.add",
	"migrate.continue",
	"migrate.nick",
	"migrate.confirm",
]

/** A resolved interaction route: which handler to run and its decoded args. */
export interface Route {
	handler: HandlerName
	args: string[]
}

/**
 * Map an interaction `customId` to its handler route.
 *
 * Pure: decodes the id and switches on the known action. Returns `null` for
 * unknown actions and unparseable ids.
 */
export function routeInteraction(customId: string): Route | null {
	const decoded = decodeCustomId(customId)
	if (!decoded) {
		return null
	}
	const handler = HANDLERS.find((h) => h === decoded.action)
	return handler ? { handler, args: decoded.args } : null
}
