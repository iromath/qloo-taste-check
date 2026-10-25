# PLAN — "Taste Engine": self-hosted Qloo MCP + Reddit game & mod dashboard

Target: **Qloo Agentic Hackathon** (deadline **Oct 30, 2026 11:45pm ET** = Oct 31, 10:45am Bangkok).
Today: **Oct 25, 2026 (Sun)** → ~5.5 days, of which **3 business days** for Reddit review.

---

## 1. The three artifacts

| # | Artifact | Why it exists | Judged? |
|---|---|---|---|
| A | **Qloo MCP server** (self-hosted, Streamable HTTP) + typed Qloo client | The "agentic" core. Plugs into Claude / Cursor / any MCP client. | Yes — Technological Implementation |
| B | **Agentic web demo** at `/` (public URL, no login) | Guaranteed "live, working app participants can try end-to-end" — does **not** depend on Reddit review. | Yes — Design / Impact |
| C | **Devvit app "Taste Check"**: daily game post + mod-only dashboard | Distribution + a real audience. Same taste engine, community surface. | Yes — Idea / Impact |

One repo, one Qloo key, one shared core library. Story to judges:

> One taste engine, two surfaces: **MCP for agents**, **Devvit for communities**.

---

## 2. Hard constraints (verified, not assumed)

### Qloo
- Base URL **`https://hackathon.api.qloo.com`** only. Header **`X-Api-Key`**.
- `/v2/insights` is **GET-only**, params in query string.
- `filter.type` enum (9 entity values): `artist, book, brand, destination, movie, person, place, podcast, tv_show`. Anything else → **400**. `video_game` is **rejected**.
- `/v2/insights` with `filter.type` alone → `400 "at least one valid signal or filter is required for entity insights"`. A signal (entity/tag ID) is mandatory.
- **Validation is real**: unknown entity IDs → `400` with `message`/`path`. Empty `results` means a valid request matched nothing.
- **A numeric per-entity affinity exists**: every result carries `query.affinity` (0–1) and the list is sorted by it.
- `feature.explainability=true` → per-result contributor scores under `query.explainability["signal.interests.entities"]`; envelope-level buckets are `effect_on_top{3,5,10}_recs` / `effect_on_all_recs` with `avg_score`.
- `/search` returns `results` as a **bare array**; `/v2/analysis/compare` returns `results.{a,b,matchEntities}` and needs comma-joined lists; `/v2/trending` returns `results.trending` and requires a seed entity plus a window of several months; `/entities` takes `entity_ids`.
- Cache privately, server-side. **Never commit Qloo response data to the public repo.**
- `urn:tag` is a valid `filter.type` and returns `results.tags[]`; `urn:heatmap` requires `filter.location`.

### Devvit (the decisive one)
- Devvit HTTP Fetch allows **exact hostnames only**, HTTPS only, 30s timeout, per-app allowlist, reviewed when you `upload`/playtest (**1–2 business days**).
- Policy: *"**Personal domains** (e.g., personaldomain.com) — **Will not be approved**."* Category 1 = third-party APIs with a **publicly documented, publicly accessible API**.
- Therefore: **`51.159.81.116` cannot be a fetch domain.** Three separate violations:
  1. IP literal, not a hostname
  2. self-signed cert (`CN=Easypanel`, TLS verify fails)
  3. path prefix `/projects/relays/app/qloo_mcp` (domains have no paths)

### Locked decision
**The Devvit app calls `hackathon.api.qloo.com` directly** (legitimate category-1 public API, plausible approval), **not** our relay. The relay hosts only MCP + the web demo, where Reddit's policy does not apply.

**The relay needs a real hostname + Let's Encrypt cert** (decided: own subdomain → Easypanel), because MCP clients validate TLS and reject the current self-signed `CN=Easypanel` cert. API must be served at the **root of a dedicated subdomain** (no path prefix), since a fetch/allowlist entry is a bare hostname anyway and MCP clients need a clean URL.

---

## 3. Architecture

```
                 ┌──────────────────────────────┐
  Claude/Cursor ─┤  MCP  (Streamable HTTP, /mcp)│
                 │                              │
  Browser ───────┤  Agentic demo  (/)           │──┐
                 │  REST facade   (/api)        │  │  X-Api-Key
                 └──────────────────────────────┘  ├──► hackathon.api.qloo.com
                     Node 22 + Hono, relay          │
                                                    │
  Reddit ──► Devvit server (CJS) ───────────────────┘  (own fetch allowlist entry)
              ├── game custom post
              └── mod dashboard custom post
```

