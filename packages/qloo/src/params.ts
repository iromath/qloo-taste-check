import type { AgeBand, Gender, InsightsType, QlooQuery, QueryValue, SearchType, SortMode } from './types.js';

/**
 * Serializes the flat dotted query model into URLSearchParams.
 *
 * Verified against the live API, arrays come in two flavours:
 *
 * - Entity lists (`signal.interests.entities`) accept repeated keys
 *   (`a=1&a=2`) and comma-joined values.
 * - Tag and type lists (`signal.interests.tags`, `signal.demographics.audiences`,
 *   `filter.tags`, `filter.exclude.tags`, `filter.parents.types`,
 *   `filter.tag.types`) accept **only** a single comma-joined value. Repeating
 *   the key yields HTTP 500 on `/v2/insights` and HTTP 400 on `/v2/tags`.
 *
 * The bracketed `a[]=` form is silently ignored on every endpoint, so it is
 * deliberately not supported.
 */
export function toSearchParams(query: QlooQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    appendValue(params, key, value);
  }
  return params;
}

function appendValue(params: URLSearchParams, key: string, value: QueryValue): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    for (const item of value) params.append(key, item);
    return;
  }
  params.append(key, String(value));
}

function joinList(values: string[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(',');
}

export function splitEntityType(subtype: string): { family: string; kind: string } | null {
  // urn:entity:movie -> { family: 'urn:entity', kind: 'movie' }
  const parts = subtype.split(':');
  if (parts.length < 3) return null;
  return { family: parts.slice(0, 2).join(':'), kind: parts.slice(2).join(':') };
}

export type InsightsParams = {
  /** Required. /v2/insights rejects unsupported types with HTTP 400. */
  type: InsightsType;
  /** Seed tastes: Qloo entity IDs. At least one signal is required. */
  entities?: string[];
  /** Seed concepts: Qloo tag IDs (not freeform strings). */
  tags?: string[];
  audiences?: string[];
  audiencesWeight?: number[];
  age?: AgeBand;
  gender?: Gender;
  /** Taste applied to results, not to the taste graph signal. */
  filterTags?: string[];
  filterTagsOperator?: 'union' | 'intersection';
  excludeTags?: string[];
  /** Fuzzy place name only — not a UUID. */
  filterLocationQuery?: string;
  /** Latitude/longitude, WKT, or Qloo UUID. */
  filterLocationId?: string;
  /** Metres for `/v2/insights` location filtering. */
  filterLocationRadius?: number;
  /** Narrow results to entities matching these terms. */
  resultsQuery?: string;
  releaseYearMin?: number;
  referencesBrand?: string;
  page?: number;
  take?: number;
  sortBy?: SortMode;
  diversifyBy?: string;
  diversifyTake?: number;
  explainability?: boolean;
  backfillCrossDomainTake?: number;
  backfillContentBasedTake?: number;
  biasTrends?: boolean;
  /** 0..1 */
  biasContentBased?: number;
  extra?: QlooQuery;
};

export const INSIGHTS_LIMITS = {
  takeDefault: 20,
  takeMax: 100,
  backfillCrossDomainMax: 20,
  backfillContentBasedMax: 10,
} as const;

export function buildInsightsQuery(p: InsightsParams): QlooQuery {
  const q: QlooQuery = {
    'filter.type': p.type,
    'signal.interests.entities': p.entities,
    'signal.interests.tags': joinList(p.tags),
    'signal.demographics.audiences': joinList(p.audiences),
    'signal.demographics.audiences.weight': p.audiencesWeight?.map(String),
    'signal.demographics.age': p.age,
    'signal.demographics.gender': p.gender,
    'filter.tags': joinList(p.filterTags),
    'operator.filter.tags': p.filterTagsOperator,
    'filter.exclude.tags': joinList(p.excludeTags),
    'filter.location.query': p.filterLocationQuery,
    'filter.location.id': p.filterLocationId,
    'filter.location.radius': p.filterLocationRadius,
    'filter.results.entities.query': p.resultsQuery,
    'filter.release_year.min': p.releaseYearMin,
    'filter.references_brand': p.referencesBrand,
    page: p.page,
    take: p.take,
    sort_by: p.sortBy,
    'diversify.by': p.diversifyBy,
    'diversify.take': p.diversifyTake,
    'feature.explainability': p.explainability === undefined ? undefined : p.explainability,
    'backfill.cross_domain.take': clamp(p.backfillCrossDomainTake, 0, INSIGHTS_LIMITS.backfillCrossDomainMax),
    'backfill.content_based.take': clamp(p.backfillContentBasedTake, 0, INSIGHTS_LIMITS.backfillContentBasedMax),
    'bias.trends': p.biasTrends,
    'bias.content_based': p.biasContentBased,
    ...p.extra,
  };
  return compact(q);
}

export type SearchParams = {
  query: string;
  types?: SearchType[];
  /** Latitude/longitude, WKT, or Qloo UUID. */
  location?: string;
  /** Miles. Default 10, max 100. */
  radius?: number;
  coordinates?: { lat: number; lon: number };
  exists?: boolean;
  tags?: string[];
  tagsOperator?: 'union' | 'intersection';
  rating?: number;
  popularity?: number;
  address?: string;
  page?: number;
  take?: number;
  sortBy?: 'match' | 'distance' | 'popularity';
  extra?: QlooQuery;
};

export function buildSearchQuery(p: SearchParams): QlooQuery {
  const geocode = p.coordinates
    ? {
        'filter.geocode.lat': p.coordinates.lat,
        'filter.geocode.lon': p.coordinates.lon,
      }
    : {};
  return compact({
    query: p.query,
    types: p.types,
    'filter.location': p.location,
    // /search radius is MILES, unlike /v2/insights which is metres.
    'filter.radius': clamp(p.radius, 0, 100),
    ...geocode,
    'filter.exists': p.exists,
    'filter.tags': p.tags,
    'operator.filter.tags': p.tagsOperator,
    'filter.rating': p.rating,
    'filter.popularity': p.popularity,
    'filter.address': p.address,
    page: p.page,
    take: p.take,
    sort_by: p.sortBy,
    ...p.extra,
  });
}

export type TagsParams = {
  query?: string;
  tags?: string[];
  parentTypes?: string[];
  tagTypes?: string[];
  minPopularity?: number;
  maxPopularity?: number;
  nameSearch?: string;
  typoTolerance?: boolean;
  semanticSearch?: boolean;
  page?: number;
  /** Default 20, maximum 50. */
  take?: number;
  offset?: number;
  extra?: QlooQuery;
};

export const TAGS_TAKE_MAX = 50;

export function buildTagsQuery(p: TagsParams): QlooQuery {
  return compact({
    'filter.query': p.query,
    'filter.tags': joinList(p.tags),
    'filter.parents.types': joinList(p.parentTypes),
    'filter.tag.types': joinList(p.tagTypes),
    'filter.popularity.min': clamp(p.minPopularity, 0, 1),
    'filter.popularity.max': clamp(p.maxPopularity, 0, 1),
    'filter.name': p.nameSearch,
    'filter.typo_tolerance': p.typoTolerance,
    'filter.semantic': p.semanticSearch,
    page: p.page,
    take: clamp(p.take, 1, TAGS_TAKE_MAX),
    offset: p.offset,
    ...p.extra,
  });
}

export type EntitiesParams = {
  /** Qloo entity IDs — bare UUIDs, or URNs that get reduced to their UUID. */
  ids: string[];
  extra?: QlooQuery;
};

/**
 * `/entities` is the only endpoint that rejects URNs: it wants bare UUIDs in a
 * single comma-joined `entity_ids` value. `entity_ids[]=` is silently ignored.
 */
export function buildEntitiesQuery(p: EntitiesParams): QlooQuery {
  return compact({
    entity_ids: p.ids.map(bareUuid).join(','),
    ...p.extra,
  });
}

export type AudiencesParams = {
  /** Free-text search across audience names and descriptions. */
  query?: string;
  /** Entity types the audience applies to, e.g. `urn:entity:movie`. */
  parentTypes?: string[];
  /** Audience types, e.g. `urn:audience:leisure`. */
  audienceTypes?: string[];
  /** Narrow to audiences matching these terms. */
  resultsQuery?: string;
  minPopularity?: number;
  maxPopularity?: number;
  page?: number;
  /** Default 20, maximum 50. */
  take?: number;
  extra?: QlooQuery;
};

export function buildAudiencesQuery(p: AudiencesParams): QlooQuery {
  return compact({
    'filter.query': p.query,
    'filter.parents.types': joinList(p.parentTypes),
    'filter.audience.types': joinList(p.audienceTypes),
    'filter.results.audiences': p.resultsQuery,
    'filter.popularity.min': clamp(p.minPopularity, 0, 1),
    'filter.popularity.max': clamp(p.maxPopularity, 0, 1),
    page: p.page,
    take: clamp(p.take, 1, TAGS_TAKE_MAX),
    ...p.extra,
  });
}

export type TypeListParams = {
  /** Restrict to one type, e.g. `urn:tag:genre:qloo` or `urn:audience:leisure`. */
  type?: string;
  /** Restrict to types that apply to these entity types. */
  parentTypes?: string[];
  extra?: QlooQuery;
};

/** Shared by `/v2/tags/types` and `/v2/audiences/types`. */
export function buildTypeListQuery(p: TypeListParams): QlooQuery {
  return compact({
    'filter.type': p.type,
    'filter.parents.types': joinList(p.parentTypes),
    ...p.extra,
  });
}

export type TrendingParams = {
  type: InsightsType;
  /** ISO 8601 date. Required. */
  startDate: string;
  /** ISO 8601 date. Required. Needs at least ~6 months of range to return points. */
  endDate: string;
  /**
   * Seed entity IDs. Required by the endpoint even though it is a type-wide
   * series; omitting it returns HTTP 400.
   */
  entities: string[];
  take?: number;
  extra?: QlooQuery;
};

export function buildTrendingQuery(p: TrendingParams): QlooQuery {
  return compact({
    'filter.type': p.type,
    'filter.start_date': p.startDate,
    'filter.end_date': p.endDate,
    'signal.interests.entities': p.entities,
    take: clamp(p.take, 1, 50),
    ...p.extra,
  });
}

export type CompareParams = {
  aEntities: string[];
  bEntities: string[];
  type: InsightsType;
  /** Metres. */
  radius?: number;
  locationQuery?: string;
  take?: number;
  extra?: QlooQuery;
};

export function buildCompareQuery(p: CompareParams): QlooQuery {
  return compact({
    // Repeated keys are rejected here ("must be an array of at least one
    // element"); the endpoint only accepts a single comma-joined value.
    'a.signal.interests.entities': p.aEntities.join(','),
    'b.signal.interests.entities': p.bEntities.join(','),
    'filter.type': p.type,
    'filter.location.radius': p.radius,
    'filter.location.query': p.locationQuery,
    take: p.take,
    ...p.extra,
  });
}

function compact(q: QlooQuery): QlooQuery {
  const out: QlooQuery = {};
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** `urn:entity:movie:<uuid>` -> `<uuid>`; already-bare UUIDs pass through. */
export function bareUuid(id: string): string {
  const parts = id.split(':');
  return parts.length > 1 ? (parts[parts.length - 1] ?? id) : id;
}

function clamp(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(max, Math.max(min, value));
}
