# Design: Taste Check

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System

- Genre: modern-minimal
- Shapes: public page — 05 Workbench (hero, then a live bench, then a ledger of tools); Reddit webviews — app screens (masthead, one job, hairline lists)
- Theme: Cobalt (`themes/cobalt.md`)
- Axes: light 98.5 250 / grotesk-sans Familjen Grotesk / cool 256 · posture: restrained
- Surfaces: `apps/server/src/demo.ts` (public page) and `apps/devvit/public/{index,game,foryou,dashboard}.html` + `styles.css` (webviews)

## Tokens

`tokens.css` is the source of truth; `base.css` carries the reset and the shared primitives. The roles:

```css
:root {
  --color-paper: oklch(98.6% 0.005 250);  --color-paper-2: oklch(96.2% 0.008 252);  --color-paper-3: oklch(93% 0.011 252);
  --color-ink: oklch(21% 0.028 262);  --color-ink-2: oklch(36% 0.022 260);  --color-muted: oklch(50% 0.018 258);  --color-rule: oklch(90% 0.009 252);  --color-rule-2: oklch(83% 0.012 252);
  --color-accent: oklch(52% 0.19 258);  --color-accent-ink: oklch(98.6% 0.005 250);  --color-focus: oklch(52% 0.19 258);
  --font-display: "Familjen Grotesk", system-ui, sans-serif;  --font-body: "IBM Plex Sans", system-ui, sans-serif;  --font-outlier: "JetBrains Mono", ui-monospace, monospace;
  --cut: 8px;  --rule-hair: 1px;  --shadow-card: 0 1px 2px oklch(21% 0.028 262 / 0.06);
}
```

The spacing scale, the type scale (`--text-xs` … `--text-2xl`, `--text-display`), the easings (`--ease-out`) and the durations (`--dur-micro: 120ms`) are the scaffold's and live in `tokens.css`.

## Controls

- Primary: cobalt fill `--color-accent` · `--space-2xs` radius · 40px tall · 3px `--color-accent-edge` bottom edge · hover lifts 1px, press travels 3px
- Secondary: key face `--color-key-face`, 1px `--color-rule-2` border, same radius, height and edge
- Picks (webviews): the same keycap at `--text-xs`, 8px status square in the accent when LOVE
- Panels: `--color-key-face` on 1px `--color-rule`, cut on two opposite corners (`--cut` / `--space-2xs`, `corner-shape: bevel` where supported), `--shadow-card` only
- Status is text with one square mark, never a filled chip; cobalt stays under 5% of the page outside the bench

## Motion

- Character: severe — `translate` on keycaps only, `--dur-micro`; one reveal at most (the results block); under reduced motion everything ends at once

## Variants

- Webview (compact): a trimmed subset of the tokens inlined in `apps/devvit/public/styles.css`, 720px wrap, no ASCII field, KPIs two-up below 30rem. Class names there are a contract with `game.js`, `foryou.js` and `dashboard.js` — restyle without renaming.

## Exports

`tokens.css` and `base.css` in this project; `apps/devvit/public/styles.css` is the webview subset. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