- **`packages/qloo`** — the single Qloo client: param builder, zod validation, entity/tag normalization, explainability mapping, in-memory + Redis cache, retry/backoff. Consumed by the MCP server **and** by the Devvit server bundle (pure TS, compiles into the CJS bundle; no `fs`, no native deps).
- **`apps/server`** — Node 22 + Hono. Mounts `/mcp`, `/api/*`, `/` (demo). Hono because it also runs on fetch-runtimes if we ever move it.
- **`apps/devvit`** — Devvit Web app. Server = CommonJS. Calls Qloo directly with the key from a **secret global setting**.

Why not route Devvit through our relay: it would need a personal-domain exception that policy says is denied, and it adds a hop, a cold start, and a second point of failure on demo day.

---

## 4. Qloo usage model (what makes it load-bearing)

A **taste profile** is a set of Qloo entity IDs + demographics + optional location.

```
profile = { anchors: entityId[], tags: tagId[], audience?, age?, gender?, location?, radius? }
```

| Feature | Qloo call | Without Qloo |
|---|---|---|
| Candidate selection for a round | `/v2/insights` `filter.type`, `signal.interests.entities=anchors`, `sort_by=affinity`, `take=6` | hand-authored lists |
| Community verdict (rank → bucket) | order of `results.entities` | arbitrary |
| "Why this?" on reveal | `feature.explainability=true` → per-result contributors | fabricated |
| Cross-domain expansion (mods) | `/v2/insights` with `backfill.cross_domain.take` across the other 9 types | impossible |
| Tag taxonomy (mods) | `/v2/tags?filter.query=…&take≤50` | manual |
| Subreddit taste report | `/v2/analysis/compare` (a = anchors, b = engagement winners) | no baseline |
| Agent demo | all of the above, chosen by an LLM | a plain search box |

Rank→bucket mapping (no numeric score exists): `top 2 = LOVE`, `middle 2 = MEH`, `bottom 2 = PASS` for `take=6`. **Verify that results are genuinely affinity-ordered** on Day 0.

---

## 5. MCP tool surface (7 tools, 3 resources, 2 prompts)

| Tool | Purpose |
|---|---|
| `qloo_search_entities` | name → entity IDs; `types`, location, radius |
| `qloo_search_tags` | concept → tag IDs (required for `filter.tags`) |
| `qloo_recommend` | core: profile → ranked entities, normalized + `why[]` |
| `qloo_compare_tastes` | A vs B taste overlap/divergence (`/v2/analysis/compare`) |
| `qloo_trending` | rising interest for a type over a date window |
| `qloo_build_taste_profile` | free-text likes → resolved entity/tag IDs (agent-friendly) |
| `qloo_explain` | why a candidate ranks where it does, in plain language |

Resources: entity-type reference, parameter reference, tag workflow.
Prompts: `taste_profile_from_description`, `cultural_diet_plan`.

