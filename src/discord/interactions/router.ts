import { decodeCustomId } from "@/interactions/custom-id"

/** Name of the handler an interaction is dispatched to. */
export type HandlerName = "report.add"

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
	if (decoded.action === "report.add") {
		return { handler: "report.add", args: decoded.args }
	}
	return null
}
