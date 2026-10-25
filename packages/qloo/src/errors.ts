export type QlooErrorKind =
  | 'auth'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'bad_request'
  | 'server'
  | 'timeout'
  | 'network'
  | 'config'
  | 'invalid_response';

/**
 * Every Qloo failure carries an actionable hint. Validation is real: unknown
 * entity IDs, unsupported `filter.type` values and missing signals all come
 * back as HTTP 400 with a `message` naming the offending parameter.
 */
export class QlooError extends Error {
  readonly kind: QlooErrorKind;
  readonly status?: number;
  readonly detail?: unknown;
  readonly hint: string;

  constructor(kind: QlooErrorKind, message: string, opts: { status?: number; detail?: unknown; hint?: string } = {}) {
    super(message);
    this.name = 'QlooError';
    this.kind = kind;
    this.status = opts.status;
    this.detail = opts.detail;
    this.hint = opts.hint ?? DEFAULT_HINTS[kind];
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      status: this.status,
      message: this.message,
      hint: this.hint,
    };
  }
}

const DEFAULT_HINTS: Record<QlooErrorKind, string> = {
  auth: 'Hackathon keys only work against https://hackathon.api.qloo.com and must be sent as the X-Api-Key header (not Bearer, not a query param).',
  forbidden: 'Qloo refused the request (HTTP 403). The hackathon key is scoped to the documented endpoints; drop undocumented paths or parameters.',
  rate_limited: 'Qloo rate limit hit. Requests are cached; retry after the indicated delay or request a quota raise in the Qloo Discord #api-help channel.',
  not_found: 'Entity or identifier not found. Resolve IDs with qloo_search_entities before passing them as parameters.',
  bad_request: 'Request rejected. Read the returned `message`/`path`: unsupported filter.type, unknown entity IDs and "at least one valid signal or filter is required" all arrive as HTTP 400.',
  server: 'Qloo returned a server error. Safe to retry with backoff.',
  timeout: 'Qloo did not answer in time. Reduce take, drop explainability, or retry.',
  network: 'Could not reach Qloo. Check egress/DNS from the host.',
  config: 'Server is missing configuration (usually QLOO_API_KEY).',
  invalid_response: 'Qloo returned a payload without the expected results array. Check the endpoint path and that the response was not truncated.',
};
