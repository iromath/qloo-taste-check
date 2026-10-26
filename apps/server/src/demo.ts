/**
 * Public landing page. Deliberately a single self-contained document so the
 * demo has no build step and no dependency on Reddit app review. The design
 * tokens and the base layer are inlined for the same reason: the server serves
 * no static files.
 */
export function renderDemoPage(origin: string, ready: boolean): string {
  const endpoint = `${origin}/mcp`;
  const statusLabel = ready ? 'Qloo key loaded' : 'Qloo API key missing';
  const statusClass = ready ? 'ok' : 'warn';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Taste Engine: Qloo’s taste graph as MCP tools</title>
<meta name="description" content="A self-hosted Model Context Protocol server that turns Qloo’s cultural taste graph into agent tools." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" />
<style>
/* Hallmark · shape: 05 Workbench · genre: modern-minimal · theme: Cobalt (deal 2/3, seed self-hosted-mcp-server-turns-5ea5·21067239·2026-10-26·r0) · redesign: full
 * hero: counter · nav: rule-and-keycaps · footer: hairline strip · imagery: the product · signature: the run key as the hero
 * axes: light/grotesk-sans/cool · posture: restrained · surface: absolute · contrast: pass · fold: pass · v2.0.0 */
/* Hallmark · pre-emit critique: P_ H_ E_ S_ R_ V_ · weakest: rhythm, so every section divider is a hairline and the only filled surface is one key */
:root {
  color-scheme: light;
  --space-3xs: 2px; --space-2xs: 4px; --space-xs: 8px; --space-sm: 12px; --space-md: 16px; --space-lg: 24px; --space-xl: 40px; --space-2xl: 64px; --space-3xl: 96px; --space-4xl: 144px;
  --text-xs: 0.8125rem; --text-sm: 0.875rem; --text-md: 1rem; --text-lg: 1.25rem; --text-xl: 1.5625rem; --text-2xl: 1.953rem; --text-3xl: 2.441rem;
  --text-display-s: clamp(2.25rem, 4vw + 0.5rem, 3.75rem); --text-display: clamp(2.75rem, 5vw + 1rem, 5.25rem);
  --text-section: clamp(2rem, 2.5vw + 1rem, 3.5rem); --text-title: clamp(1.25rem, 0.75vw + 0.875rem, 1.625rem); --text-lead: clamp(1.125rem, 0.35vw + 1rem, 1.375rem);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1); --ease-in: cubic-bezier(0.7, 0, 0.84, 0); --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;
  --color-error: oklch(52% 0.19 27); --color-success: oklch(50% 0.12 150);
  --container: 1440px; --gutter: 64px; --gap-columns: 32px; --section-gap-s: 120px; --section-gap: 144px; --section-gap-l: 176px;
  --z-base: 1; --z-raised: 10; --z-dropdown: 100; --z-sticky: 200; --z-sticky-nav: 300; --z-modal: 400; --z-toast: 500; --z-tooltip: 600;
  --color-paper: oklch(98.6% 0.005 250); --color-paper-2: oklch(96.2% 0.008 252); --color-paper-3: oklch(93% 0.011 252);
  --color-ink: oklch(21% 0.028 262); --color-ink-2: oklch(36% 0.022 260); --color-muted: oklch(50% 0.018 258);
  --color-rule: oklch(90% 0.009 252); --color-rule-2: oklch(83% 0.012 252);
  --color-graphite: oklch(21% 0.024 262); --color-graphite-2: oklch(26.5% 0.026 262); --color-graphite-ink: oklch(93% 0.010 250); --color-graphite-muted: oklch(69% 0.022 256);
  --color-accent: oklch(52% 0.19 258); --color-accent-2: oklch(76% 0.13 254); --color-accent-wash: oklch(95% 0.028 256); --color-accent-ink: oklch(98.6% 0.005 250); --color-focus: oklch(52% 0.19 258);
  --color-accent-deep: oklch(43% 0.2 262); --color-accent-edge: oklch(39% 0.16 260);
  --color-glyph-1: oklch(89% 0.025 254); --color-glyph-2: oklch(81% 0.045 255); --color-glyph-3: oklch(70% 0.085 256); --color-glyph-4: oklch(60% 0.13 257);
  --color-graphite-glyph-1: oklch(33% 0.03 262); --color-graphite-glyph-2: oklch(41% 0.05 260); --color-graphite-glyph-3: oklch(53% 0.1 258);
  --color-key-face: oklch(99.4% 0.003 250); --color-key-edge: oklch(80% 0.016 254);
  --font-display: "Familjen Grotesk", system-ui, sans-serif; --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-outlier: "JetBrains Mono", ui-monospace, monospace;
  --radius-card: 8px; --radius-input: 6px; --radius-pill: 999px;
  --cell-w: 8px; --cell-h: 16px; --cut: 8px; --cut-l: 16px;
  --rule-hair: 1px; --shadow-card: 0 1px 2px oklch(21% 0.028 262 / 0.06);
  --shadow-key: 0 3px 0 0 var(--color-key-edge), 0 6px 8px -4px oklch(21% 0.028 262 / 0.28), inset 0 1px 0 oklch(100% 0 0 / 0.9);
  --shadow-key-accent: 0 3px 0 0 var(--color-accent-edge), 0 6px 8px -4px oklch(30% 0.12 260 / 0.45), inset 0 1px 0 oklch(100% 0 0 / 0.22);
  --shadow-key-press: inset 0 1px 2px oklch(21% 0.028 262 / 0.14);
  --tracking-display: -0.028em; --display-weight: 600;
}

