import { COUNCIL_DASHBOARD_URL } from "@/config"
import type { BookmarkItemType } from "./client"

export function councilItemUrl(itemType: BookmarkItemType, itemId: number): string {
	const section = itemType === "seal" ? "queue" : "edits"
	return `${COUNCIL_DASHBOARD_URL}/${section}?item=${itemId}`
}
