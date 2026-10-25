import { QlooClient, QlooError } from '@taste/qloo';
import type { ServerConfig } from './config.js';

export type AppContext = {
  config: ServerConfig;
  /** `null` when QLOO_API_KEY is absent; tools then return an actionable error. */
  qloo: QlooClient | null;
};

export function createContext(config: ServerConfig): AppContext {
  const qloo = config.apiKey
    ? new QlooClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        cacheTtlMs: config.cacheTtlMs,
      })
    : null;
  return { config, qloo };
}

export function requireQloo(ctx: AppContext): QlooClient {
  if (!ctx.qloo) {
    throw new QlooError('config', 'QLOO_API_KEY is not configured on this server', {
      hint: 'Add QLOO_API_KEY to the server environment (see .env.example). Hackathon keys only work against https://hackathon.api.qloo.com.',
    });
  }
  return ctx.qloo;
}

export type ErrorPayload = {
  error: {
    kind: string;
    message: string;
    hint: string;
    status?: number;
  };
};

export function errorPayload(error: unknown): ErrorPayload {
  if (error instanceof ToolInputError) {
    return { error: { kind: 'invalid_input', message: error.message, hint: error.hint } };
  }
  if (error instanceof QlooError) {
    return {
      error: {
        kind: error.kind,
        message: error.message,
        hint: error.hint,
        ...(error.status === undefined ? {} : { status: error.status }),
      },
    };
  }
  return {
    error: {
      kind: 'unknown',
      message: error instanceof Error ? error.message : String(error),
      hint: 'Unexpected failure while talking to Qloo. Check server logs.',
    },
  };
}

/** Thrown by tools when the model passed a request Qloo would silently ignore. */
export class ToolInputError extends Error {
  readonly hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = 'ToolInputError';
    this.hint = hint;
  }
}
