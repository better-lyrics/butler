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
| `UNISON_API_BASE_URL` | no | Defaults to `https://unison.boidu.dev`. |
| `LINK_PAGE_URL` | no | Defaults to `https://unison.boidu.dev/link`. |
| `COMPOSER_BASE_URL` | no | Defaults to `https://composer.betterlyrics.org`. |
| `YTM_COOKIE` | no | Throwaway Google account cookie for richer metadata. |
| `DEV_GUILD_ID` | no | Set it to register slash commands to one guild instantly instead of waiting on global propagation. |

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

Invite the bot with Manage Roles and drag its role above the five tier roles. Enable the MessageContent privileged intent. Then run `/setup` (admin only) to record the channels and the five tier roles; it posts the connect card. `/sync` runs a role sync on demand, otherwise it runs hourly.

Tiers, highest to lowest: #1 Legendary Lyricist, #2 Grandmaster Lyricist, #3 Master Lyricist, top 5% Elite Lyricist, top 20% Lyricist.

## Deploy

Railway, as a worker. No public port, since butler only makes outbound calls. Set the three required vars (plus `DEV_GUILD_ID` while testing). If `BUTLER_BOT_SECRET` does not match Unison, the bot reads and the request POST will 401. There is no OAuth to configure here; that is Unison's side.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
