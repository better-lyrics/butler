import { PALETTE } from "@/config"
import {
	helpAdminLabel,
	helpConfigLine,
	helpCouncilLabel,
	helpCouncilLine,
	helpEveryoneLabel,
	helpHeading,
	helpMigrateLine,
	helpPowerLine,
	helpPreviewLine,
	helpReportLine,
	helpSealLine,
	helpSetupLine,
	helpSyncLine,
} from "@/copy/strings"
import { ContainerBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder } from "discord.js"
import type { CardPayload } from "./connect-card"

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

export function buildHelpCard(opts: { isAdmin: boolean }): CardPayload {
	const container = new ContainerBuilder()
		.setAccentColor(PALETTE.betterLyricsRed)
		.addTextDisplayComponents(text(helpHeading))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(helpEveryoneLabel), text(helpReportLine), text(helpMigrateLine))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(helpCouncilLabel), text(helpSealLine))

	if (opts.isAdmin) {
		container
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
			.addTextDisplayComponents(
				text(helpAdminLabel),
				text(helpSetupLine),
				text(helpConfigLine),
				text(helpCouncilLine),
				text(helpSyncLine),
				text(helpPowerLine),
				text(helpPreviewLine)
			)
	}

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
