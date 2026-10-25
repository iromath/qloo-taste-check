import {
  normalizeCompare,
  normalizeEntities,
  normalizeTags,
  normalizeTrending,
  readAggregateExplainability,
  reasonFor,
  verdictFor,
  type CacheState,
  type CompareItem,
  type ExplainContribution,
  type QlooEntity,
  type QlooTag,
  type SearchType,
  type TrendPoint,
  type Verdict,
} from '@taste/qloo';
import type { AppContext } from './context.js';
import { ToolInputError, requireQloo } from './context.js';
import type {
  CompareInput,
  ExplainInput,
  ProfileInput,
  RecommendInput,
  SearchEntitiesInput,
  SearchTagsInput,
  TrendingInput,
} from './schemas.js';

export type { Verdict };

export type TasteProfile = {
  anchors: string[];
  tags: string[];
  unresolved: string[];
};

export type ToolEnvelope = {
  kind: 'entity' | 'tag' | 'trend' | 'compare';
  /** Ranked result list. Absent for `compare`, which returns three buckets. */
  hits?: QlooEntity[] | QlooTag[] | TrendPoint[];
  warnings: string[];
  cache: CacheState;
  latency_ms: number;
  profile?: TasteProfile;
  influences?: Record<string, ExplainContribution[]>;
  metrics?: Record<string, number>;
  compare?: {
    a: CompareItem[];
    b: CompareItem[];
    shared: CompareItem[];
  };
  target?: {
    id: string;
    name: string;
    rank: number;
    verdict: Verdict;
    reason: string;
  };
  next?: string[];
};

const DEFAULT_PROFILE_TYPES: SearchType[] = [
  'urn:entity:movie',
  'urn:entity:artist',
  'urn:entity:tv_show',
  'urn:entity:book',
  'urn:entity:place',
  'urn:entity:podcast',
];

/**
 * Name -> entity IDs. Qloo has no free-text search inside /v2/insights, so this
 * is the mandatory first hop for every other tool.
 */
export async function searchEntities(ctx: AppContext, input: SearchEntitiesInput): Promise<ToolEnvelope> {
  const client = requireQloo(ctx);
  const { data, meta } = await client.search({
    query: input.query,
    types: input.types,
    location: input.location,
    radius: input.radiusMiles,
    take: input.take ?? 5,
    sortBy: 'match',
  });
  const { items, warnings } = normalizeEntities(data);

  return {
    kind: 'entity',
    hits: items,
    warnings: mergeWarnings(meta.warnings, warnings),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    next: items.length
      ? ['Pass one or more hit IDs to qloo_recommend as `entities`, or to qloo_explain to see why they rank.']
      : ['No match. Try a shorter or more canonical name, or widen `types`.'],
  };
}

/** Concept -> tag IDs. Required before anything accepts `filter.tags`. */
export async function searchTags(ctx: AppContext, input: SearchTagsInput): Promise<ToolEnvelope> {
  if (!input.query && !input.nameContains) {
    throw new ToolInputError(
      'Provide `query` or `nameContains`.',
      'Qloo tag search needs a concept. Free text never works as a tag ID.',
    );
  }
  const client = requireQloo(ctx);
  const { data, meta } = await client.tags({
    query: input.query,
    nameSearch: input.nameContains,
    tagTypes: input.tagTypes,
    semanticSearch: input.semantic,
    take: input.take ?? 20,
  });
  const { items, warnings } = normalizeTags(data);

  return {
    kind: 'tag',
    hits: items,
    warnings: mergeWarnings(meta.warnings, warnings),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    next: items.length
      ? ['Use tag IDs in qloo_recommend `tags` (taste signal) or `filterTags` (result filter).']
      : ['Try `semantic: true` or a broader concept. Tag names are not tag IDs.'],
  };
}

