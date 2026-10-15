import { COUNCIL_DASHBOARD_URL } from "@/config"
import type { BookmarkItemType } from "./client"

type CouncilItemType = BookmarkItemType | "flags"

const SECTIONS: Record<CouncilItemType, string> = {
	seal: "queue",
	edit: "edits",
	flags: "flags",
}

export function councilItemUrl(itemType: CouncilItemType, itemId: number): string {
	return `${COUNCIL_DASHBOARD_URL}/${SECTIONS[itemType]}?item=${itemId}`
}
