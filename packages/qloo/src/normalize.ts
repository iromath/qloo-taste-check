/**
 * Turns raw Qloo envelopes into the small, stable shapes that cross the tool
 * boundary.
 *
 * Qloo's payloads are verbose and vary by endpoint, and its types are only
 * loosely documented, so every accessor here is defensive: a missing field
 * degrades that one item instead of throwing, and anything unrecognised is
 * dropped rather than forwarded.
 */

import type { ExplainContribution, QlooAudience, QlooEnvelope, QlooEntity, QlooTag, QlooTypeNode } from './types.js';

export type Normalized<T> = {
  items: T[];
  warnings: string[];
};

export type TrendPoint = {
  entityId?: string;
  name?: string;
  subtype?: string;
  /** ISO date for this observation, when the endpoint returns a series. */
  date?: string;
  /** Population rank at this date (`population_rank`). */
  rank?: number;
  /** Share of the population, 0..1 (`population_percentile`). */
  percentile?: number;
  /** Rank movement since the previous point (`population_rank_velocity`). */
  rankVelocity?: number;
  /** Interest vs. the previous point, as a fold change (`velocity_fold_change`). */
  velocity?: number;
  /** Percentage-point change in population share (`population_percent_delta`). */
  percentileDelta?: number;
};

/** One tag/entity entry on either side of /v2/analysis/compare. */
export type CompareItem = QlooTag & {
  side: 'a' | 'b' | 'shared';
  /** How many of the profile's seeds carry this tag (`query.count`). */
  count?: number;
};

export type CompareResult = {
  /** Tags driving profile A. */
  a: CompareItem[];
  /** Tags driving profile B. */
  b: CompareItem[];
  /** Tags (or entities) both profiles share. */
  shared: CompareItem[];
  metrics: Record<string, number>;
  warnings: string[];
};

/** Normalize `results.entities` from any endpoint that returns entities. */
export function normalizeEntities(data: QlooEnvelope, opts: { explainability?: boolean } = {}): Normalized<QlooEntity> {
  const warnings: string[] = [];
  const raw = collectEntities(data);

  if (raw.length === 0) {
    warnings.push(emptyWarning(data));
    return { items: [], warnings };
  }

  const seen = new Set<string>();
  const items: QlooEntity[] = [];

  for (const entry of raw) {
    const id = asString(entry.id) ?? asString(entry.entity_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    // /search and /entities return `types: ["urn:entity:movie"]`; /v2/insights
    // returns `subtype`. Read both so search hits are not typeless.
    const subtype = asString(entry.subtype) ?? firstString(entry.types) ?? asString(entry.type) ?? '';
    const query = isObject(entry.query) ? entry.query : {};
    // Per-result shape: query.explainability["signal.interests.entities"] = [{ entity_id, score }].
    // Never pass the whole query object: it also holds `affinity`, which looks numeric.
    const why = readExplainability(query.explainability ?? entry.explainability);
    const affinity = asNumber(query.affinity) ?? asNumber(entry.affinity);

    items.push({
      id,
      name: asString(entry.name) ?? asString(entry.title) ?? id,
      type: asString(entry.type) ?? 'urn:entity',
      subtype,
      rank: items.length + 1,
      ...(affinity === undefined ? {} : { affinity }),
      popularity: asNumber(entry.popularity),
      tags: normalizeTagList(entry.tags ?? entry.properties),
      ...(why.length > 0 ? { why } : {}),
    });
  }

  if (items.length === 0) warnings.push(emptyWarning(data));
  if (opts.explainability && items.every((item) => !item.why)) {
    warnings.push(explainabilityWarning(data));
  }
  warnings.push(...aggregateWarnings(data));

  return { items, warnings };
}

/** Normalize `results.tags` from /v2/tags. */
export function normalizeTags(data: QlooEnvelope): Normalized<QlooTag> {
  const warnings: string[] = [];
  const raw = collectArray(data, 'tags');

  if (raw.length === 0) {
    warnings.push(emptyWarning(data));
    return { items: [], warnings };
  }

  const seen = new Set<string>();
  const items: QlooTag[] = [];

  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const id = asString(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      name: asString(entry.name) ?? id,
      type: asString(entry.type),
      subtype: asString(entry.subtype),
      popularity: asNumber(entry.popularity),
    });
  }

  if (items.length === 0) warnings.push(emptyWarning(data));
  return { items, warnings };
}

/**
 * Normalize `results.audiences` from /v2/audiences.
 *
 * Verified shape: each entry carries both `entity_id` (the UUID that
 * `signal.demographics.audiences` expects) and `id` (a slug such as
 * `urn:audience:leisure:music_festivals`).
 */