/** Core recommendation call: taste profile -> ranked entities. */
export async function recommend(ctx: AppContext, input: RecommendInput): Promise<ToolEnvelope> {
  const entities = input.entities ?? [];
  const tags = input.tags ?? [];
  if (entities.length === 0 && tags.length === 0) {
    throw new ToolInputError(
      'A recommendation needs at least one seed entity or tag.',
      'Resolve names first: qloo_search_entities for entities, qloo_search_tags for concepts.',
    );
  }

  const explain = input.explain ?? true;
  const take = input.take ?? 6;
  const client = requireQloo(ctx);
  const { data, meta } = await client.insights({
    type: input.type,
    entities,
    tags,
    take,
    sortBy: input.sortBy,
    filterTags: input.filterTags,
    excludeTags: input.excludeTags,
    filterLocationQuery: input.locationQuery,
    age: input.age,
    gender: input.gender,
    diversifyBy: input.diversifyBy,
    explainability: explain,
  });
  const { items, warnings } = normalizeEntities(data, { explainability: explain });
  const influences = explain ? readAggregateExplainability(data) : {};

  const envelope: ToolEnvelope = {
    kind: 'entity',
    hits: items,
    warnings: mergeWarnings(meta.warnings, warnings),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    ...(Object.keys(influences).length > 0 ? { influences } : {}),
    next: items.length
      ? [
          'hits are sorted by Qloo affinity, which is returned as hits[i].affinity (0–1). hits[0] is the strongest match.',
          'Call qloo_explain with a hit ID to get a plain-language reason.',
        ]
      : [
          'Unknown entity IDs and unsupported filter types are rejected with HTTP 400, so an empty list here means a valid request matched nothing. Check that every ID came from qloo_search_entities / qloo_search_tags.',
        ],
  };
  return envelope;
}

/** A vs B taste overlap. */
export async function compareTastes(ctx: AppContext, input: CompareInput): Promise<ToolEnvelope> {
  const client = requireQloo(ctx);
  const { data, meta } = await client.compare({
    aEntities: input.a,
    bEntities: input.b,
    type: input.type,
    take: input.take ?? 10,
  });
  const { a, b, shared, metrics, warnings } = normalizeCompare(data);

  // /v2/analysis/compare ignores `take` — verified live: take=3 and take=10
  // both returned 77 tags for side A. Cap the buckets here so `take` means
  // what the schema promises, keeping the highest-count tags per side.
  const limit = input.take ?? 10;
  const strongest = (items: CompareItem[]) =>
    [...items].sort((x, y) => (y.count ?? 0) - (x.count ?? 0)).slice(0, limit);

  const extra = Object.keys(metrics).length
    ? []
    : ['Qloo returned no numeric comparison metrics; read the shared tags qualitatively.'];
  if (a.length > limit || b.length > limit) {
    extra.push(
      `Qloo returned ${a.length} tags for A and ${b.length} for B; these are the ${limit} strongest per side.`,
    );
  }

  return {
    kind: 'compare',
    warnings: mergeWarnings(meta.warnings, warnings, extra),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    compare: { a: strongest(a), b: strongest(b), shared: strongest(shared) },
    ...(Object.keys(metrics).length ? { metrics } : {}),
    next: [
      shared.length
        ? 'Shared tags are the bridge: they are the themes both audiences already carry.'
        : 'No shared tags in this window. Try a lower `take` for the strongest tags per side, or compare one type at a time.',
    ],
  };
}

/** Weekly popularity series for a type. */
export async function trending(ctx: AppContext, input: TrendingInput): Promise<ToolEnvelope> {
  if (input.startDate >= input.endDate) {
    throw new ToolInputError(
      '`startDate` must be earlier than `endDate`.',
      'Both dates are ISO 8601 (YYYY-MM-DD). /v2/trending requires filter.type, filter.start_date, filter.end_date and a seed entity, and returns no points for windows shorter than a few months.',
    );
  }
  const client = requireQloo(ctx);
  const { data, meta } = await client.trending({
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    entities: input.entities,
    take: input.take ?? 20,
  });
  const { items, warnings } = normalizeTrending(data);

  return {
    kind: 'trend',
    hits: items,
    warnings: mergeWarnings(meta.warnings, warnings),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    next: items.length
      ? ['Compare `velocity` and `percentile` across points to find rising interest.']
      : ['Widen the window to at least six months; short ranges return an empty series.'],
  };
}

/**
 * Free-text tastes -> resolved entity and tag IDs.
 *
 * Resolution is intentionally narrow (top 1 entity + top N tags per phrase) so
 * the profile stays small enough to seed every later call.
 */
