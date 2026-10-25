import { TtlCache } from './cache.js';
import { QlooError } from './errors.js';
import {
  buildAudiencesQuery,
  buildCompareQuery,
  buildEntitiesQuery,
  buildInsightsQuery,
  buildSearchQuery,
  buildTagsQuery,
  buildTrendingQuery,
  buildTypeListQuery,
  toSearchParams,
  type AudiencesParams,
  type CompareParams,
  type EntitiesParams,
  type InsightsParams,
  type SearchParams,
  type TagsParams,
  type TrendingParams,
  type TypeListParams,
} from './params.js';
import type { QlooEnvelope, QlooMeta, QlooQuery } from './types.js';

export const QLOO_HACKATHON_BASE = 'https://hackathon.api.qloo.com';

export type QlooClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Private server-side cache TTL. 0 disables caching. */
  cacheTtlMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
  cache?: TtlCache;
};

export type QlooCall = {
  data: QlooEnvelope;
  meta: QlooMeta;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export class QlooClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private readonly cache: TtlCache;

  constructor(options: QlooClientOptions) {
    if (!options.apiKey) {
      throw new QlooError('config', 'QLOO_API_KEY is not set', {
        hint: 'Set QLOO_API_KEY in the server environment, or configure the qlooApiKey secret setting in the Devvit app.',
      });
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? QLOO_HACKATHON_BASE).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? 2;
    this.userAgent = options.userAgent ?? 'taste-engine/0.1 (+qloo-agentic-hackathon)';
    this.cache = options.cache ?? new TtlCache(options.cacheTtlMs ?? DEFAULT_TTL_MS);
  }

  /** Fresh recommendations for a taste profile. The core call. */
  insights(params: InsightsParams): Promise<QlooCall> {
    return this.call('/v2/insights', buildInsightsQuery(params));
  }

  /** Entity lookup — the only way to obtain the entity IDs other calls need. */
  search(params: SearchParams): Promise<QlooCall> {
    return this.call('/search', buildSearchQuery(params));
  }

  /** Tag lookup — required before using filter.tags / signal.interests.tags. */
  tags(params: TagsParams): Promise<QlooCall> {
    return this.call('/v2/tags', buildTagsQuery(params));
  }

  /** Time series of interest. */
  trending(params: TrendingParams): Promise<QlooCall> {
    return this.call('/v2/trending', buildTrendingQuery(params));
  }

  /** Taste overlap / divergence between two profiles. */
  compare(params: CompareParams): Promise<QlooCall> {
    return this.call('/v2/analysis/compare', buildCompareQuery(params));
  }

  /** Resolve entities by ID. The endpoint requires bare UUIDs. */
  entities(params: EntitiesParams): Promise<QlooCall> {
    if (params.ids.length === 0) {
      return Promise.resolve({ data: { success: true, results: { entities: [] } }, meta: emptyMeta() });
    }
    return this.call('/entities', buildEntitiesQuery(params));
  }

  /** Audiences — usable as `signal.demographics.audiences` on /v2/insights. */
  audiences(params: AudiencesParams): Promise<QlooCall> {
    return this.call('/v2/audiences', buildAudiencesQuery(params));
  }

  /** Every tag type Qloo knows about, e.g. `urn:tag:genre:qloo`. */
  tagTypes(params: TypeListParams): Promise<QlooCall> {
    return this.call('/v2/tags/types', buildTypeListQuery(params));
  }

  /** Every audience type Qloo knows about, e.g. `urn:audience:leisure`. */
  audienceTypes(params: TypeListParams): Promise<QlooCall> {
    return this.call('/v2/audiences/types', buildTypeListQuery(params));
  }

  /** Escape hatch for documented params not modelled above. */
  raw(path: string, query: QlooQuery): Promise<QlooCall> {
    return this.call(path, query);
  }

  private async call(path: string, query: QlooQuery): Promise<QlooCall> {
    const key = cacheKey(path, query);
    const cached = this.cache.get<QlooEnvelope>(key);
    if (cached) {
      return {
        data: cached,
        meta: { latencyMs: 0, cache: 'hit', warnings: [] },
      };
    }

    const started = Date.now();
    const warnings: string[] = [];
    const data = await this.fetchWithRetry(path, query);

    if (countResults(data) === 0) {
      warnings.push(
        'Qloo returned an empty bucket. Unknown IDs are rejected with HTTP 400, so an empty result usually means a filter excluded everything (or, for trending, a window under ~6 months).',
      );
    }

    this.cache.set(key, data);
    return {
      data,
      meta: { latencyMs: Date.now() - started, cache: 'miss', warnings },
    };
  }

  private async fetchWithRetry(path: string, query: QlooQuery): Promise<QlooEnvelope> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.fetchOnce(path, query);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.maxRetries) throw error;
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError;
  }

  private async fetchOnce(path: string, query: QlooQuery): Promise<QlooEnvelope> {
    const url = new URL(this.baseUrl + path);
    url.search = toSearchParams(query).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
          Accept: 'application/json',
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbort(error)) {
        throw new QlooError('timeout', `Qloo did not respond within ${this.timeoutMs}ms`, { detail: String(error) });
      }
      throw new QlooError('network', `Could not reach ${this.baseUrl}${path}`, { detail: String(error) });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) throw httpError(response.status, text, path);

    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new QlooError('invalid_response', `Qloo returned non-JSON for ${path}`, {
        status: response.status,
        detail: text.slice(0, 400),
      });
    }

    if (!isObject(parsed)) {
      throw new QlooError('invalid_response', `Unexpected payload shape for ${path}`, { status: response.status });
    }
    return parsed as QlooEnvelope;
  }
}

export function cacheKey(path: string, query: QlooQuery): string {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`);
  return `${path}?${entries.join('&')}`;
}

export function countResults(data: QlooEnvelope): number {
  const results = data.results;
  if (!results) return 0;
  // /search and /entities return a bare array; all /v2 endpoints use buckets.
  if (Array.isArray(results)) return results.length;
  for (const value of Object.values(results)) {
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function httpError(status: number, body: string, path: string): QlooError {
  let detail: unknown = body.slice(0, 400);
  try {
    detail = JSON.parse(body);
  } catch {
    // keep text
  }
  const message = `Qloo ${path} failed with HTTP ${status}`;
  if (status === 401) return new QlooError('auth', message, { status, detail });
  if (status === 403) return new QlooError('forbidden', message, { status, detail });
  if (status === 404) return new QlooError('not_found', message, { status, detail });
  if (status === 429) return new QlooError('rate_limited', message, { status, detail });
  if (status >= 400 && status < 500) return new QlooError('bad_request', message, { status, detail });
  return new QlooError('server', message, { status, detail });
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof QlooError)) return false;
  if (error.kind === 'rate_limited' || error.kind === 'server' || error.kind === 'network' || error.kind === 'timeout') {
    return true;
  }
  return false;
}

function backoffMs(attempt: number): number {
  const base = Math.min(2000, 250 * 2 ** attempt);
  return base + Math.floor(Math.random() * 120);
}

function isAbort(error: unknown): boolean {
  return isObject(error) && (error as { name?: unknown }).name === 'AbortError';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyMeta(): QlooMeta {
  return { latencyMs: 0, cache: 'bypass', warnings: [] };
}
