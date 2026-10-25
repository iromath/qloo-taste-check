import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AppContext } from './context.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

export const SERVER_INFO = { name: 'taste-engine', version: '0.1.0' } as const;

const INSTRUCTIONS = `Taste Engine exposes Qloo's cultural taste graph as tools.

Qloo has no free-text search inside its recommendation endpoint. The reliable flow is:

1. qloo_search_entities — resolve every name to a Qloo entity ID.
2. qloo_search_tags — resolve every concept to a Qloo tag ID (tag names are not tag IDs).
3. qloo_recommend — pass IDs, get a ranked list. Hits are sorted by Qloo affinity, returned per result as \`affinity\` (0–1).
4. qloo_explain — turn a rank into a plain-language reason.

Supporting tools, for the rest of the Qloo surface:
- qloo_get_entities — turn entity IDs you already hold back into names, types and tags.
- qloo_search_audiences — resolve a demographic or lifestyle group to an audience UUID, then pass it to qloo_recommend as \`audiences\`.
- qloo_list_types — the tag and audience taxonomy behind every \`filter.*.types\` value.
- qloo_compare_tastes, qloo_trending, qloo_build_taste_profile — overlap, time series, and free-text resolution.

Rules that prevent most bad results:
- Only nine entity types are valid for recommendations: artist, book, brand, destination, movie, person, place, podcast, tv_show. \`video_game\` is rejected by /v2/insights.
- A recommendation needs at least one signal (entity ID, tag ID or audience ID); \`filter.type\` alone returns HTTP 400.
- Qloo validates strictly: unknown IDs, unsupported types and missing signals return HTTP 400 with a message naming the parameter. An empty bucket means a valid request matched nothing.
- /v2/insights is GET-only and /search radius is in miles while /v2/insights radius is in metres.
- Read qloo://reference/parameters and qloo://reference/tag-workflow when a call behaves unexpectedly.`;

export function createMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, ctx);
  registerResources(server);
  registerPrompts(server);
  return server;
}

/**
 * Stateless Streamable HTTP: one server + transport per request, no session ID.
 * This keeps the deployment horizontally scalable behind a plain reverse proxy.
 */
export async function handleMcpRequest(ctx: AppContext, request: Request): Promise<Response> {
  const server = createMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
