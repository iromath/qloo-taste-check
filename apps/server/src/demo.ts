/**
 * Public landing page. Deliberately a single self-contained document so the
 * demo has no build step and no dependency on Reddit app review.
 */
export function renderDemoPage(origin: string, ready: boolean): string {
  const endpoint = `${origin}/mcp`;
  const statusLabel = ready ? 'Qloo key loaded' : 'QLOO_API_KEY missing';
  const statusClass = ready ? 'ok' : 'warn';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Taste Engine — Qloo as MCP tools</title>
<meta name="description" content="A self-hosted MCP server that turns Qloo's cultural taste graph into agent tools." />
<style>
  :root {
    --ink: #0d0c0f;
    --panel: #16141a;
    --panel-2: #1d1a22;
    --line: #2b2733;
    --text: #ece8f2;
    --muted: #9c94ab;
    --accent: #c084fc;
    --accent-2: #f0abfc;
    --love: #4ade80;
    --meh: #facc15;
    --pass: #94a3b8;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background:
      radial-gradient(900px 500px at 15% -10%, rgba(192,132,252,.16), transparent 60%),
      radial-gradient(700px 420px at 95% 0%, rgba(240,171,252,.10), transparent 55%),
      var(--ink);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent-2); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
  header.site {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: 22px 0; border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 650; letter-spacing: -.01em; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
  .pill {
    font: 500 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase;
    border: 1px solid var(--line); border-radius: 999px; padding: 7px 11px; color: var(--muted);
  }
  .pill.ok { color: var(--love); border-color: rgba(74,222,128,.35); }
  .pill.warn { color: var(--meh); border-color: rgba(250,204,21,.35); }
  .hero { padding: 72px 0 40px; max-width: 780px; }
  .kicker { font: 500 12px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  h1 {
    font-size: clamp(38px, 6vw, 62px); line-height: 1.03; letter-spacing: -.035em;
    margin: 18px 0 0; font-weight: 680;
  }
  h1 em { font-style: normal; background: linear-gradient(100deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lede { font-size: 19px; color: var(--muted); margin: 22px 0 0; max-width: 640px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; border-radius: 10px;
    padding: 11px 16px; font-weight: 600; font-size: 14px; border: 1px solid var(--line);
    background: var(--panel); color: var(--text); cursor: pointer;
  }
  .btn.primary { background: linear-gradient(135deg, #a855f7, #d946ef); border-color: transparent; color: #fff; }
  .btn:hover { filter: brightness(1.08); text-decoration: none; }
  section { padding: 44px 0; border-top: 1px solid var(--line); }
  h2 { font-size: 13px; font-family: var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0 0 20px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .card {
    background: linear-gradient(180deg, var(--panel), var(--panel-2));
    border: 1px solid var(--line); border-radius: 14px; padding: 20px;
  }
  .card h3 { margin: 0 0 6px; font-size: 16px; letter-spacing: -.01em; }
  .card p { margin: 0; color: var(--muted); font-size: 14px; }
  label { display: block; font-size: 12px; font-family: var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  input[type="text"], select {
    width: 100%; padding: 12px 13px; border-radius: 10px; border: 1px solid var(--line);
    background: #100e13; color: var(--text); font: 14px var(--font);
  }
  input[type="text"]:focus, select:focus { outline: 2px solid rgba(192,132,252,.4); outline-offset: 1px; border-color: var(--accent); }
  .row { display: grid; grid-template-columns: 1fr 200px; gap: 12px; margin-bottom: 14px; }
  @media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
  #out { margin-top: 18px; }
  .hit {
    display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center;
    padding: 13px 0; border-bottom: 1px solid var(--line);
  }
  .hit:last-child { border-bottom: 0; }
  .rank { font: 600 13px var(--mono); color: var(--muted); }
  .hit .name { font-weight: 580; font-size: 15px; }
  .hit .why { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .verdict { font: 700 10.5px/1 var(--mono); letter-spacing: .1em; padding: 6px 9px; border-radius: 999px; }
  .v-LOVE { color: var(--love); background: rgba(74,222,128,.12); }
  .v-MEH { color: var(--meh); background: rgba(250,204,21,.12); }
  .v-PASS { color: var(--pass); background: rgba(148,163,184,.12); }
  .note { font-size: 13px; color: var(--muted); margin-top: 14px; }
  .warnbox { border: 1px solid rgba(250,204,21,.3); background: rgba(250,204,21,.06); color: #fde68a; border-radius: 10px; padding: 12px 14px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 11px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font: 600 11px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  td code { font: 12.5px var(--mono); color: var(--accent-2); }
  pre {
    margin: 0; background: #100e13; border: 1px solid var(--line); border-radius: 12px;
    padding: 16px; overflow-x: auto; font: 12.5px/1.6 var(--mono); color: #d8d2e2;
  }
  footer { border-top: 1px solid var(--line); padding: 26px 0 46px; color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 14px; justify-content: space-between; }
  .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <div class="brand"><span class="dot"></span> Taste Engine</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <span class="pill ${statusClass}">${statusLabel}</span>
      <span class="pill">MCP 1.32</span>
    </div>
  </header>

  <div class="hero">
    <div class="kicker">Qloo Agentic Hackathon</div>
    <h1>Cultural taste, <em>as tools</em> an agent can actually use.</h1>
    <p class="lede">
      A self-hosted Model Context Protocol server over Qloo's taste graph. Seven tools, three reference
      resources, two prompts — all sharing one validated client, so an agent resolves IDs first and
      never invents a recommendation.
    </p>
    <div class="actions">
      <a class="btn primary" href="#taste-check">Try the taste check</a>
      <a class="btn" href="#connect">Connect an agent</a>
      <a class="btn" href="/api/capabilities">API capabilities</a>
    </div>
  </div>

  <section id="taste-check">
    <h2>Live taste check</h2>
    <div class="card">
      <div class="row">
        <div>
          <label for="likes">Three things you like</label>
          <input id="likes" type="text" value="Blade Runner 2049, Aphex Twin, Tokyo" spellcheck="false" />
        </div>
        <div>
          <label for="type">Recommend</label>
          <select id="type">
            <option value="urn:entity:movie">Movies</option>
            <option value="urn:entity:artist">Artists</option>
            <option value="urn:entity:tv_show">TV shows</option>
            <option value="urn:entity:book">Books</option>
            <option value="urn:entity:destination">Destinations</option>
            <option value="urn:entity:place">Places</option>
            <option value="urn:entity:brand">Brands</option>
            <option value="urn:entity:podcast">Podcasts</option>
            <option value="urn:entity:person">People</option>
          </select>
        </div>
      </div>
      <button class="btn primary" id="go">Run taste check</button>
      <div id="out"></div>
      <p class="note">
        Two real calls: free text becomes Qloo entity IDs, then those IDs seed a ranked recommendation.
        Verdicts are relative rank thirds; Qloo also returns a 0–1 affinity for every hit.
      </p>
    </div>
  </section>

  <section>
    <h2>What the agent gets</h2>
    <div class="grid">
      <div class="card"><h3>Resolve before recommending</h3><p>Entity and tag search are first-class tools, because Qloo's recommender takes IDs — never free text.</p></div>
      <div class="card"><h3>One envelope everywhere</h3><p>Every tool returns <code>hits</code>, <code>warnings</code>, <code>cache</code> and <code>latency_ms</code>. Raw Qloo payloads never leak.</p></div>
      <div class="card"><h3>Honest about silence</h3><p>Qloo silently ignores invalid parameters. Zero results trigger an explanation instead of a confident lie.</p></div>
      <div class="card"><h3>Explainability as evidence</h3><p>Contributing anchors arrive with 0–1 scores, so a rank can be justified in plain language.</p></div>
    </div>
  </section>

  <section>
    <h2>Seven tools</h2>
    <table>
      <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
      <tbody>
        <tr><td><code>qloo_search_entities</code></td><td>Name → Qloo entity IDs, with type, location and radius filters.</td></tr>
        <tr><td><code>qloo_search_tags</code></td><td>Concept → Qloo tag IDs. Tag names are not tag IDs.</td></tr>
        <tr><td><code>qloo_recommend</code></td><td>Ranked recommendations from seeded IDs, with optional tags and explainability.</td></tr>
        <tr><td><code>qloo_compare_tastes</code></td><td>Two profiles, one entity type: where tastes converge and diverge.</td></tr>
        <tr><td><code>qloo_trending</code></td><td>Popularity trend for an entity type over a date window.</td></tr>
        <tr><td><code>qloo_build_taste_profile</code></td><td>Free-text tastes → anchors and tags ready to seed anything else.</td></tr>
        <tr><td><code>qloo_explain</code></td><td>Why a candidate ranked where it did, citing contributor scores.</td></tr>
      </tbody>
    </table>
  </section>

  <section id="connect">
    <h2>Connect an agent</h2>
    <p class="note" style="margin-top:0;margin-bottom:14px">Streamable HTTP, stateless. Point any MCP client at the endpoint below.</p>
    <pre>{
  "mcpServers": {
    "taste-engine": {
      "type": "http",
      "url": "${endpoint}"
    }
  }
}</pre>
    <p class="note">The same operations are mirrored over REST for the Reddit app and this page: <code>/api/profile</code>, <code>/api/recommend</code>, <code>/api/compare</code>, <code>/api/trending</code>, <code>/api/explain</code>.</p>
  </section>

  <footer>
    <span>Taste Engine — built for the Qloo Agentic Hackathon. MIT licensed.</span>
    <span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="https://qloo.com" target="_blank" rel="noreferrer">Qloo</a> · <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">MCP</a></span>
  </footer>
</div>

<script>
  const out = document.getElementById('out');
  const go = document.getElementById('go');

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Qloo exposes order, not a numeric affinity. Rank thirds keep the verdict
  // honest for any requested depth.
  function verdictFor(rank, total) {
    if (total <= 0) return 'MEH';
    const third = Math.ceil(total / 3);
    if (rank <= third) return 'LOVE';
    if (rank <= third * 2) return 'MEH';
    return 'PASS';
  }

  function renderError(payload) {
    const err = (payload && payload.error) || {};
    return '<div class="warnbox"><strong>' + esc(err.kind || 'error') + '</strong> — ' + esc(err.message || 'Request failed') +
      (err.hint ? '<br /><span style="opacity:.85">' + esc(err.hint) + '</span>' : '') + '</div>';
  }

  async function getJson(path, params) {
    const qs = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => key + '=' + encodeURIComponent(Array.isArray(value) ? value.join(',') : value))
      .join('&');
    const res = await fetch(path + (qs ? '?' + qs : ''));
    // A proxy in front of the relay can answer with text/plain, so never assume JSON.
    const body = await res.text();
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (_) { json = null; }

    if (!res.ok) {
      if (json && json.error) throw json;
      throw {
        error: {
          kind: 'upstream_' + res.status,
          message: body && body.length <= 160 ? body : 'The relay returned HTTP ' + res.status + ' with a non-JSON body.'
        }
      };
    }
    if (!json) {
      throw { error: { kind: 'bad_response', message: 'The relay returned an unreadable body.' } };
    }
    return json;
  }

  go.addEventListener('click', async () => {
    const likes = document.getElementById('likes').value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const type = document.getElementById('type').value;

    if (!likes.length) {
      out.innerHTML = renderError({ error: { kind: 'invalid_input', message: 'Give me at least one thing you like.' } });
      return;
    }

    out.innerHTML = '<p class="note"><span class="spinner"></span> Resolving your tastes…</p>';
    go.disabled = true;

    try {
      const profile = await getJson('/api/profile', { likes: likes });
      const anchors = (profile.profile && profile.profile.anchors) || [];
      if (!anchors.length) {
        out.innerHTML = renderError({
          error: {
            kind: 'no_match',
            message: 'None of those resolved to a Qloo entity.',
            hint: (profile.warnings || [])[0] || 'Try concrete titles, artists or places.'
          }
        });
        return;
      }

      const rec = await getJson('/api/recommend', {
        type: type,
        entities: anchors,
        tags: (profile.profile && profile.profile.tags) || [],
        take: 9
      });

      const hits = rec.hits || [];
      if (!hits.length) {
        out.innerHTML = renderError({
          error: { kind: 'no_match', message: 'Qloo returned nothing for that pair.', hint: (rec.warnings || [])[0] || '' }
        });
        return;
      }

      const rows = hits.map((hit) => {
        const why = hit.why && hit.why.length
          ? 'because ' + hit.why.slice(0, 3).map((w) => esc(w.name || w.entityId) + ' (' + Number(w.score).toFixed(2) + ')').join(', ')
          : (hit.affinity === undefined ? esc(hit.subtype || '') : 'affinity ' + Number(hit.affinity).toFixed(3));
        const verdict = verdictFor(hit.rank, hits.length);
        return '<div class="hit"><div class="rank">#' + hit.rank + '</div>' +
          '<div><div class="name">' + esc(hit.name || hit.id) + '</div><div class="why">' + why + '</div></div>' +
          '<div class="verdict v-' + verdict + '">' + verdict + '</div></div>';
      }).join('');

      const meta = 'cache ' + esc(rec.cache) + ' · ' + esc(rec.latency_ms) + ' ms · ' + anchors.length + ' anchor(s)';
      out.innerHTML = rows + '<p class="note">' + meta + '</p>' +
        ((rec.warnings || []).length ? '<div class="warnbox" style="margin-top:10px">' + esc(rec.warnings.join(' ')) + '</div>' : '');
    } catch (error) {
      out.innerHTML = renderError(error);
    } finally {
      go.disabled = false;
    }
  });
</script>
</body>
</html>`;
}