*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: clip; }
html { scrollbar-color: var(--color-muted) var(--color-paper); scroll-padding-top: var(--space-3xl); }
body { margin: 0; background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); font-size: var(--text-md); line-height: 1.55; -webkit-font-smoothing: antialiased; caret-color: var(--color-accent); }
::selection { background: color-mix(in oklab, var(--color-accent) 22%, transparent); color: var(--color-ink); }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.16em; }
h1, h2, h3 { margin: 0; font-family: var(--font-display); font-weight: var(--display-weight, 700); font-synthesis: none; letter-spacing: var(--tracking-display); line-height: 1.05; overflow-wrap: break-word; min-width: 0; text-wrap: balance; }
h1 { max-width: 20ch; font-size: var(--text-display); } h2 { max-width: 30ch; font-size: var(--text-section); } h3 { max-width: 40ch; font-size: var(--text-title); line-height: 1.2; }
.lead { font-size: var(--text-lead); line-height: 1.45; max-width: 52ch; }
p { margin: 0; text-wrap: pretty; }
p:not([class]) { max-width: 65ch; }
img, video { max-width: 100%; height: auto; display: block; }
svg { display: block; }
[hidden] { display: none !important; }
button, input, select, textarea { font: inherit; }
.container { width: 100%; max-width: var(--container); margin-inline: auto; padding-inline: var(--gutter); box-sizing: border-box; }
.num, .figure, td.num { font-variant-numeric: tabular-nums; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 60rem) { :root { --gutter: 24px; --section-gap-s: 80px; --section-gap: 96px; --section-gap-l: 120px; } }
@media (max-width: 40rem) { :root { --gutter: 16px; --section-gap-s: 56px; --section-gap: 72px; --section-gap-l: 96px; --gap-columns: 16px; } }
@media (prefers-reduced-motion: reduce) { *:not(.keep-motion), *:not(.keep-motion)::before, *:not(.keep-motion)::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }

/* masthead */
.site { border-bottom: var(--rule-hair) solid var(--color-rule); }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); min-height: var(--space-3xl); }
.wordmark { font-family: var(--font-display); font-weight: 600; font-size: var(--text-lg); letter-spacing: var(--tracking-display); text-decoration: none; }
.status { display: flex; align-items: center; gap: var(--space-xs); font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-muted); }
.status-mark { display: block; width: var(--space-xs); height: var(--space-xs); border-radius: 2px; background: var(--color-success); }
.status-mark.warn { border-radius: var(--radius-pill); background: var(--color-error); }
.status-sep { padding-left: var(--space-md); border-left: var(--rule-hair) solid var(--color-rule-2); }

