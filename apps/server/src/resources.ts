import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const ENTITY_TYPES = `# Qloo entity types

\`filter.type\` accepts exactly nine entity values on /v2/insights. Anything else returns **HTTP 400**.

| type | typical use |
|---|---|
| \`urn:entity:artist\` | music artists, bands |
| \`urn:entity:book\` | books |
| \`urn:entity:brand\` | consumer brands |
| \`urn:entity:destination\` | travel destinations |
| \`urn:entity:movie\` | films |
| \`urn:entity:person\` | public figures |
| \`urn:entity:place\` | venues, restaurants, points of interest |
| \`urn:entity:podcast\` | podcasts |
| \`urn:entity:tv_show\` | television |

\`urn:entity:video_game\` is **rejected** by /v2/insights (\`400 "not supported for filter.type"\`), even though /search will resolve games.

/search accepts five **additional** types that /v2/insights rejects:

- \`urn:entity:actor\`
- \`urn:entity:album\`
- \`urn:entity:author\`
- \`urn:entity:director\`
- \`urn:entity:locality\`

## Rules

1. /v2/insights needs \`filter.type\`, and it also needs at least one signal (entities or tags). A type alone returns \`400 "at least one valid signal or filter is required for entity insights"\`.
2. \`urn:entity:audience\` is deprecated; do not use it.
3. To cover several types, issue one call per type and merge the ranked lists yourself.
4. Prefer narrowing types during search. Searching five types at once tends to surface ambiguous names.
`;

const PARAMETERS = `# Qloo request model

Base URL: **https://hackathon.api.qloo.com**. Auth header: **\`X-Api-Key\`** (not Bearer, not a query param).

## Shape of every call

- \`/v2/insights\` is **GET only**. All parameters are dotted names in the query string. A POST with a JSON body fails.
- Entity lists use repeated keys: \`signal.interests.entities=ID1&signal.interests.entities=ID2\`. The bracketed \`signal.interests.entities[]=\` form is silently ignored.
- Tag and type lists must be a **single comma-joined value**: \`signal.interests.tags=TAG1,TAG2\`, \`filter.tags=TAG1,TAG2\`, \`filter.exclude.tags=TAG1,TAG2\`, \`signal.demographics.audiences=TAG1,TAG2\`, \`filter.parents.types=TYPE1,TYPE2\`, \`filter.tag.types=TYPE1,TYPE2\`. Repeating the key returns **HTTP 500** on /v2/insights and **HTTP 400** on /v2/tags.
- **Validation is real.** Unknown entity IDs, unsupported \`filter.type\` values and a missing signal all return **HTTP 400** with a \`message\` naming the offending parameter. An empty \`results\` bucket therefore means a valid request matched nothing.
- There is **no field selection**; responses are verbose. This server normalizes them before returning.

## Taste signal vs result filter

| parameter | meaning |
|---|---|
| \`signal.interests.entities\` | entity IDs that define the taste profile |
| \`signal.interests.tags\` | tag IDs that define the taste profile |
| \`signal.demographics.age\` | \`35_and_younger\` / \`36_to_55\` / \`55_and_older\` |
| \`signal.demographics.gender\` | \`male\` / \`female\` |
| \`filter.tags\` | keep results carrying these tags |
| \`filter.exclude.tags\` | drop results carrying these tags |
| \`filter.location.query\` | fuzzy place name applied to results |
| \`filter.location.radius\` | **metres** on /v2/insights |
| \`filter.radius\` | **miles** on /search (default 10, max 100) |

The two radius units are a real trap: the same number means very different things on the two endpoints.

## Ranking

- \`sort_by\` accepts \`affinity\`, \`distance\`, \`rating\`, \`quality\`.
- Every result carries \`query.affinity\` (0–1) and the list is returned sorted by it, so position and affinity agree.
- \`feature.explainability=true\` adds per-result contributor scores (0–1, contributions below 0.1 may be omitted) under \`query.explainability\` and an aggregate top-N influence summary on the envelope. If it cannot be computed you still get results plus \`query.explainability.warning\`.

## Limits worth remembering

- /v2/insights: \`take\` up to 100.
- /v2/tags: default 20, documented max 50.
- /v2/trending: \`take\` 1–50; requires \`filter.type\`, \`filter.start_date\`, \`filter.end_date\` **and** a seed entity, and needs a window of several months to return points.
- /v2/analysis/compare: requires both \`a.signal.interests.entities\` and \`b.signal.interests.entities\` as single comma-joined values; repeated keys return 400.
- /entities: the ID parameter is \`entity_ids\`, and it takes **bare UUIDs only** (comma-joined). A URN such as \`urn:entity:movie:<uuid>\` returns \`400 "entity_ids should be an array of valid UUIDs"\`.
- /v2/audiences: parameters are \`filter.query\`, \`filter.parents.types\`, \`filter.audience.types\`, \`filter.results.audiences\`, \`filter.popularity.min\`/\`max\`; \`take\` defaults to 20 and maxes at 50. Each result carries \`entity_id\` (the UUID that \`signal.demographics.audiences\` expects) **and** a slug \`id\` such as \`urn:audience:leisure:music_festivals\` — the two are not interchangeable.
- /v2/tags/types and /v2/audiences/types: filter with \`filter.type\` and \`filter.parents.types\`; rows are \`{ type, parents }\`, where \`parents\` lists the entity types the type applies to.

## Audiences

Audiences are groups, not entities. Use them as a **taste signal**, not a result filter:

| parameter | meaning |
|---|---|
| \`signal.demographics.audiences\` | comma-joined audience **UUIDs** |
| \`filter.audience.types\` | restrict /v2/audiences to audience types, e.g. \`urn:audience:leisure\` |

Send the \`entity_id\` from /v2/audiences, not the \`id\` slug. \`urn:audience:leisure:music_festivals\` is rejected where a UUID is expected.

## Taxonomies

\`filter.tag.types\` and \`filter.audience.types\` only accept values that exist. List them rather than guessing:

- \`/v2/tags/types\` returns 20 tag types, e.g. \`urn:tag:genre:qloo\`. Add \`filter.parents.types=urn:entity:movie\` to see only the types valid for films.
- \`/v2/audiences/types\` returns 10 audience types, e.g. \`urn:audience:leisure\`.
`;

