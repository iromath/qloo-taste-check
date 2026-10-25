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
<style>
  :root {
    --ink: #0d0c0f; --line: #2b2733; --text: #ece8f2; --muted: #9c94ab;
    --accent: #c084fc; --accent-2: #f0abfc;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background:
      radial-gradient(900px 500px at 15% -10%, rgba(192,132,252,.16), transparent 60%),
      var(--ink);
    color: var(--text); font-family: var(--font); line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent-2); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 24px 80px; }
  header.site {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 22px 0; border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 650; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
  .back { font: 500 12px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: clamp(30px, 5vw, 42px); line-height: 1.1; letter-spacing: -.03em; margin: 48px 0 8px; }
  h2 { font-size: 20px; letter-spacing: -.01em; margin: 38px 0 10px; }
  h3 { font-size: 16px; margin: 26px 0 8px; }
  p { color: var(--muted); margin: 0 0 14px; }
  ul { color: var(--muted); margin: 0 0 16px; padding-left: 22px; }
  li { margin-bottom: 6px; }
  code { font: 500 12px/1.4 var(--mono); background: #1d1a22; border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 20px; font-size: 14px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font: 600 11px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  td { color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <span class="brand"><span class="dot"></span>Taste Engine</span>
    <a class="back" href="/">Back to the demo</a>
  </header>
  ${body}
</div>
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