export function normalizeAudiences(data: QlooEnvelope): Normalized<QlooAudience> {
  const warnings: string[] = [];
  const raw = collectArray(data, 'audiences');

  if (raw.length === 0) {
    warnings.push(emptyWarning(data));
    return { items: [], warnings };
  }

  const seen = new Set<string>();
  const items: QlooAudience[] = [];

  for (const entry of raw) {
    const entityId = asString(entry.entity_id) ?? asString(entry.id);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    items.push({
      entityId,
      id: asString(entry.id) ?? entityId,
      name: asString(entry.name) ?? entityId,
      type: asString(entry.type),
      parents: readAudienceParents(entry.parents),
      disambiguation: asString(entry.disambiguation),
    });
  }

  if (items.length === 0) warnings.push(emptyWarning(data));
  return { items, warnings };
}

/**
 * Normalize /v2/tags/types (`results.tag_types`) or /v2/audiences/types
 * (`results.audience_types`). Both are lists of `{ type, parents }`.
 */
export function normalizeTypeNodes(
  data: QlooEnvelope,
  bucket: 'tag_types' | 'audience_types',
): Normalized<QlooTypeNode> {
  const warnings: string[] = [];
  const raw = collectArray(data, bucket);

  if (raw.length === 0) {
    warnings.push(emptyWarning(data));
    return { items: [], warnings };
  }

  const seen = new Set<string>();
  const items: QlooTypeNode[] = [];

  for (const entry of raw) {
    const type = asString(entry.type);
    if (!type || seen.has(type)) continue;
    seen.add(type);
    items.push({ type, parents: readTypeParents(entry.parents) });
  }

  if (items.length === 0) warnings.push(emptyWarning(data));
  return { items, warnings };
}

function readAudienceParents(value: unknown): QlooAudience['parents'] {
  if (!Array.isArray(value)) return [];
  const out: QlooAudience['parents'] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push({ type: entry });
      continue;
    }
    if (!isObject(entry)) continue;
    const type = asString(entry.type);
    if (!type) continue;
    out.push({ type, id: asString(entry.id), name: asString(entry.name) });
  }
  return out;
}

function readTypeParents(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push(entry);
      continue;
    }
    if (!isObject(entry)) continue;
    const type = asString(entry.type);
    if (type) out.push(type);
  }
  return out;
}

/**
 * Normalize the weekly time series returned by /v2/trending.
 *
 * Verified shape: `results.trending[]` of
 * `{ date, population_percentile, population_rank, population_rank_velocity,
 *    velocity_fold_change, population_percent_delta }`.
 */
export function normalizeTrending(data: QlooEnvelope): Normalized<TrendPoint> {
  const warnings: string[] = [];
  const raw = collectArray(data, 'trending');

  if (raw.length === 0) {
    warnings.push(emptyWarning(data));
    return { items: [], warnings };
  }

  const items: TrendPoint[] = [];
  for (const entry of raw) {
    const source = { ...entry, ...(isObject(entry.query) ? entry.query : {}), ...(isObject(entry.properties) ? entry.properties : {}) };
    items.push({
      entityId: asString(source.id) ?? asString(source.entity_id),
      name: asString(source.name) ?? asString(source.title),
      subtype: asString(source.subtype),
      date: asDate(source.date) ?? asDate(source.week) ?? asDate(source.timestamp),
      rank: asNumber(source.population_rank) ?? asNumber(source.rank),
      percentile: asNumber(source.population_percentile) ?? asNumber(source.percentile),
      rankVelocity: asNumber(source.population_rank_velocity),
      velocity: asNumber(source.velocity_fold_change) ?? asNumber(source.velocity),
      percentileDelta: asNumber(source.population_percent_delta),
    });
  }

  return { items, warnings };
}

/**
 * Normalize /v2/analysis/compare.
 *
 * Verified shape: `results.{a,b,matchEntities}` hold tag objects keyed by
 * `tag_id` (not `id`), each with `query.count`. There is no `results.entities`
 * and no numeric metrics, so `metrics` stays empty rather than inventing one.
 */
export function normalizeCompare(data: QlooEnvelope): CompareResult {
  const warnings: string[] = [];
  const a = readCompareItems(data.results?.a, 'a');
  const b = readCompareItems(data.results?.b, 'b');
  const shared = readCompareItems(data.results?.matchEntities, 'shared');

  if (a.length === 0 && b.length === 0) warnings.push(emptyWarning(data));

  return { a, b, shared, metrics: numericMetrics(data.results), warnings };
}

/**
 * Aggregate influence across top-N result subsets.
 *
 * Verified shape:
 * `query.explainability["signal.interests.entities"] = { effect_on_top3_recs:
 * [{ entity_id, avg_score }], effect_on_top5_recs: [...], ... }`.
 *
 * Keys are flattened to `<bucket>.<top3|top5|top10|all>` so a caller can tell
 * which slice of the result list a contribution belongs to.
 */
export function readAggregateExplainability(data: QlooEnvelope): Record<string, ExplainContribution[]> {
  const source = data.query?.explainability;
  if (!isObject(source)) return {};
  const out: Record<string, ExplainContribution[]> = {};
  for (const [bucket, value] of Object.entries(source)) {
    if (bucket === 'warning') continue;

    // Live shape: a map of effect_on_topN_recs -> array.
    if (isObject(value) && !isObject(value.contributions)) {
      for (const [slice, inner] of Object.entries(value)) {
        const contributions = readExplainability(inner);
        if (contributions.length > 0) out[`${bucket}.${shortSlice(slice)}`] = contributions;
      }
      continue;
    }

    const contributions = readExplainability(value);
    if (contributions.length > 0) out[bucket] = contributions;
  }
  return out;
}