/* hero */
.hero { padding-block: var(--space-3xl) var(--space-2xl); }
.hero-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); gap: var(--space-2xl) var(--gap-columns); align-items: end; }
.hero h1 { font-size: var(--text-display); }
.hero .lead { margin-top: var(--space-lg); color: var(--color-ink-2); }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-lg); margin-top: var(--space-xl); }
.textlink { font-family: var(--font-display); font-weight: 500; text-decoration-color: var(--color-rule-2); }
.textlink:hover { text-decoration-color: var(--color-accent); }

/* the counter: the counts are the loudest type on the page */
.counter { display: grid; margin: 0; border-top: var(--rule-hair) solid var(--color-rule-2); }
.counter > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md); padding-block: var(--space-sm); border-bottom: var(--rule-hair) solid var(--color-rule-2); }
.counter dt { font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-muted); }
.counter dd { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: var(--text-display-s); line-height: 1; letter-spacing: var(--tracking-display); font-variant-numeric: tabular-nums; }

/* keys */
.key { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs); min-height: var(--space-xl); padding: 0 var(--space-lg); border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-input); background: var(--color-key-face); color: var(--color-ink); font: 500 var(--text-md)/1 var(--font-display); text-decoration: none; cursor: pointer; box-shadow: var(--shadow-key); transition: transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out); }
.key:hover { transform: translateY(-1px); }
.key:active { transform: translateY(3px); box-shadow: var(--shadow-key-press); }
.key:disabled { transform: translateY(3px); background: var(--color-paper-3); color: var(--color-ink-2); border-color: var(--color-rule-2); box-shadow: var(--shadow-key-press); cursor: progress; }
.key--primary { background: var(--color-accent); border-color: var(--color-accent-edge); color: var(--color-accent-ink); box-shadow: var(--shadow-key-accent); }
.key--primary:hover { background: var(--color-accent-deep); }
.key--primary:disabled { background: var(--color-paper-3); color: var(--color-ink-2); border-color: var(--color-rule-2); }

/* bands */
.band { padding-block: var(--section-gap-s) var(--section-gap); border-top: var(--rule-hair) solid var(--color-rule); }
.section-note { margin-top: var(--space-sm); color: var(--color-muted); }

/* the working control */
.panel { margin-top: var(--space-xl); padding: var(--space-xl); background: var(--color-paper-2); border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
@supports (corner-shape: bevel) { .panel { border-radius: var(--cut-l) 4px var(--cut-l) 4px; corner-shape: bevel round bevel round; } }
.fields { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: var(--space-md); }
.field { display: grid; gap: var(--space-xs); }
.field label { font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-ink-2); }
input[type="text"], select { width: 100%; min-height: var(--space-xl); padding: 0 var(--space-sm); border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-input); background: var(--color-key-face); color: var(--color-ink); font: 400 var(--text-md)/1.2 var(--font-body); }
input[type="text"]:focus, select:focus { outline: 2px solid var(--color-focus); outline-offset: 2px; border-color: var(--color-accent); }
.panel-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: var(--rule-hair) solid var(--color-rule); }
.note { color: var(--color-muted); font-size: var(--text-sm); }
.panel-foot .note { max-width: 44ch; }

