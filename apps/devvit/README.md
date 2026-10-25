# Taste Check (Devvit app)

A subreddit game built on Reddit's Devvit platform. Each round takes the hot posts of the
subreddit, asks the [Qloo](https://qloo.com) taste graph which films, artists, games and places
are culturally related to them, and deals six of those into a card game: players predict whether
the community will **LOVE**, feel **MEH** about, or **PASS** on each one, and the taste engine
scores them. A moderator-only dashboard shows round history and participation.

All game content comes from the Qloo API. Nothing is generated locally — if Qloo is unreachable,
the app says so instead of inventing a round.

## Entrypoints

| Entry | File | Height | Who sees it |
| --- | --- | --- | --- |
| `default` | `public/index.html` | regular | Anyone landing on the app |
| `game` | `public/game.html` | tall | Players, from a round post |
| `dashboard` | `public/dashboard.html` | regular | Moderators only (`/api/dashboard` returns 403 otherwise) |

The server is a Hono app bundled to `dist/server/index.cjs`.

## API key

The key is a **global secret setting**, never bundled into the client:

```bash
cd apps/devvit
npx devvit settings set qlooApiKey
```

The server reads it with `settings.get<string>('qlooApiKey')` (see `src/server/qloo.ts`) and
returns HTTP 503 with a hint if it is missing.

## HTTP domains

`devvit.json` declares two exact hostnames:

| Domain | Used for |
| --- | --- |
| `hackathon.api.qloo.com` | The Qloo API — the actual data path for every round. |
| `qloo-mcp.globie.earth` | The self-hosted MCP/REST server in this repository, for parity. Optional; the game does not depend on it. |

Devvit has no wildcards, protocols or paths in this list, and each host must be approved by
Reddit before outbound requests succeed. Requests are submitted for review automatically when you
playtest or upload; approvals appear under **Domain exceptions** in the app's developer settings
and usually take 1–2 business days.

## Moderator actions

Both are subreddit-menu items in `devvit.json`:

- **Start a Taste Check round** — `POST /internal/menu/new-round`. Builds and posts a round now;
  this doubles as the retry action when a previous attempt failed.
- **Create the Taste Check dashboard post** — `POST /internal/menu/dashboard-post`.

## Automations

- **Daily round** — scheduler task `daily-round` (`POST /internal/cron/daily-round`, `0 14 * * *`,
  i.e. 14:00 UTC).
- **First round on install** — trigger `onAppInstall` (`POST /internal/triggers/install`).

If a round cannot be built (missing key, or Qloo still pending domain review), the app posts one
explanatory notice instead of failing silently, and removes it automatically as soon as a round
goes live.

## Webview API

| Route | Method | Notes |
| --- | --- | --- |
| `/api/health` | GET | `{ ok, app, qloo: "configured" \| "missing_key" }` |
| `/api/round` | GET | Current round, whether you already played, top 5 |
| `/api/guess` | POST | `{ guesses: { [candidateId]: "LOVE" \| "MEH" \| "PASS" } }` |
| `/api/leaderboard` | GET | Top 10 |
| `/api/dashboard` | GET | Moderator-only aggregate stats |

## Development

```bash
npm install                 # from the repository root (workspaces)
npm run typecheck -w taste-check
npm run build    -w taste-check
npm run dev      -w taste-check     # devvit playtest
npm run deploy   -w taste-check     # devvit upload
```

`dev.subreddit` in `devvit.json` points at `taste_check_dev`. To re-test the install flow:

```bash
npx devvit uninstall taste_check_dev taste-check
npx devvit install   taste_check_dev taste-check
```

## License

MIT — see the repository root.