const TAG_WORKFLOW = `# Tag workflow

Tags are Qloo's concept layer: genres, moods, materials, themes. They are how you express "neo-noir" or "slow living" without inventing entity IDs.

## The rule

**A tag name is not a tag ID.** \`filter.tags\`, \`exclude.tags\` and \`signal.interests.tags\` accept only IDs.

## Flow

1. \`qloo_search_tags\` with \`query: "<concept>"\` (max 50 results).
2. Pick the tag whose \`name\` matches the concept. Check \`subtype\` when names collide.
3. Use the returned \`id\` in one of:
   - \`qloo_recommend\` \`tags\` — widens the taste signal.
   - \`qloo_recommend\` \`filterTags\` — restricts results.
   - \`qloo_recommend\` \`excludeTags\` — removes results.

## Failure modes

- Passing the word \`neo-noir\` instead of a tag ID: tag parameters take IDs only, so resolve the concept first. A name never matches.
- Searching with a long sentence: tag search is name-oriented. Use two or three words.
- Assuming a tag is universal: tag popularity and availability vary by entity type. Verify with \`tagTypes\` when precision matters.
- Using \`semantic: true\` with no \`query\`: returns nothing useful.
`;

export function registerResources(server: McpServer): void {
  server.registerResource(
    'entity-types',
    'qloo://reference/entity-types',
    {
      title: 'Qloo entity types',
      description: 'The nine entity types /v2/insights accepts, plus the five /search-only types.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: ENTITY_TYPES }] }),
  );

  server.registerResource(
    'request-model',
    'qloo://reference/parameters',
    {
      title: 'Qloo request model',
      description: 'Auth, GET-only dotted query params, signal vs filter, units, limits, ranking semantics.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: PARAMETERS }] }),
  );

  server.registerResource(
    'tag-workflow',
    'qloo://reference/tag-workflow',
    {
      title: 'Qloo tag workflow',
      description: 'How to go from a concept to a usable tag ID, and the silent-failure traps.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: TAG_WORKFLOW }] }),
  );
}
