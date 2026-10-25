import type { QlooEntity } from './types.js';

/**
 * Qloo returns a numeric 0–1 affinity per result (`query.affinity`) and sorts
 * the pool by it, so rank and affinity carry the same order.
 *
 * Verdicts are relative to the returned pool on purpose. The absolute affinity
 * band moves a lot with the seed: a mainstream family-film seed came back
 * 0.87–0.92 while a prestige-crime seed spanned 0.90–0.98. A fixed cutoff
 * would therefore label every item of one pool PASS and the other LOVE.
 * Thirds of the pool stay honest at any `take`.
 */
export type Verdict = 'LOVE' | 'MEH' | 'PASS';

export function verdictFor(rank: number, total: number): Verdict {
  if (total <= 0) return 'MEH';
  const third = Math.ceil(total / 3);
  if (rank <= third) return 'LOVE';
  if (rank <= third * 2) return 'MEH';
  return 'PASS';
}

/** The sentence shown on a reveal. Built once so every surface says the same thing. */
export function reasonFor(entity: QlooEntity, total: number): string {
  const head = `#${entity.rank} of ${total} — ${verdictFor(entity.rank, total)}.`;
  const affinity = entity.affinity === undefined ? '' : ` Affinity ${entity.affinity.toFixed(3)}.`;
  const why = entity.why ?? [];
  if (why.length === 0) {
    return `${head}${affinity} Rank order is the evidence.`;
  }
  const contributors = why
    .slice(0, 3)
    .map((item) => `${item.name ?? item.entityId} (${item.score.toFixed(2)})`)
    .join(', ');
  return `${head}${affinity} Ranked here because these profile anchors contribute: ${contributors}.`;
}