Design rules: every tool returns the same normalized envelope (`hits[]`, `profile`, `warnings[]`, `cache`, `latency_ms`); never leak raw Qloo payloads; every tool validates with zod **before** the request (silently-ignored params are the #1 failure mode).

---

## 6. Devvit app "Taste Check"

### Game (custom post, `TALL`)
1. Mod (or daily scheduler) creates a round → 6 candidates from the subreddit's profile.
2. Player sees 6 cards; assigns each to **LOVE / MEH / PASS** predicting *the taste engine's* verdict.
3. Submit → reveal: Qloo's true order, the player's score, and one explanation line anchored to a seed entity.
4. Scoring: exact bucket 100, adjacent 50; streak multiplier; Redis leaderboard.
5. Profile learning: the round's top LOVE item is appended to the subreddit profile (cap 20) → next round is sharper.

### Mod dashboard (custom post, `dashboard` entry, mod-only menu action)
- Edit anchors (search via `/v2/tags` + entity search), see tags and cross-domain neighbours.
- Round history + vote distribution + participation.
- "Generate next round now" button.

### Devvit config
```jsonc
"permissions": { "reddit": true, "redis": true,
  "http": { "enable": true, "domains": ["qloo-mcp.globie.earth", "hackathon.api.qloo.com"] } },
"post": { "dir": "public", "entrypoints": { "default": {...}, "game": {...}, "dashboard": {...} } }
```
Redis keys: `profile:{sub}`, `round:{id}`, `round:{id}:votes`, `leaderboard`, `streak:{user}`.
Key storage: global secret setting (`npx devvit settings set qlooApiKey`), never in the bundle.

---

## 7. Scope cuts (explicit)
- One game mode. No accounts, no cross-subreddit global leaderboard.
- Dashboard = read-mostly + one action. No automod integration (Qloo can't classify text).
- No video (not required). No payments. No user PII.
- Stretch only if green by Day 4: agent-written weekly theme in the dashboard via an allowed LLM domain.

---

## 8. Schedule

| Day | Work |
|---|---|
| **0 (today)** | Verify Qloo key (entity types, ordering, explainability, tags, compare, latency). Create Devvit app + `devvit.json` + `upload` → **starts domain review**. Create test subreddit. Attach TLS domain to the relay. Scaffold monorepo. |
| **1** | `packages/qloo` + MCP server (7 tools) + deploy. Validate with a real MCP client. |
| **2** | Agentic web demo at `/`. Cache + rate-limit + error surfaces. |
| **3** | Devvit game: round creation, voting, reveal, leaderboard. Playtest in the test subreddit. |
| **4** | Mod dashboard. Polish, empty/error states, README + Fetch Domains section, Terms, Privacy, LICENSE (MIT). |
| **5** | `devvit publish` (unlisted), final deploy, submission text, repo About → license visible, submit early. |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Devvit domain approval denied or slow | Request Day 0. Ship B (web demo) as the guaranteed live demo; Devvit app is a bonus surface. If denied, the app cannot run — decide by Day 3. |
| New-app review > 2 business days | Upload Sunday; publish by Day 4; default **unlisted** is fine for a link-based install. |
| Qloo ordering isn't stable affinity | Verify Day 0; if not, switch the ground truth to "explainability score" or explicit `sort_by`. |
| Relay TLS invalid → MCP unusable | Attach real domain + Let's Encrypt before Day 1. |
| 5-day scope | Cuts already fixed above. Demo > dashboard if time runs out. |
| Committing Qloo data | Tests use fixtures generated locally, never committed; `.gitignore` research artifacts. |

---

## 10. Submission checklist
- [ ] Live public demo (no login) — B
- [ ] Public repo + **MIT license visible in About**
- [ ] README: what it does, how Qloo powers it, run instructions, **Fetch Domains** section
- [ ] Terms + Privacy pages (required for fetch apps)
- [ ] Text description of features + Qloo's role
- [ ] Devvit app published (unlisted) + installable link
- [ ] MCP endpoint publicly reachable with valid TLS

---

## 11. Decisions locked
1. **Devvit data path** → direct to `hackathon.api.qloo.com`, shared `packages/qloo` compiled into both surfaces.
2. **TLS** → own subdomain pointed at `51.159.81.116`, Let's Encrypt via Easypanel, root-path API.
3. **Game** → Taste Check (predict the engine's verdict on 6 ranked items).
4. **Scope** → all three artifacts stay; compress polish instead.

## 12. Inputs I still need
1. **`QLOO_API_KEY`** in `.env` at the project root (gitignored). Without it Day 0 verification cannot run, and the entire scoring model (rank order) is unverified.
2. **The subdomain** (e.g. `qloo.yourdomain.com`) + confirmation its DNS A record can point at `51.159.81.116`.
3. **Test subreddit name** you created, and confirmation you are its top mod.

## 13. Day 0 verification (executed against the live key)

Checks that were run, and what the live API actually answered:

| probe | result |
|---|---|
| `/v2/insights` with `filter.type` only | **400** "at least one valid signal or filter is required for entity insights" — a seed is mandatory |
| `filter.type=urn:entity:video_game` | **400** "not supported for filter.type" ⇒ 9 usable entity types, not 10 |
| `filter.type=urn:tag` | **200**, returns `results.tags[]` |
| `filter.type` for movie/tv_show/book/artist/podcast/brand/destination/person/place | **200** |
| unknown seed entity ID | **400** with `message` + `path` — validation is real, not silent |
| numeric affinity | **exists**: every result carries `query.affinity` (0–1), list sorted by it |
| rank stability (3 repeats) | identical order every time |
| explainability | per result `query.explainability["signal.interests.entities"] = [{entity_id, score}]`; envelope uses `effect_on_top{3,5,10}_recs` / `effect_on_all_recs` with `avg_score` |
| `/search` | **200**, `results` is a **bare array**; `types[]` bracketed form silently ignored, repeated/comma keys work |
| `/v2/analysis/compare` | **200**, needs comma-joined `a.`/`b.` lists; returns `results.{a,b,matchEntities}` |
| `/v2/trending` | **200**, requires a seed entity; returns `results.trending`; window must span several months |
| `/entities` | param is `entity_ids`; both comma and repeated forms return 200 |
| latency (n=35) | p50 679 ms, p95 2461 ms, max 3552 ms (artist slowest) |

These results superseded the original assumptions (403 for unsupported types, no numeric affinity,
silent parameter failures) throughout `packages/qloo`, `apps/server` and `apps/devvit`.

