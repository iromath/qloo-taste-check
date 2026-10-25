import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './config.js';
import { createContext, errorPayload } from './context.js';
import { renderDemoPage } from './demo.js';
import { renderLegalPage } from './legal.js';
import { handleMcpRequest, SERVER_INFO } from './mcp.js';
import { createApi } from './rest.js';

const config = loadConfig();
const ctx = createContext(config);

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'Mcp-Session-Id', 'MCP-Protocol-Version', 'Last-Event-ID'],
    exposeHeaders: ['Mcp-Session-Id'],
    maxAge: 86400,
  }),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: SERVER_INFO.name,
    version: SERVER_INFO.version,
    qloo: ctx.qloo ? 'configured' : 'missing_key',
    uptime_s: Math.round(process.uptime()),
  }),
);

app.all('/mcp', (c) => handleMcpRequest(ctx, c.req.raw));

app.route('/api', createApi(ctx));

app.get('/', (c) => c.html(renderDemoPage(new URL(c.req.url).origin, ctx.qloo !== null)));

for (const [route, file] of [['/terms', 'TERMS.md'], ['/privacy', 'PRIVACY.md']] as const) {
  app.get(route, (c) => {
    const html = renderLegalPage(file);
    return html === null
      ? c.json({ error: { kind: 'not_found', message: `${file} is missing from the deployment` } }, 404)
      : c.html(html);
  });
}

app.notFound((c) => c.json({ error: { kind: 'not_found', message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}`, hint: 'Try /, /health, /mcp or /api/capabilities.' } }, 404));

app.onError((error, c) => {
  console.error('[server] unhandled', error);
  const payload = errorPayload(error);
  return c.json(payload, 500);
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] ${SERVER_INFO.name} v${SERVER_INFO.version} listening on http://localhost:${info.port}`);
  console.log(`[server] MCP endpoint: http://localhost:${info.port}/mcp`);
  console.log(`[server] Qloo key: ${ctx.qloo ? 'configured' : 'MISSING (set QLOO_API_KEY)'}`);
  console.log(`[server] Qloo base: ${config.baseUrl}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
