# butler

The Better Lyrics community Discord bot. It does two things:

- Hands out curator roles based on where you land on the Unison leaderboard, re-synced hourly.
- Turns YouTube Music links posted in the report channel into "fix the lyrics" cards.

Account linking, identity, and the blacklist all live in Unison. butler reads from Unison and never runs the link flow itself.

## Stack

Node >= 22.12, TypeScript (ESM, strict), discord.js v14, Postgres via pg, youtubei.js, vitest, Biome. Bundled with esbuild.

## How it fits together

One process: a discord.js gateway client, no HTTP server. butler keeps a small Postgres for its own state (role holdings, which keep syncs idempotent, and per-guild config). Everything else (the link map, leaderboard, excluded keys, request board) comes from Unison. The business logic (URL parsing, album-art pick, tier math, the holdings diff, the request payload) is pure and tested with no network, database, or live Discord.

## Environment

Three are required. The rest default to production values.

| Variable | Required | Notes |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | yes | Discord bot token. |
| `DATABASE_URL` | yes | Postgres connection string. |
| `BUTLER_BOT_SECRET` | yes | Must match the value set on Unison. |
| `GUILD_ID` | yes | The one guild butler serves. Commands register only here, and it ignores every other server. |
| `UNISON_API_BASE_URL` | no | Defaults to `https://unison.boidu.dev`. |
| `LINK_PAGE_URL` | no | Defaults to `https://unison.boidu.dev/link`. |
| `COMPOSER_BASE_URL` | no | Defaults to `https://composer.betterlyrics.org`. |
| `YTM_COOKIE` | no | Throwaway Google account cookie for richer metadata. |

## Run it

```sh
pnpm install
pnpm dev                  # watch mode
pnpm build && pnpm start  # production: esbuild bundles to dist/, then node runs it
pnpm test                 # vitest
pnpm run typecheck
pnpm run lint
```

## In Discord

butler serves the single guild named in `GUILD_ID` and ignores every other server. Invite it with Manage Roles, Read Message History, and Use External Emojis, then drag its role above the five tier roles. Enable the MessageContent privileged intent.

It ships **dormant**. Run `/setup` (admin only) to record the channels and the five tier roles; it posts the connect card but assigns nothing yet. When you are ready, run `/activate`: it flips butler on and runs the first sync, which seeds and announces every current curator. `/deactivate` puts it back to sleep (no syncing, announcing, or report watching). `/sync` runs a sync on demand once active, otherwise it runs hourly. `/preview` renders any card for a quick look.

Tiers, highest to lowest: #1 Legendary Lyricist, #2 Grandmaster Lyricist, #3 Master Lyricist, top 5% Elite Lyricist, top 20% Lyricist.

## Council entry exam

The Council role goes through an exam, not a hand-out. A member runs `/council-apply`; butler checks they are account-linked and hold at least the minimum role (`/config exam-min-role`, which defaults to the Lyricist role and counts anyone ranked above it), and turns away anyone already on the Council. Eligible members get a one-time link to the exam, which Unison serves on the web, with the lyric guide to read first. Admins skip those checks so they can walk the flow themselves, and the tricky question content, answer keys, and grading all live on the Unison side.

Whoever passes surfaces two ways: butler posts them to the council channel on its own (on the hourly pass), and admins can pull the list any time with `/council-applicants`. Each applicant card has approve and reject, both behind a confirm step since neither can be undone from Discord. Approving grants the role, registers them in Unison, and DMs them a welcome. `/council-welcome-preview` sends that welcome to you so you can check it first.

## Deploy

Railway, as a worker. No public port, since butler only makes outbound calls. Set the three required vars (plus `DEV_GUILD_ID` while testing). If `BUTLER_BOT_SECRET` does not match Unison, the bot reads and the request POST will 401. There is no OAuth to configure here; that is Unison's side.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
