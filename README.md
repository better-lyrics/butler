# butler

butler is the Better Lyrics community Discord bot. It does two things, both wired into Unison (the Better Lyrics crowdsource backend). It hands out curator roles based on where members sit on the Unison leaderboard and re-syncs every hour. And it turns YouTube Music links posted in a report channel into cards for fixing wrong lyrics. Account linking is owned entirely by Unison, so butler reads who is who from Unison rather than running any of the link flow itself.

## Tech stack

- Node >= 22.12
- TypeScript, ESM, strict mode
- discord.js v14 for the gateway client
- Postgres through pg
- youtubei.js for YouTube Music metadata
- vitest for tests
- Biome for lint and format

## Architecture

One process, a discord.js gateway client and nothing else.

butler logs into the Discord gateway, reads messages, handles interactions, runs the slash command, and assigns roles (see `src/index.ts`). There is no HTTP server. butler accepts no inbound web traffic of any kind, and it does not run OAuth, verify signatures, or expose any callback or finalize endpoint. All of that lives in Unison now.

butler still owns its own Postgres database, but only for the Discord-side state it needs to do its job: role holdings per guild (which makes sync idempotent) and per-guild configuration. It no longer stores account links or a blacklist. Those live in Unison, which is the source of truth for identity, reputation, the leaderboard, the link map, the excluded keys, and the request board. butler reads that data from Unison instead of keeping its own copy.

The business rules live in pure functions tested in isolation: URL parsing, album-art selection, tier computation, the holdings diff, and the request payload builder. discord.js, Postgres, and youtubei.js sit at the edges as thin adapters, so the logic can be tested without a network, a database, or a live Discord connection.

## Environment variables

Copy `.env.example` to `.env` and fill these in. Every variable except `YTM_COOKIE` is required, and the process refuses to start if one is missing.

| Variable | Description |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot token for the Discord application. |
| `DATABASE_URL` | Postgres connection string for butler's own database. |
| `UNISON_API_BASE_URL` | Base URL of the Unison API. |
| `BUTLER_BOT_SECRET` | Shared secret butler uses to authenticate to Unison's bot endpoints. Must match the value configured on Unison. |
| `LINK_PAGE_URL` | URL of the Unison link page the connect card points at. |
| `COMPOSER_BASE_URL` | Base URL of the Better Lyrics composer, used by the Fix it myself button. |
| `YTM_COOKIE` | Optional. YouTube Music cookie for richer metadata lookups. Leave empty to run without it. |

## Running locally

```sh
pnpm install
cp .env.example .env   # then fill in the values
pnpm run dev           # watch mode
```

Or run it once without watch:

```sh
pnpm start
```

Checks:

```sh
pnpm test              # vitest
pnpm run typecheck     # tsc --noEmit
pnpm run lint          # biome
```

## Account linking

Linking ties a Discord identity to a Better Lyrics (Unison) key, which is how role sync and request attribution know who is who. butler does not run any part of this flow. Unison does.

The persistent connect card lives in the connect channel. `/setup` posts it there once. The card is a single button, and that button is just a link to the Unison link page (`LINK_PAGE_URL`, which is `https://unison.boidu.dev/link`). Clicking it sends the member to Unison, and Unison runs the whole thing: a fresh private-key signature from the extension, Discord OAuth, the blacklist guard, and storing the `discord_id` to `key_id` mapping. butler never sees the signed payload and never accepts a link through any other path.

One security note: a link requires a live private-key signature plus a fresh Discord OAuth grant. A leaked or replayed session token on its own is not enough to forge a link.

## How role sync works

Role sync runs once an hour, and once at startup. For each configured guild, butler:

1. Pulls the leaderboard from Unison (`GET /leaderboard/users`).
2. Pulls the Discord-to-key link map (`GET /links/bot/all`, bot-authenticated).
3. Pulls the excluded keys (`GET /links/bot/blacklist`, bot-authenticated).
4. Drops blacklisted keys before ranking anyone.
5. Computes percentile tiers over the full leaderboard: a rank 1, 2, and 3 podium, a top 5 percent special tier, and a top 20 percent Lyricist tier. The percentages and the podium are config-tunable.
6. Maps each remaining key to a linked member who is actually present in the guild.
7. Diffs the desired state against the stored holdings.
8. Applies role changes with a single, hierarchy-safe edit per member.
9. Announces only upward promotions in the announce channel.

The holdings table is what makes re-runs idempotent: a sync that produces the same result as last time changes nothing and announces nothing. As a safety valve, if the desired set ever comes back empty while members still hold roles, the sync skips that run rather than stripping everyone.

## The incorrect-lyrics flow

butler watches the report channel. When someone posts a message there, it parses out a YouTube Music link, fetches the track metadata on a best-effort basis (a failed lookup does not block the card), and replies with a card that carries two actions:

- Add to request board: posts the track to Unison's request board (`POST /requests/bot`) along with the original poster's `discordId`. Unison attributes the request to the poster's linked key at their reputation weight, or files it at the neutral Discord weight if the poster has no link. This button only shows when the metadata lookup succeeded.
- Fix it myself: a link that opens the track in the composer.

Only the original poster and server mods can use the add-to-board button.

## Setup

Run the `/setup` slash command in the guild. It is admin only (Manage Server). It records the connect, report, announce, and optional mod channels along with the five tier role ids (rank 1, rank 2, rank 3, special, lyricist), and it posts the persistent connect card to the connect channel.

## Deploy notes

butler deploys to Railway as a worker. It has no public HTTP port, because it makes only outbound calls (to Discord and to Unison) and listens for nothing.

- Set every environment variable from the table above. `BUTLER_BOT_SECRET` must equal the value configured on Unison, or the bot-authenticated reads and the request POST will fail.
- Register the Discord application: create the bot token and enable the MessageContent privileged intent. There is no OAuth redirect to configure on butler; Discord OAuth is Unison's job.
- Invite the bot with the Manage Roles permission, and place its role above every managed tier role in the role list. Role edits fail if the bot's highest role does not sit above the roles it is editing.
- For `YTM_COOKIE`, use a dedicated throwaway Google account. A cookie from a personal account, used from a cloud IP, can get the account flagged.
- Run `/setup` once in the target guild after the bot is online.
