/**
 * Renders TERMS.md and PRIVACY.md as pages on the demo origin.
 *
 * Reddit's app submission asks for public Terms and Privacy URLs, so they have
 * to live somewhere stable. The markdown in the repo root is the source of
 * truth: this module only converts it, it does not restate it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readDoc(name: string): string | null {
  for (const path of [resolve(process.cwd(), name), resolve(here, '../../..', name)]) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      // Try the next location.
    }
  }
  return null;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Inline formatting for text that has already been escaped. */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderTable(rows: string[]): string {
  const cells = (row: string) =>
    row
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const head = cells(rows[0] ?? '');
  const body = rows.slice(1).filter((row) => !/^\s*\|[\s|:-]+\|?\s*$/.test(row));

  const thead = `<thead><tr>${head.map((cell) => `<th>${inline(esc(cell))}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(esc(cell))}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${inline(esc(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    out.push(`<ul>${list.map((item) => `<li>${inline(esc(item))}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trimEnd();

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = (heading[1] ?? '#').length;
      out.push(`<h${level}>${inline(esc(heading[2] ?? ''))}</h${level}>`);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flushAll();
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) {
        rows.push(lines[i] ?? '');
        i += 1;
      }
      i -= 1;
      out.push(renderTable(rows));
      continue;
    }

    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push(item[1] ?? '');
      continue;
    }

    // An indented line under a bullet is that bullet still wrapping.
    const last = list.length - 1;
    if (last >= 0 && /^\s{2,}\S/.test(line)) {
      list[last] = `${list[last] ?? ''} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return out.join('\n');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Taste Engine</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" />
<style>
/* Hallmark · shape: 05 Workbench · genre: modern-minimal · theme: Cobalt · surface: legal document
 * A quiet sibling of the landing page: hairline masthead, one column of prose, no keys. */
:root {
  color-scheme: light;
  --space-3xs: 2px; --space-2xs: 4px; --space-xs: 8px; --space-sm: 12px; --space-md: 16px; --space-lg: 24px; --space-xl: 40px; --space-2xl: 64px; --space-3xl: 96px;
  --text-sm: 0.875rem; --text-md: 1rem; --text-lg: 1.25rem; --text-xl: 1.5625rem; --text-display-s: clamp(2.25rem, 4vw + 0.5rem, 3.75rem);
  --color-paper: oklch(98.6% 0.005 250);
  --color-ink: oklch(21% 0.028 262); --color-ink-2: oklch(36% 0.022 260); --color-muted: oklch(50% 0.018 258);
  --color-rule: oklch(90% 0.009 252); --color-rule-2: oklch(83% 0.012 252);
  --color-accent: oklch(52% 0.19 258); --color-accent-deep: oklch(43% 0.2 262);
  --color-key-face: oklch(99.4% 0.003 250);
  --font-display: "Familjen Grotesk", system-ui, sans-serif; --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-outlier: "JetBrains Mono", ui-monospace, monospace;
  --radius-input: 6px; --rule-hair: 1px; --gutter: 64px;
  --tracking-display: -0.028em;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { overflow-x: clip; }
body { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); font-size: var(--text-md); line-height: 1.6; -webkit-font-smoothing: antialiased; }
::selection { background: color-mix(in oklab, var(--color-accent) 22%, transparent); }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.16em; text-decoration-color: var(--color-rule-2); }
a:hover { text-decoration-color: var(--color-accent); }
h1, h2, h3 { margin: 0; font-family: var(--font-display); font-weight: 600; font-synthesis: none; letter-spacing: var(--tracking-display); line-height: 1.1; text-wrap: balance; }
.container { width: 100%; max-width: 72rem; margin-inline: auto; padding-inline: var(--gutter); }

.site { border-bottom: var(--rule-hair) solid var(--color-rule); }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); min-height: var(--space-3xl); }
.wordmark { font-family: var(--font-display); font-weight: 600; font-size: var(--text-lg); letter-spacing: var(--tracking-display); text-decoration: none; }
.back { font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); color: var(--color-muted); }

.doc { max-width: 44rem; padding-block: var(--space-2xl) var(--space-3xl); }
.doc h1 { font-size: var(--text-display-s); max-width: 20ch; }
.doc h2 { margin-top: var(--space-xl); padding-top: var(--space-md); border-top: var(--rule-hair) solid var(--color-rule); font-size: var(--text-xl); }
.doc h3 { margin-top: var(--space-lg); font-size: var(--text-lg); }
.doc p { margin: 0 0 var(--space-sm); color: var(--color-ink-2); max-width: 66ch; }
.doc h1 + p { margin-top: var(--space-lg); color: var(--color-ink-2); font-size: var(--text-lg); line-height: 1.45; max-width: 52ch; }
.doc ul { margin: 0 0 var(--space-md); padding-left: var(--space-lg); color: var(--color-ink-2); }
.doc li { margin-bottom: var(--space-2xs); }
.doc li::marker { color: var(--color-rule-2); }
.doc code { font: 400 var(--text-sm)/1.4 var(--font-outlier); background: var(--color-key-face); border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-input); padding: 1px 5px; color: var(--color-ink); }
.doc table { width: 100%; border-collapse: collapse; margin: var(--space-sm) 0 var(--space-lg); font-size: var(--text-sm); }
.doc th { padding: var(--space-xs) var(--space-sm); text-align: left; font-family: var(--font-display); font-weight: 500; color: var(--color-muted); border-bottom: var(--rule-hair) solid var(--color-rule-2); }
.doc td { padding: var(--space-xs) var(--space-sm); vertical-align: top; color: var(--color-ink-2); border-bottom: var(--rule-hair) solid var(--color-rule); }
.doc td:first-child { white-space: nowrap; }

footer { border-top: var(--rule-hair) solid var(--color-rule); padding-block: var(--space-lg) var(--space-2xl); }
.foot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-md); font-size: var(--text-sm); color: var(--color-muted); }
.foot-links { display: flex; flex-wrap: wrap; gap: var(--space-lg); }
.foot-links a { text-decoration-color: var(--color-rule-2); }
.foot-links a:hover { text-decoration-color: var(--color-accent); }

@media (max-width: 40rem) { :root { --gutter: 16px; } .doc { padding-block: var(--space-xl) var(--space-2xl); } }
</style>
</head>
<body>
<header class="site">
  <div class="container masthead">
    <a class="wordmark" href="/">Taste Engine</a>
    <a class="back" href="/">Back to the demo</a>
  </div>
</header>
<main class="container">
  <article class="doc">
  ${body}
  </article>
</main>
<footer>
  <div class="container foot">
    <span>Taste Engine. Built for the Qloo Agentic Hackathon. MIT licensed.</span>
    <span class="foot-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
  </div>
</footer>
</body>
</html>`;
}

/** Returns an HTML page, or null when the markdown file is not on disk. */
export function renderLegalPage(name: 'TERMS.md' | 'PRIVACY.md'): string | null {
  const md = readDoc(name);
  if (md === null) return null;
  const title = name === 'TERMS.md' ? 'Terms of Use' : 'Privacy Policy';
  return page(title, renderMarkdown(md));
}
