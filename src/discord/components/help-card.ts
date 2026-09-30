import { PALETTE } from "@/config"
import {
	helpAdminLabel,
	helpApplicantsLine,
	helpApplyLine,
	helpConfigLine,
	helpCouncilLabel,
	helpCouncilLine,
	helpCouncilReportLine,
	helpDigestLine,
	helpEveryoneLabel,
	helpHeading,
	helpMigrateLine,
	helpModsApplyLine,
	helpModsLine,
	helpModsSetupLine,
	helpPowerLine,
	helpPreviewLine,
	helpQueueLine,
	helpReportLine,
	helpSealLine,
	helpSetupLine,
	helpSyncLine,
	helpWelcomePreviewLine,
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
		.addTextDisplayComponents(
			text(helpEveryoneLabel),
			text(helpReportLine),
			text(helpMigrateLine),
			text(helpApplyLine),
			text(helpModsApplyLine)
		)
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
		.addTextDisplayComponents(text(helpCouncilLabel), text(helpSealLine), text(helpQueueLine))

	if (opts.isAdmin) {
		container
			.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
			.addTextDisplayComponents(
				text(helpAdminLabel),
				text(helpSetupLine),
				text(helpConfigLine),
				text(helpCouncilLine),
				text(helpApplicantsLine),
				text(helpCouncilReportLine),
				text(helpWelcomePreviewLine),
				text(helpModsSetupLine),
				text(helpModsLine),
				text(helpSyncLine),
				text(helpDigestLine),
				text(helpPowerLine),
				text(helpPreviewLine)
			)
	}

	return { components: [container], flags: MessageFlags.IsComponentsV2 }
}
