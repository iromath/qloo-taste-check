# Taste Check — Qloo, on both sides of the agent

Two surfaces over one taste engine built on the [Qloo](https://hackathon.api.qloo.com) cultural
intelligence API:

- **`apps/server`** — a self-hosted **MCP server** that exposes Qloo as seven agent tools (plus
  resources and prompts) over Streamable HTTP, with a small REST facade and a browser demo.
- **`apps/devvit`** — **Taste Check**, a Reddit app built on [Devvit](https://developers.reddit.com/docs)
  that turns a subreddit's own front page into a daily taste-guessing game, with a moderator dashboard.
  It calls Qloo directly from the Devvit server.

Both surfaces share **`packages/qloo`**: a typed, dependency-light client for `/v2/insights`,
`/search`, `/v2/tags`, `/v2/trending` and `/v2/analysis/compare`, including the parameter building
and normalization that the real API's quirks require.

```
packages/qloo     typed API client, param builder, cache, rank → verdict mapping
apps/server       MCP server (Streamable HTTP) + REST facade + demo page
apps/devvit       Devvit Web app: game post + moderator dashboard
```

## Why the API client exists

Qloo validates more strictly than its docs suggest, and the details are easy to get wrong. Verified
against the live hackathon API: an unsupported `filter.type` returns **HTTP 400**, a `filter.type`
with no signal returns **HTTP 400**, `/v2/analysis/compare` accepts only comma-joined lists, `/entities`
wants `entity_ids`, and the bracketed `a[]=` array form is silently ignored. Every layer here is built
around what the API actually does:

- `params.ts` emits only the documented parameter names, clamps numeric ranges, repeats keys for
  arrays (the one form accepted everywhere) and comma-joins the compare lists.
- `client.ts` caches responses, retries transient failures, and attaches a warning to the envelope
  when a valid request comes back with an empty bucket.
- `normalize.ts` reads the buckets each endpoint really returns (`/search` is a bare array,
  `/v2/analysis/compare` uses `a`/`b`/`matchEntities`, `/v2/trending` uses `trending`) and lifts
  Qloo's own 0–1 `query.affinity` onto each hit.
- `ranking.ts` derives LOVE / MEH / PASS from rank thirds rather than a fixed affinity cutoff,
  because the affinity band moves sharply with the seed audience.

## MCP server

```bash
cp .env.example .env          # then set QLOO_API_KEY
npm install
npm run build
npm start                     # http://localhost:8787
```

| Endpoint | Purpose |
| --- | --- |
| `POST /mcp` | Streamable HTTP MCP endpoint (stateless) |
| `GET /health` | Liveness + whether a Qloo key is configured |
| `GET /api/*` | GET-only REST facade mirroring the tools |
| `GET /` | Browser demo of the engine |
| `GET /terms`, `GET /privacy` | Public Terms and Privacy pages |

### Deploy

The server is a single Node process with no database — any container host works.

```bash
docker build -t taste-engine .
docker run -p 8787:8787 -e QLOO_API_KEY=... taste-engine
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `QLOO_API_KEY` | — (required) | Sent as `X-Api-Key` |
| `QLOO_API_BASE` | `https://hackathon.api.qloo.com` | Must stay on the hackathon host |
| `PORT` | `8787` | Listen port |
| `PUBLIC_ORIGIN` | request origin | Absolute origin used in the demo page |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist |
| `QLOO_CACHE_TTL` | `21600` | Seconds to cache Qloo responses |

Serve it over TLS on a bare hostname — MCP clients reject self-signed certificates, and a path
prefix in the endpoint URL confuses most of them.

### Tools

| Tool | What it does |
| --- | --- |
| `qloo_search_entities` | Resolve free text to Qloo entity IDs |
| `qloo_search_tags` | Resolve free text to tag IDs |
| `qloo_recommend` | Rank entities for a known set of seed entities or tags |
| `qloo_compare_tastes` | Compare two audiences |
| `qloo_trending` | Interest over a date range |
| `qloo_build_taste_profile` | Turn a description into an entity/tag profile |
| `qloo_explain` | Rank a target and explain which seeds moved it |

Connect any MCP client with a config like:

```json
{
  "mcpServers": {
    "taste-engine": { "type": "http", "url": "https://your-host.example/mcp" }
  }
}
```

Keys are read from `QLOO_API_KEY` and sent as the `X-Api-Key` header. The base URL is fixed to
`https://hackathon.api.qloo.com`; development keys do not work against it and hackathon keys do not
work anywhere else.

## Reddit app — Taste Check

The app plays a simple game with a hard constraint: Qloo exposes rank order, not per-entity affinity.
So players are asked to predict the *band* a title lands in — `LOVE` (top third), `MEH` (middle) or
`PASS` (bottom) — and the reveal shows the real rank plus the contributing seed entities from Qloo's
explainability payload.

A round is built like this:

1. Read the subreddit's top posts of the week, clean the titles.
2. Resolve the first few titles (plus an optional theme) to Qloo entities — these are the **anchors**.
3. One `/v2/insights` call with those anchors, `take: 24`, `explainability: true`.
4. Pick six candidates spread across all three rank bands, shuffle, store the round in Redis.

### Setup

```bash
cd apps/devvit
npx devvit login
npx devvit upload                  # private upload; also submits the fetch-domain request
npx devvit settings set qlooApiKey # global secret setting, never bundled
npx devvit playtest <subreddit>
```

Add the app to a subreddit, then use the subreddit mod menu:

- **Start a Taste Check round** — builds a round from the subreddit's front page and posts it.
- **Create the Taste Check dashboard post** — posts the moderator-only stats view.

A scheduler also posts one round a day (`0 14 * * *`), and installing the app posts the first round
if a key is already configured.

### How the key is handled

The Qloo key is a **global secret setting** (`settings.global.qlooApiKey`, `isSecret: true`).
`apps/devvit/src/server/qloo.ts` reads it per request and memoizes per key value, so a moderator can
rotate the key with `devvit settings set` and no redeploy. The key never reaches the webview, the
bundle, or git.

### Fetch Domains

Devvit requires every outbound host to be declared explicitly in `devvit.json` and justified here.

| Domain | Why |
| --- | --- |
| `hackathon.api.qloo.com` | The Qloo API. The app's entire game content — which titles are related to a subreddit's posts, and how they rank — comes from `/v2/insights` and `/search` on this host. Nothing is fabricated locally; if this host is unreachable the app shows an error rather than inventing a round. |

`https://hackathon.api.qloo.com` is a public, documented API with a published OpenAPI reference
(Qloo's developer documentation) and key-based authentication. The app holds no other outbound
domains: no analytics, no image hosts, no third-party CDNs. All HTML, CSS and JavaScript is served
from the app's own `public/` directory.

Reddit's API is reached through Devvit's built-in `reddit` client and therefore needs no domain
declaration or API key.

## Data handling

- Qloo responses are cached in memory on the MCP server (6h default, `QLOO_CACHE_TTL`) and in Devvit
  Redis for the game. Nothing is sold, resold, or exposed as a bulk dataset, and Qloo response data is
  never committed to this repository.
- The game stores only aggregate counters and per-username scores inside the app's installation
  namespace. No email addresses, no cross-subreddit identifiers, no profile building.
- The moderator dashboard is gated by a live `getModerators` check, not by a client flag.

## Development

```bash
npm run build       # packages/qloo → apps/server → apps/devvit bundle
npm run typecheck   # all workspaces
npm run dev         # MCP server with tsx watch
```

The Devvit server bundle is built by `devvit.json` → `scripts.build`
(`esbuild … --format=cjs --outfile=dist/server/index.cjs`), which the Devvit CLI runs on
`playtest`, `upload` and `publish`. Devvit Web requires a self-contained CommonJS bundle, and the
same `packages/qloo` sources compile into both that bundle and the ESM MCP server.

## License

MIT — see [LICENSE](LICENSE). Terms: [TERMS.md](TERMS.md). Privacy: [PRIVACY.md](PRIVACY.md).
