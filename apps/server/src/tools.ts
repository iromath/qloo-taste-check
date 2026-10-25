import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppContext } from './context.js';
import { errorPayload } from './context.js';
import {
  buildTasteProfile,
  compareTastes,
  explain,
  recommend,
  searchEntities,
  searchTags,
  trending,
  type ToolEnvelope,
} from './operations.js';
import {
  compareShape,
  explainShape,
  profileShape,
  recommendShape,
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
    'qloo_recommend',
    {
      title: 'Recommend from a taste profile',
      description:
        `${PREAMBLE}\n\nReturn ranked entities of one type from seed entity IDs and/or tag IDs. Hits are sorted by Qloo affinity, ` +
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
