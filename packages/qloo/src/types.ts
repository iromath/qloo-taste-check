/**
 * Qloo domain types, kept deliberately narrow.
 *
 * The public Qloo API returns very verbose payloads. Everything crossing a
 * tool boundary is normalized into these shapes so the MCP surface never
 * leaks raw API responses (see Qloo's caching/data guidance).
 */

/**
 * Every entity family Qloo knows about. `/search` accepts all of them.
 *
 * Note: the live hackathon API does **not** accept `urn:entity:video_game` as
 * `filter.type` on /v2/insights (HTTP 400). Use `INSIGHTS_TYPES` for anything
 * that feeds a recommendation call.
 */
export const ENTITY_TYPES = [
  'urn:entity:artist',
  'urn:entity:book',
  'urn:entity:brand',
  'urn:entity:destination',
  'urn:entity:movie',
  'urn:entity:person',
  'urn:entity:place',
  'urn:entity:podcast',
  'urn:entity:tv_show',
  'urn:entity:video_game',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Types accepted as `filter.type` by /v2/insights, verified against
 * https://hackathon.api.qloo.com. `urn:entity:video_game` is deliberately
 * absent: it returns `400 "The value urn:entity:video_game is not supported for
 * filter.type"`. `urn:tag` and `urn:heatmap` are also valid there but return
 * different result buckets, so they are not modelled as recommendation types.
 */
export const INSIGHTS_TYPES = [
  'urn:entity:artist',
  'urn:entity:book',
  'urn:entity:brand',
  'urn:entity:destination',
  'urn:entity:movie',
  'urn:entity:person',
  'urn:entity:place',
  'urn:entity:podcast',
  'urn:entity:tv_show',
] as const;

export type InsightsType = (typeof INSIGHTS_TYPES)[number];

/** Extra types accepted by /search only; /v2/insights rejects these. */
export const SEARCH_ONLY_TYPES = [
  'urn:entity:actor',
  'urn:entity:album',
  'urn:entity:author',
  'urn:entity:director',
  'urn:entity:locality',
] as const;

export type SearchOnlyType = (typeof SEARCH_ONLY_TYPES)[number];

export const SEARCH_TYPES = [...ENTITY_TYPES, ...SEARCH_ONLY_TYPES] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export const AGE_BANDS = ['35_and_younger', '36_to_55', '55_and_older'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const SORT_MODES = ['affinity', 'distance', 'rating', 'quality'] as const;
export type SortMode = (typeof SORT_MODES)[number];

export type QlooTag = {
  id: string;
  name: string;
  type?: string;
  subtype?: string;
  popularity?: number;
};

/** One input entity that contributed to a recommendation, score normalized 0..1. */
export type ExplainContribution = {
  entityId: string;
  name?: string;
  score: number;
};

export type QlooEntity = {
  id: string;
  name: string;
  /** Always `urn:entity`. */
  type: string;
  /** e.g. `urn:entity:movie`. */
  subtype: string;
  /** 1-based position in the order Qloo returned. Order is the ranking signal. */
  rank: number;
  /**
   * Qloo's own 0–1 match score (`query.affinity` on the raw result). Results
   * come back sorted by it, so it adds evidence rather than resolution.
   */
  affinity?: number;
  popularity?: number;
  tags: QlooTag[];
  /** Present only when explainability was requested. */
  why?: ExplainContribution[];
};

/** One audience from /v2/audiences, usable as `signal.demographics.audiences`. */
export type QlooAudience = {
  /** Qloo's audience UUID. */
  entityId: string;
  /** Slug-style ID, e.g. `urn:audience:leisure:music_festivals`. */
  id: string;
  name: string;
  /** e.g. `urn:audience:leisure`. */
  type?: string;
  parents: { id?: string; name?: string; type?: string }[];
  disambiguation?: string;
};

/** One row of /v2/tags/types or /v2/audiences/types. */
export type QlooTypeNode = {
  /** e.g. `urn:tag:genre:qloo` or `urn:audience:leisure`. */
  type: string;
  /** Entity (or audience) types this type applies to, e.g. `urn:entity:movie`. */
  parents: string[];
};

export type QueryValue = string | number | boolean | string[] | undefined;

/** Flat query-string model mirroring Qloo's dotted parameter names. */
export type QlooQuery = Record<string, QueryValue>;

export type CacheState = 'hit' | 'miss' | 'bypass';

export type QlooMeta = {
  latencyMs: number;
  cache: CacheState;
  /** Non-fatal observations (empty results, ignored params, explainability gaps). */
  warnings: string[];
};

export type QlooResult<T> = {
  items: T[];
  meta: QlooMeta;
};

/** Raw envelope, only ever exchanged between client and normalizer. */
export type QlooEnvelope = {
  success?: boolean;
  results?: Record<string, unknown>;
  query?: Record<string, unknown>;
  duration?: number;
  [key: string]: unknown;
};