/* the result, as one figure */
#out { margin-top: var(--space-lg); }
#out:not(:empty) { padding-top: var(--space-lg); border-top: var(--rule-hair) solid var(--color-rule); }
#out .note { margin-top: var(--space-sm); }
.hit { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: var(--space-md); align-items: baseline; padding-block: var(--space-sm); border-bottom: var(--rule-hair) solid var(--color-rule); }
.rank { font: 400 var(--text-sm)/1 var(--font-outlier); color: var(--color-muted); font-variant-numeric: tabular-nums; }
.hit .name { font-family: var(--font-display); font-weight: 500; font-size: var(--text-md); }
.hit .why { margin-top: var(--space-3xs); color: var(--color-muted); font-size: var(--text-sm); }
.verdict { display: inline-flex; align-items: center; gap: var(--space-xs); font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-ink-2); }
.verdict::before { content: ""; display: block; width: var(--space-xs); height: var(--space-xs); border-radius: 2px; background: var(--color-rule-2); }
.v-LOVE::before { background: var(--color-accent); }
.v-PASS::before { border: var(--rule-hair) solid var(--color-rule-2); background: transparent; }
.spinner { display: inline-block; margin-right: var(--space-xs); width: var(--space-sm); height: var(--space-sm); border: 2px solid var(--color-rule-2); border-top-color: var(--color-accent); border-radius: var(--radius-pill); animation: spin calc(var(--dur-long) * 2) linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.warnbox { margin: 0; padding: var(--space-sm) var(--space-md); border: var(--rule-hair) solid color-mix(in oklab, var(--color-error) 38%, var(--color-paper)); border-radius: var(--radius-input); background: color-mix(in oklab, var(--color-error) 7%, var(--color-paper)); color: var(--color-ink); font-size: var(--text-sm); }
.warnbox.stack { margin-top: var(--space-sm); }
.hint { opacity: 0.85; }

/* the table that is the API */
.api { width: 100%; border-collapse: collapse; margin-top: var(--space-lg); }
.api th { padding: var(--space-sm) var(--space-md); text-align: left; font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-muted); border-bottom: var(--rule-hair) solid var(--color-rule-2); }
.api td { padding: var(--space-sm) var(--space-md); vertical-align: top; border-bottom: var(--rule-hair) solid var(--color-rule); }
.api td:first-child { width: 34%; }
.api td:last-child { color: var(--color-ink-2); }
.api code { font: 400 var(--text-sm)/1.5 var(--font-outlier); color: var(--color-ink); }
.api .row-live { background: var(--color-accent-wash); }
.api .row-live code { color: var(--color-accent-deep); }
.api-note { margin-top: var(--space-lg); }

/* connect */
.connect-grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--gap-columns); align-items: start; }
.code-figure { margin: 0; display: grid; gap: var(--space-sm); }
pre { margin: 0; padding: var(--space-lg); overflow-x: auto; border-radius: var(--radius-card); background: var(--color-graphite); color: var(--color-graphite-ink); font: 400 var(--text-sm)/1.6 var(--font-outlier); }
pre code { font: inherit; color: inherit; }
.code-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); }
.code-foot figcaption { font-size: var(--text-sm); color: var(--color-muted); }
.code-foot .key { min-height: var(--space-xl); padding: 0 var(--space-md); font-size: var(--text-sm); }
.section-note code { font: 400 var(--text-sm)/1.5 var(--font-outlier); color: var(--color-ink); }

/* the close */
.close { padding-block: var(--section-gap); background: var(--color-graphite); color: var(--color-graphite-ink); }
.close h2 { max-width: 24ch; color: var(--color-graphite-ink); }
.close p { margin-top: var(--space-md); max-width: 48ch; color: var(--color-graphite-muted); }
.close .key { margin-top: var(--space-xl); }

/* footer */
footer { border-top: var(--rule-hair) solid var(--color-rule); padding-block: var(--space-lg) var(--space-2xl); }
.foot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-md); font-size: var(--text-sm); color: var(--color-muted); }
.foot-links { display: flex; flex-wrap: wrap; gap: var(--space-lg); }
.foot-links a { text-decoration-color: var(--color-rule-2); }
.foot-links a:hover { text-decoration-color: var(--color-accent); }

@media (max-width: 60rem) {
  .hero-grid, .connect-grid { grid-template-columns: minmax(0, 1fr); }
  .counter { margin-top: var(--space-xl); }
}
@media (max-width: 40rem) {
  .masthead { flex-wrap: wrap; gap: var(--space-xs) var(--space-md); }
  .wordmark { white-space: nowrap; }
  .fields { grid-template-columns: minmax(0, 1fr); }
  .panel { padding: var(--space-lg); }
  .hit { grid-template-columns: 32px minmax(0, 1fr); }
  .hit .verdict { grid-column: 2; }
}
</style>
</head>
<body>
<header class="site">
  <div class="container masthead">
    <a class="wordmark" href="#top">Taste Engine</a>
    <p class="status"><span class="status-mark ${statusClass}" aria-hidden="true"></span>${statusLabel}<span class="status-sep">MCP 1.32</span></p>
  </div>