export async function buildTasteProfile(ctx: AppContext, input: ProfileInput): Promise<ToolEnvelope> {
  const client = requireQloo(ctx);
  const types = (input.types ?? DEFAULT_PROFILE_TYPES) as SearchEntitiesInput['types'];
  const tagLimit = input.tagLimit ?? 3;

  const anchors: string[] = [];
  const tagIds: string[] = [];
  const unresolved: string[] = [];
  const hits: QlooEntity[] = [];
  const warnings: string[] = [];
  let cache: CacheState = 'bypass';
  let latency = 0;
  let cacheHits = 0;
  let calls = 0;

  for (const like of input.likes) {
    const searchCall = await client.search({ query: like, types, take: 2, sortBy: 'match' });
    calls += 1;
    latency += searchCall.meta.latencyMs;
    if (searchCall.meta.cache === 'hit') cacheHits += 1;
    warnings.push(...searchCall.meta.warnings);

    const normalized = normalizeEntities(searchCall.data);
    warnings.push(...normalized.warnings);

    const top = normalized.items[0];
    if (!top) {
      unresolved.push(like);
    } else {
      if (!anchors.includes(top.id)) anchors.push(top.id);
      if (!hits.some((hit) => hit.id === top.id)) {
        hits.push({ ...top, rank: hits.length + 1 });
      }
    }

    if (tagLimit > 0) {
      const tagCall = await client.tags({ query: like, take: tagLimit });
      calls += 1;
      latency += tagCall.meta.latencyMs;
      if (tagCall.meta.cache === 'hit') cacheHits += 1;
      warnings.push(...tagCall.meta.warnings);

      for (const tag of normalizeTags(tagCall.data).items) {
        if (tagIds.length >= input.likes.length * tagLimit) break;
        if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
      }
    }
  }

  if (calls > 0) cache = cacheHits === calls ? 'hit' : 'miss';

  if (anchors.length === 0) {
    warnings.push('None of the descriptions resolved to a Qloo entity. Rewrite them as concrete titles, artists or places.');
  }
  if (unresolved.length > 0) {
    warnings.push(`Unresolved descriptions: ${unresolved.join('; ')}.`);
  }

  return {
    kind: 'entity',
    hits,
    warnings: mergeWarnings(warnings),
    cache,
    latency_ms: latency,
    profile: { anchors, tags: tagIds, unresolved },
    next: anchors.length
      ? ['Seed qloo_recommend with profile.anchors as `entities` and profile.tags as `tags`.']
      : ['Ask the user for concrete titles instead of adjectives.'],
  };
}

/** Plain-language explanation of one candidate's rank. */
export async function explain(ctx: AppContext, input: ExplainInput): Promise<ToolEnvelope> {
  const take = input.take ?? 20;
  const client = requireQloo(ctx);
  const { data, meta } = await client.insights({
    type: input.type,
    entities: input.entities,
    take,
    explainability: true,
  });
  const { items, warnings } = normalizeEntities(data, { explainability: true });
  const influences = readAggregateExplainability(data);

  const target = input.candidateId ? items.find((item) => item.id === input.candidateId) : items[0];
  const extraWarnings: string[] = [];

  if (input.candidateId && !target) {
    extraWarnings.push(
      `Candidate ${input.candidateId} is not in the top ${take} for this profile. Raise \`take\` or treat it as a weak match.`,
    );
  }

  return {
    kind: 'entity',
    hits: items,
    warnings: mergeWarnings(meta.warnings, warnings, extraWarnings),
    cache: meta.cache,
    latency_ms: meta.latencyMs,
    ...(Object.keys(influences).length ? { influences } : {}),
    ...(target
      ? {
          target: {
            id: target.id,
            name: target.name,
            rank: target.rank,
            verdict: verdictFor(target.rank, items.length),
            reason: reasonFor(target, items.length),
          },
        }
      : {}),
    next: target ? ['Use `target.reason` verbatim in the reveal copy.'] : undefined,
  };
}

export { verdictFor };

function mergeWarnings(...groups: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const warning of group ?? []) {
      if (warning) seen.add(warning);
    }
  }
  return [...seen];
}
