import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppContext } from './context.js';
import { errorPayload } from './context.js';
import {
  buildTasteProfile,
  compareTastes,
  explain,
  getEntities,
  listTypes,
  recommend,
  searchAudiences,
  searchEntities,
  searchTags,
  trending,
  type ToolEnvelope,
} from './operations.js';
import {
  compareShape,
  explainShape,
  getEntitiesShape,
  listTypesShape,
  profileShape,
  recommendShape,
  searchAudiencesShape,
  searchEntitiesShape,
  searchTagsShape,
  trendingShape,
} from './schemas.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

const PREAMBLE =
  'Qloo is a cultural taste graph. It has no free-text search inside its recommendation endpoint, so resolve names to IDs first. ' +
  'Qloo validates strictly: unknown entity IDs, unsupported `filter.type` values and missing signals all return HTTP 400 with a message naming the offending parameter.';

export function registerTools(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'qloo_search_entities',
    {
      title: 'Search Qloo entities',
      description:
        `${PREAMBLE}\n\nResolve a name to Qloo entity IDs. This is the mandatory first step: every other tool takes entity IDs, never names. ` +
        'Results are ordered by match. `/search` accepts five extra types that /v2/insights rejects: actor, album, author, director, locality.',
      inputSchema: searchEntitiesShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => searchEntities(ctx, input)),
  );

  server.registerTool(
    'qloo_search_tags',
    {
      title: 'Search Qloo tags',
      description:
        `${PREAMBLE}\n\nResolve a concept to Qloo tag IDs. Tag names are not tag IDs: anything accepted by \`tags\`, \`filterTags\` or ` +
        '`excludeTags` must be a tag ID returned here. Use `semantic: true` when the user describes a mood rather than a genre.',
      inputSchema: searchTagsShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => searchTags(ctx, input)),
  );

  server.registerTool(
    'qloo_get_entities',
    {
      title: 'Fetch Qloo entities by ID',
      description:
        `${PREAMBLE}\n\nThe reverse of a search: turn entity IDs you already hold back into names, types and tags. ` +
        'Useful for re-hydrating IDs from an earlier turn, a stored profile or a URL. `/entities` is the one endpoint that wants bare UUIDs — ' +
        'URN-form IDs such as `urn:entity:movie:<uuid>` are reduced automatically.',
      inputSchema: getEntitiesShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => getEntities(ctx, input)),
  );

  server.registerTool(
    'qloo_search_audiences',
    {
      title: 'Search Qloo audiences',
      description:
        `${PREAMBLE}\n\nResolve a description ("music festival regulars", "sneakerheads") to Qloo audience IDs. An audience is a demographic or ` +
        'lifestyle group, not an entity: pass its `entityId` (a UUID, not the `id` slug) as `audiences` on qloo_recommend to nudge the taste signal ' +
        'toward that group. Get valid `audienceTypes` values from qloo_list_types with kind: "audience".',
      inputSchema: searchAudiencesShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => searchAudiences(ctx, input)),
  );

  server.registerTool(
    'qloo_list_types',
    {
      title: 'List Qloo tag or audience types',
      description:
        `${PREAMBLE}\n\nThe taxonomy behind every filter.*.types parameter. Returns { type, parents } rows: \`type\` is the value to send ` +
        '(e.g. `urn:tag:genre:qloo`, `urn:audience:leisure`) and `parents` are the entity types it applies to. Filter with `parentTypes` to see ' +
        'only the types valid for movies, artists, places and so on. Use kind: "audience" for audience types, "tag" (default) for tag types.',
      inputSchema: listTypesShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => listTypes(ctx, input)),
  );

  server.registerTool(
    'qloo_recommend',
    {
      title: 'Recommend from a taste profile',
      description:
        `${PREAMBLE}\n\nReturn ranked entities of one type from seed entity IDs, tag IDs and/or audience IDs. Hits are sorted by Qloo affinity, ` +
        'returned per result as `affinity` (0–1), so hits[0] is the strongest match. Keep `explain: true` to get contributor scores for each result. ' +
        'Only these types are valid: artist, book, brand, destination, movie, person, place, podcast, tv_show (anything else returns HTTP 400).',
      inputSchema: recommendShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => recommend(ctx, input)),
  );

  server.registerTool(
    'qloo_compare_tastes',
    {
      title: 'Compare two taste profiles',
      description:
        `${PREAMBLE}\n\nCompare taste profile A against profile B for one entity type: overlap, divergence, and shared items that can bridge ` +
        'the two audiences. Both sides need at least one entity ID; Qloo rejects the call otherwise.',
      inputSchema: compareShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => compareTastes(ctx, input)),
  );

  server.registerTool(
    'qloo_trending',
    {
      title: 'Trending interest over time',
      description:
        `${PREAMBLE}\n\nPopularity series for an entity type over a date window. \`type\`, \`startDate\`, \`endDate\` and at least one seed ` +
        '`entities` ID are all required; the API returns 400 without them, and windows shorter than about six months return no points. ' +
        'Use it to tell whether a taste is rising or fading before recommending it.',
      inputSchema: trendingShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => trending(ctx, input)),
  );

  server.registerTool(
    'qloo_build_taste_profile',
    {
      title: 'Build a taste profile from free text',
      description:
        `${PREAMBLE}\n\nTurn a short list of free-text tastes ("neo-noir", "Aphex Twin", "Kyoto") into a reusable profile of resolved entity IDs ` +
        'and tag IDs. Use this before `qloo_recommend` when the user describes themselves in words rather than supplying IDs. ' +
        'Unresolved phrases are reported in `profile.unresolved` — rewrite those rather than guessing IDs.',
      inputSchema: profileShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => buildTasteProfile(ctx, input)),
  );

  server.registerTool(
    'qloo_explain',
    {
      title: 'Explain a ranking',
      description:
        `${PREAMBLE}\n\nExplain why one candidate ranks where it does for a taste profile, in plain language. Returns the full ranked list, ` +
        'the aggregate influence of each anchor, and a ready-to-use `target.reason` sentence plus a LOVE/MEH/PASS verdict derived from rank thirds. ' +
        'Use this for reveals, editorial copy, or "why did you pick this?" answers.',
      inputSchema: explainShape,
      annotations: READ_ONLY,
    },
    (input) => run(() => explain(ctx, input)),
  );
}

async function run(fn: () => Promise<ToolEnvelope>): Promise<CallToolResult> {
  try {
    const payload = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(errorPayload(error), null, 2) }],
    };
  }
}
