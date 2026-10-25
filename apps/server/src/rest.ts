import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { INSIGHTS_TYPES, SEARCH_ONLY_TYPES } from '@taste/qloo';
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

/** REST facade over the same operations the MCP tools use. */
export function createApi(ctx: AppContext): Hono {
  const api = new Hono();

  api.get('/capabilities', (c) =>
    c.json({
      entityTypes: [...INSIGHTS_TYPES],
      searchOnlyTypes: [...SEARCH_ONLY_TYPES],
      tools: ['qloo_search_entities', 'qloo_search_tags', 'qloo_recommend', 'qloo_compare_tastes', 'qloo_trending', 'qloo_build_taste_profile', 'qloo_explain'],
      mcpEndpoint: '/mcp',
    }),
  );

  api.get('/search/entities', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(searchEntitiesShape, {
        query: q.str('query') ?? q.str('q'),
        types: q.list('types'),
        location: q.str('location'),
        radiusMiles: q.num('radiusMiles') ?? q.num('radius'),
        take: q.num('take'),
      });
      return searchEntities(ctx, input);
    }),
  );

  api.get('/search/tags', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(searchTagsShape, {
        query: q.str('query') ?? q.str('q'),
        nameContains: q.str('nameContains') ?? q.str('name'),
        tagTypes: q.list('tagTypes'),
        semantic: q.bool('semantic'),
        take: q.num('take'),
      });
      return searchTags(ctx, input);
    }),
  );

  api.get('/recommend', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(recommendShape, {
        type: q.str('type'),
        entities: q.list('entities'),
        tags: q.list('tags'),
        take: q.num('take'),
        explain: q.bool('explain'),
        sortBy: q.str('sortBy'),
        filterTags: q.list('filterTags'),
        excludeTags: q.list('excludeTags'),
        locationQuery: q.str('location'),
        age: q.str('age'),
        gender: q.str('gender'),
        diversifyBy: q.str('diversifyBy'),
      });
      return recommend(ctx, input);
    }),
  );

  api.get('/compare', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(compareShape, {
        type: q.str('type'),
        a: q.list('a'),
        b: q.list('b'),
        take: q.num('take'),
      });
      return compareTastes(ctx, input);
    }),
  );

  api.get('/trending', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(trendingShape, {
        type: q.str('type'),
        startDate: q.str('startDate') ?? q.str('start'),
        endDate: q.str('endDate') ?? q.str('end'),
        entities: q.list('entities'),
        take: q.num('take'),
      });
      return trending(ctx, input);
    }),
  );

  api.get('/profile', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(profileShape, {
        likes: q.list('likes') ?? q.list('q'),
        types: q.list('types'),
        tagLimit: q.num('tagLimit'),
      });
      return buildTasteProfile(ctx, input);
    }),
  );

  api.get('/explain', (c) =>
    handle(c, async () => {
      const q = query(c);
      const input = parse(explainShape, {
        type: q.str('type'),
        entities: q.list('entities'),
        candidateId: q.str('candidateId') ?? q.str('candidate'),
        take: q.num('take'),
      });
      return explain(ctx, input);
    }),
  );

  return api;
}

async function handle(c: Context, fn: () => Promise<ToolEnvelope>): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (error) {
    const payload = errorPayload(error);
    return c.json(payload, statusFor(payload.error.kind));
  }
}

function parse<T extends z.ZodRawShape>(shape: T, raw: Record<string, unknown>): z.infer<z.ZodObject<T>> {
  const schema = z.object(shape);
  const result = schema.safeParse(stripUndefined(raw));
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new BadQuery(detail);
  }
  return result.data;
}

class BadQuery extends Error {
  constructor(message: string) {
    super(`Invalid query parameters — ${message}`);
    this.name = 'BadQuery';
  }
}

function query(c: Context) {
  const params = new URL(c.req.url).searchParams;
  return {
    str: (key: string): string | undefined => {
      const value = params.get(key);
      return value === null || value === '' ? undefined : value;
    },
    num: (key: string): number | undefined => {
      const value = params.get(key);
      if (value === null || value.trim() === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    },
    bool: (key: string): boolean | undefined => {
      const value = params.get(key);
      if (value === null || value === '') return undefined;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    },
    list: (key: string): string[] | undefined => {
      const values = params
        .getAll(key)
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);
      return values.length > 0 ? values : undefined;
    },
  };
}

function stripUndefined(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function statusFor(kind: string): 400 | 404 | 429 | 502 | 503 | 504 {
  switch (kind) {
    case 'invalid_input':
    case 'bad_request':
    case 'forbidden':
      return 400;
    case 'not_found':
      return 404;
    case 'rate_limited':
      return 429;
    case 'timeout':
      return 504;
    case 'config':
      return 503;
    default:
      return 502;
  }
}

export { BadQuery };