function shortSlice(key: string): string {
  const match = /^effect_on_(top\d+|all)_recs$/.exec(key);
  return match?.[1] ?? key;
}

/** Any `query.explainability.warning` string, surfaced as a meta warning. */
export function explainabilityWarning(data: QlooEnvelope): string {
  const source = data.query?.explainability;
  if (isObject(source)) {
    const warning = asString(source.warning);
    if (warning) return `Qloo could not compute explainability: ${warning}`;
    // Verified: a single seed often yields only envelope-level buckets
    // (`effect_on_topN_recs`) and no per-result contributions.
    if (Object.keys(readAggregateExplainability(data)).length > 0) {
      return 'Qloo returned aggregate influence buckets but no per-result contributions; read `influences` to see which seeds drove the top results.';
    }
  }
  return 'Explainability was requested but no per-result contributions came back. Rank order still reflects affinity.';
}

function collectEntities(data: QlooEnvelope): Record<string, unknown>[] {
  return collectArray(data, 'entities');
}

/**
 * Read one named array bucket out of `results`.
 *
 * Endpoints disagree on the bucket name (`entities`, `tags`, `trending`) and
 * `/search` returns a bare array, so every reader goes through here.
 */
function collectArray(data: QlooEnvelope, bucketName: string): Record<string, unknown>[] {
  const results = data.results;
  if (!results) return [];
  if (Array.isArray(results)) return results.filter(isObject);
  const bucket = (results as Record<string, unknown>)[bucketName];
  if (!Array.isArray(bucket)) return [];
  return bucket.filter(isObject);
}

function readCompareItems(value: unknown, side: CompareItem['side']): CompareItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: CompareItem[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = asString(entry.tag_id) ?? asString(entry.id) ?? asString(entry.entity_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const query = isObject(entry.query) ? entry.query : {};
    items.push({
      id,
      name: asString(entry.name) ?? id,
      type: asString(entry.type),
      subtype: asString(entry.subtype),
      popularity: asNumber(entry.popularity),
      side,
      ...(asNumber(query.count) === undefined ? {} : { count: asNumber(query.count) }),
    });
  }
  return items;
}

function aggregateWarnings(data: QlooEnvelope): string[] {
  const source = data.query?.explainability;
  if (!isObject(source)) return [];
  const warning = asString(source.warning);
  return warning ? [`Qloo could not compute explainability: ${warning}`] : [];
}

/**
 * Explainability shows up in a few shapes depending on endpoint and version:
 * an array of `{ entity_id, score }`, an array of `{ entity_id, avg_score }`
 * (aggregate buckets), an array of `{ entity, score }`, or a plain
 * `{ entityId: score }` map. All of them collapse to the same shape.
 */
function readExplainability(value: unknown): ExplainContribution[] {
  if (Array.isArray(value)) {
    const out: ExplainContribution[] = [];
    for (const entry of value) {
      if (!isObject(entry)) continue;
      const entity = isObject(entry.entity) ? entry.entity : {};
      const entityId = asString(entry.id) ?? asString(entry.entity_id) ?? asString(entity.id);
      const score =
        asNumber(entry.score) ?? asNumber(entry.avg_score) ?? asNumber(entry.value) ?? asNumber(entry.weight);
      if (!entityId || score === undefined) continue;
      out.push({ entityId, name: asString(entry.name) ?? asString(entity.name), score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  if (isObject(value)) {
    const nested = isObject(value.contributions) ? value.contributions : value;
    return readExplainability(Object.entries(nested).map(([id, score]) => ({ id, score })));
  }

  return [];
}

function normalizeTagList(value: unknown): QlooTag[] {
  const raw = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.tags) ? value.tags : [];
  const tags: QlooTag[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      tags.push({ id: entry, name: entry });
      continue;
    }
    if (!isObject(entry)) continue;
    const id = asString(entry.id);
    if (!id) continue;
    tags.push({
      id,
      name: asString(entry.name) ?? id,
      type: asString(entry.type),
      subtype: asString(entry.subtype),
      popularity: asNumber(entry.popularity),
    });
  }
  return tags;
}

function numericMetrics(results: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!results) return out;
  for (const [key, value] of Object.entries(results)) {
    if (Array.isArray(value)) continue;
    const numeric = asNumber(value);
    if (numeric !== undefined) out[key] = numeric;
  }
  return out;
}

function emptyWarning(data: QlooEnvelope): string {
  if (data.success === false) return 'Qloo reported failure. Verify the API key and request parameters.';
  return 'Qloo returned an empty bucket. Unknown entity IDs are rejected with HTTP 400, so this is usually either a filter that excluded everything or a trending window shorter than a few months.';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(asString).find((item) => item !== undefined) : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asDate(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
