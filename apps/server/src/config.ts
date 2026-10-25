export type ServerConfig = {
  apiKey: string;
  baseUrl: string;
  port: number;
  publicOrigin?: string;
  corsOrigins: string[];
  cacheTtlMs: number;
  openaiApiKey?: string;
  openaiModel: string;
};

const DEFAULT_BASE = 'https://hackathon.api.qloo.com';
const DEFAULT_PORT = 8787;
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKey = (env.QLOO_API_KEY ?? '').trim();
  const baseUrl = (env.QLOO_API_BASE ?? DEFAULT_BASE).trim().replace(/\/+$/, '');
  const port = toInt(env.PORT, DEFAULT_PORT);
  const cacheTtlSeconds = toInt(env.QLOO_CACHE_TTL, DEFAULT_TTL_SECONDS);
  const publicOrigin = (env.PUBLIC_ORIGIN ?? '').trim() || undefined;

  return {
    apiKey,
    baseUrl,
    port,
    publicOrigin,
    corsOrigins: splitList(env.CORS_ORIGINS).length > 0 ? splitList(env.CORS_ORIGINS) : ['*'],
    cacheTtlMs: Math.max(0, cacheTtlSeconds) * 1000,
    openaiApiKey: (env.OPENAI_API_KEY ?? '').trim() || undefined,
    openaiModel: (env.OPENAI_MODEL ?? 'gpt-4o-mini').trim(),
  };
}

/** Public origin used for absolute links in docs and the demo page. */
export function originOf(config: ServerConfig, requestUrl: string): string {
  if (config.publicOrigin) return config.publicOrigin.replace(/\/+$/, '');
  return new URL(requestUrl).origin;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