</header>

<main id="top">
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <h1>Qloo’s taste graph, exposed as agent tools.</h1>
        <p class="lead">Resolve names to Qloo IDs, then rank by cultural affinity.</p>
        <div class="hero-actions">
          <a class="key key--primary" href="#taste-check">Run the taste check</a>
          <a class="textlink" href="#connect">Connect an agent</a>
        </div>
      </div>
      <dl class="counter">
        <div><dt>Tools</dt><dd>10</dd></div>
        <div><dt>Reference resources</dt><dd>3</dd></div>
        <div><dt>Prompts</dt><dd>2</dd></div>
      </dl>
    </div>
  </section>

  <section id="taste-check" class="band">
    <div class="container">
      <h2>Live taste check</h2>
      <p class="section-note">Two real calls: free text becomes Qloo entity IDs, then those IDs seed a ranked recommendation.</p>
      <div class="panel">
        <div class="fields">
          <div class="field">
            <label for="likes">Three things you like</label>
            <input id="likes" type="text" value="Blade Runner 2049, Aphex Twin, Tokyo" spellcheck="false" />
          </div>
          <div class="field">
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
        <div class="panel-foot">
          <button class="key key--primary" id="go">Run taste check</button>
          <p class="note">Verdicts are relative rank thirds. Every hit also carries an affinity from 0 to 1.</p>
        </div>
        <div id="out" aria-live="polite"></div>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="container">
      <h2>Ten tools</h2>
      <p class="section-note">Every tool returns <code>hits</code>, <code>warnings</code>, <code>cache</code> and <code>latency_ms</code>. Raw Qloo payloads never leak.</p>
      <table class="api">
        <thead><tr><th scope="col">Tool</th><th scope="col">What it does</th></tr></thead>
        <tbody>
          <tr><td><code>qloo_search_entities</code></td><td>Name to Qloo entity IDs, with type, location and radius filters.</td></tr>
          <tr><td><code>qloo_search_tags</code></td><td>Concept to Qloo tag IDs. Tag names are not tag IDs.</td></tr>
          <tr><td><code>qloo_get_entities</code></td><td>Entity IDs to names and tags. Re-hydrate IDs you already hold.</td></tr>
          <tr><td><code>qloo_search_audiences</code></td><td>Description to audience UUIDs, usable as a demographic signal.</td></tr>
          <tr><td><code>qloo_list_types</code></td><td>The tag and audience taxonomy behind every type filter.</td></tr>
          <tr class="row-live"><td><code>qloo_recommend</code></td><td>Ranked recommendations from seeded IDs, with optional tags and explainability.</td></tr>
          <tr><td><code>qloo_compare_tastes</code></td><td>Two profiles, one entity type: where tastes converge and diverge.</td></tr>
          <tr><td><code>qloo_trending</code></td><td>Popularity trend for an entity type over a date window.</td></tr>
          <tr><td><code>qloo_build_taste_profile</code></td><td>Free text in, anchors and tags out, ready to seed anything else.</td></tr>
          <tr><td><code>qloo_explain</code></td><td>Why a candidate ranked where it did, citing contributor scores.</td></tr>
        </tbody>
      </table>
      <p class="section-note api-note"><a class="textlink" href="/api/capabilities">The full capability list</a></p>
    </div>
  </section>

  <section id="connect" class="band">
    <div class="container connect-grid">
      <div>
        <h2>Connect an agent</h2>
        <p class="section-note">Streamable HTTP, stateless. Point any MCP client at the endpoint.</p>
        <p class="section-note">The same operations are mirrored over REST: <code>/api/profile</code>, <code>/api/recommend</code>, <code>/api/compare</code>, <code>/api/trending</code>, <code>/api/explain</code>.</p>
      </div>
      <figure class="code-figure">
        <pre>{
  "mcpServers": {
    "taste-engine": {
      "type": "http",
      "url": "${endpoint}"
    }
  }
}</pre>
        <div class="code-foot">
          <figcaption>One endpoint, no key needed.</figcaption>
          <button class="key" id="copy" type="button">Copy</button>
        </div>
      </figure>
    </div>
  </section>

  <section class="close">
    <div class="container">
      <h2>Start with one call.</h2>
      <p>The taste check above runs both calls against the live Qloo API.</p>
      <a class="key key--primary" href="#taste-check">Run the taste check</a>
    </div>
  </section>
</main>

<footer>
  <div class="container foot">
    <span>Taste Engine. Built for the Qloo Agentic Hackathon. MIT licensed.</span>
    <div class="foot-links">
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="https://qloo.com" target="_blank" rel="noreferrer">Qloo</a>
      <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">MCP</a>
    </div>
  </div>
</footer>

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

  // Qloo returns influence as per-seed shares of a top-N bucket, keyed by entity
  // ID. Resolve them against the profile hits so the page can name the seeds.
  function renderInfluence(influences, names) {
    const groups = influences || {};
    const keys = Object.keys(groups).filter((key) => Array.isArray(groups[key]) && groups[key].length);
    if (!keys.length) return '';
    const key = keys.find((k) => /[.]top3$/.test(k)) || keys[0];
    const slice = /[.](top[0-9]+|all)$/.exec(key);
    const label = slice ? slice[1].replace(/^top([0-9]+)$/, 'top $1') : 'results';
    const parts = groups[key].slice(0, 4).map((item) =>
      esc(names[item.entityId] || item.entityId) + ' ' + Math.round(Number(item.score) * 100) + '%'
    );
    return '<p class="note">Seed influence on the ' + esc(label) + ': ' + parts.join(', ') + '</p>';
  }

  function renderError(payload) {
    const err = (payload && payload.error) || {};
    return '<div class="warnbox"><strong>' + esc(err.kind || 'error') + '</strong>. ' + esc(err.message || 'Request failed') +
      (err.hint ? '<br /><span class="hint">' + esc(err.hint) + '</span>' : '') + '</div>';
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

    out.innerHTML = '<p class="note"><span class="spinner" aria-hidden="true"></span>Resolving your tastes…</p>';
    go.disabled = true;

    try {
      const profile = await getJson('/api/profile', { likes: likes });
      const anchors = (profile.profile && profile.profile.anchors) || [];
      const names = {};
      (profile.hits || []).forEach((hit) => { if (hit && hit.id) names[hit.id] = hit.name || hit.id; });
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
        const label = verdict.charAt(0) + verdict.slice(1).toLowerCase();
        return '<div class="hit"><div class="rank">#' + hit.rank + '</div>' +
          '<div><div class="name">' + esc(hit.name || hit.id) + '</div><div class="why">' + why + '</div></div>' +
          '<div class="verdict v-' + verdict + '">' + label + '</div></div>';
      }).join('');

      const meta = 'cache ' + esc(rec.cache) + ', ' + esc(rec.latency_ms) + ' ms, ' + anchors.length + ' anchors';
      // The aggregate-bucket warning tells an MCP agent to read the influences
      // field; the page renders those shares, so it would only read as noise here.
      const warnings = (rec.warnings || []).filter((w) => !/aggregate influence/i.test(w));
      out.innerHTML = rows + renderInfluence(rec.influences, names) + '<p class="note">' + meta + '</p>' +
        (warnings.length ? '<div class="warnbox stack">' + esc(warnings.join(' ')) + '</div>' : '');
    } catch (error) {
      out.innerHTML = renderError(error);
    } finally {
      go.disabled = false;
    }
  });

  const copy = document.getElementById('copy');
  const config = document.querySelector('.code-figure pre');
  copy.addEventListener('click', async () => {
    const text = config ? config.textContent : '';
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    const label = copy.textContent;
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = label; }, 1600);
  });
</script>
</body>
</html>`;
}
