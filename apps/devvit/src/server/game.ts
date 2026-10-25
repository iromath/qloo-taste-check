import { context, reddit, redis } from '@devvit/web/server';
import {
  normalizeEntities,
  QlooError,
  reasonFor,
  verdictFor,
  type QlooClient,
  type QlooEntity,
  type InsightsType,
  type Verdict,
} from '@taste/qloo';
import { qloo } from './qloo.js';

/** Rank this deep so verdicts come from a real distribution, not a top-6 echo. */
const POOL_SIZE = 24;
const PICKS = 6;
const MAX_ANCHORS = 8;
const VERDICTS: Verdict[] = ['LOVE', 'MEH', 'PASS'];

/**
 * /v2/insights rejects `urn:entity:video_game` with HTTP 400, so it is absent
 * here even though /search resolves games.
 */
const ROUND_TYPES: InsightsType[] = [
  'urn:entity:movie',
  'urn:entity:tv_show',
  'urn:entity:artist',
  'urn:entity:book',
];

export type Candidate = {
  id: string;
  name: string;
  type: string;
  subtitle?: string;
  /** Never sent to the client before the round is graded. */
  verdict: Verdict;
  rank: number;
  /** Qloo's own 0–1 score for this hit. */
  affinity?: number;
  reason: string;
};

export type StoredRound = {
  id: string;
  title: string;
  theme: string;
  type: string;
  poolSize: number;
  anchors: { id: string; name: string }[];
  candidates: Candidate[];
  postId?: string;
  createdAt: number;
};

export type PublicRound = {
  id: string;
  title: string;
  theme: string;
  type: string;
  createdAt: number;
  candidates: { id: string; name: string; type: string; subtitle?: string }[];
};

export type GradedAnswer = {
  candidateId: string;
  guess: Verdict;
  verdict: Verdict;
  correct: boolean;
  rank: number;
  total: number;
  affinity?: number;
  reason: string;
};

export type GradedRound = {
  roundId: string;
  score: number;
  total: number;
  duplicate: boolean;
  answers: GradedAnswer[];
};

const roundKey = (id: string) => `round:${id}`;
const doneKey = (id: string) => `round:${id}:done`;

/* ------------------------------------------------------------------ */
/* Round construction                                                  */
/* ------------------------------------------------------------------ */

export async function buildRound(options: { theme?: string } = {}): Promise<StoredRound> {
  const client = await qloo();
  const subredditName = context.subredditName;
  const theme = options.theme?.trim() ?? '';

  const queries = await seedQueries(subredditName, theme);
  console.log(`[taste-check] seeds for r/${subredditName}: ${JSON.stringify(queries)}`);
  const anchors = await resolveAnchors(client, queries);
  if (anchors.length === 0) {
    throw new Error(
      `Nothing in r/${subredditName} resolved to a Qloo entity. Add a theme (a film, artist or place) and try again.`,
    );
  }

  const day = dayKey();
  const type: InsightsType = ROUND_TYPES[seedFrom(day) % ROUND_TYPES.length] ?? 'urn:entity:movie';

  const { data } = await client.insights({
    type,
    entities: anchors.map((anchor) => anchor.id),
    take: POOL_SIZE,
    explainability: true,
  });
  const { items } = normalizeEntities(data, { explainability: true });
  if (items.length < PICKS) {
    throw new Error(`Qloo returned ${items.length} candidates; a round needs ${PICKS}.`);
  }

  const id = `${day}-${randomSuffix()}`;
  const rng = mulberry32(seedFrom(id));
  const picked = pickAcrossBands(items, PICKS, rng);

  const candidates = picked.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    ...(entity.subtype ? { subtitle: entity.subtype } : {}),
    verdict: verdictFor(entity.rank, items.length),
    rank: entity.rank,
    ...(entity.affinity === undefined ? {} : { affinity: entity.affinity }),
    reason: reasonFor(entity, items.length),
  }));
  shuffle(candidates, rng);

  return {
    id,
    title: theme ? `Taste Check: ${theme}` : `Taste Check — ${subredditName}`,
    theme,
    type,
    poolSize: items.length,
    anchors,
    candidates,
    createdAt: Date.now(),
  };
}

/** Persist a round, point the game at it, and optionally post it. */
export async function startRound(options: { theme?: string; submit?: boolean } = {}): Promise<StoredRound> {
  const round = await buildRound(options);
  await saveRound(round);
  await redis.set('round:current', round.id);
  await redis.incrBy('stats:rounds', 1);

  const names: Record<string, string> = {};
  for (const candidate of round.candidates) {
    names[candidate.id] = candidate.name;
    await redis.hIncrBy('stats:shown', candidate.id, 1);
  }
  await redis.hSet('stats:names', names);

  if (options.submit) {
    const post = await reddit.submitCustomPost({
      subredditName: context.subredditName,
      title: round.title,
      entry: 'game',
      postData: { roundId: round.id },
      textFallback: {
        text: `**Taste Check.** Predict whether the taste engine says LOVE, MEH or PASS for: ${round.candidates
          .map((candidate) => candidate.name)
          .join(', ')}.`,
      },
      userGeneratedContent: { text: 'Taste Check round built from this community’s recent posts.' },
    });
    round.postId = post.id;
    await saveRound(round);
  }

  return round;
}

async function saveRound(round: StoredRound): Promise<void> {
  await redis.set(roundKey(round.id), JSON.stringify(round));
}

export async function loadRound(id: string): Promise<StoredRound | null> {
  const raw = await redis.get(roundKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredRound;
  } catch {
    return null;
  }
}

export async function currentRound(): Promise<StoredRound | null> {
  const id = await redis.get('round:current');
  return id ? loadRound(id) : null;
}

export function toPublic(round: StoredRound): PublicRound {
  return {
    id: round.id,
    title: round.title,
    theme: round.theme,
    type: round.type,
    createdAt: round.createdAt,
    candidates: round.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      ...(candidate.subtitle ? { subtitle: candidate.subtitle } : {}),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

export async function gradeRound(
  round: StoredRound,
  player: string,
  guesses: Record<string, Verdict>,
): Promise<GradedRound> {
  const existing = await redis.hGet(doneKey(round.id), player);
  if (existing !== undefined) {
    return { roundId: round.id, score: Number(existing), total: round.candidates.length, duplicate: true, answers: [] };
  }

  const answers: GradedAnswer[] = round.candidates.map((candidate) => {
    const guess = guesses[candidate.id] ?? 'MEH';
    return {
      candidateId: candidate.id,
      guess,
      verdict: candidate.verdict,
      correct: guess === candidate.verdict,
      rank: candidate.rank,
      total: round.poolSize,
      ...(candidate.affinity === undefined ? {} : { affinity: candidate.affinity }),
      reason: candidate.reason,
    };
  });

  const score = answers.filter((answer) => answer.correct).length;

  await redis.hSet(doneKey(round.id), { [player]: String(score) });
  await redis.zIncrBy('leaderboard', player, score);
  await redis.zIncrBy('leaderboard:rounds', player, 1);
  await redis.incrBy('stats:votes', answers.length);
  await redis.incrBy('stats:correct', score);

  for (const answer of answers) {
    await redis.hIncrBy('stats:guessed', `${answer.verdict}:${answer.candidateId}`, 1);
    if (!answer.correct) {
      await redis.hIncrBy('stats:misses', answer.candidateId, 1);
    }
  }

  return { roundId: round.id, score, total: round.candidates.length, duplicate: false, answers };
}

export async function hasPlayed(roundId: string, player: string): Promise<number | null> {
  const raw = await redis.hGet(doneKey(roundId), player);
  return raw === undefined ? null : Number(raw);
}

/* ------------------------------------------------------------------ */
/* Leaderboard + dashboard                                             */
/* ------------------------------------------------------------------ */

export type LeaderboardRow = { player: string; score: number; rounds: number };

export async function leaderboard(player: string | undefined, take = 10): Promise<{ top: LeaderboardRow[]; you: LeaderboardRow | null }> {
  const rows = await redis.zRange('leaderboard', 0, take - 1, { reverse: true, by: 'score' });
  const rounds = await Promise.all(rows.map((row) => redis.zScore('leaderboard:rounds', row.member)));

  const top = rows.map((row, index) => ({
    player: row.member,
    score: row.score,
    rounds: rounds[index] ?? 0,
  }));

  if (!player) return { top, you: null };

  const score = (await redis.zScore('leaderboard', player)) ?? 0;
  const played = (await redis.zScore('leaderboard:rounds', player)) ?? 0;
  return { top, you: { player, score, rounds: played } };
}

export type Dashboard = {
  rounds: number;
  votes: number;
  correct: number;
  accuracy: number;
  players: number;
  verdictMix: { verdict: Verdict; count: number }[];
  hardest: { id: string; name: string; misses: number; shown: number }[];
  leaderboard: LeaderboardRow[];
};

export async function dashboard(): Promise<Dashboard> {
  const [rounds, votes, correct, verdicts, misses, shown, names, players] = await Promise.all([
    redis.get('stats:rounds'),
    redis.get('stats:votes'),
    redis.get('stats:correct'),
    redis.hGetAll('stats:guessed'),
    redis.hGetAll('stats:misses'),
    redis.hGetAll('stats:shown'),
    redis.hGetAll('stats:names'),
    redis.zCard('leaderboard'),
  ]);

  const totalVotes = Number(votes ?? 0);
  const totalCorrect = Number(correct ?? 0);

  const mix = VERDICTS.map((verdict) => {
    const count = Object.entries(verdicts)
      .filter(([field]) => field.startsWith(`${verdict}:`))
      .reduce((sum, [, value]) => sum + Number(value), 0);
    return { verdict, count };
  });

  const hardest = Object.entries(misses)
    .map(([id, value]) => ({
      id,
      name: names[id] ?? id,
      misses: Number(value),
      shown: Number(shown[id] ?? 0),
    }))
    .sort((a, b) => b.misses - a.misses)
    .slice(0, 5);

  return {
    rounds: Number(rounds ?? 0),
    votes: totalVotes,
    correct: totalCorrect,
    accuracy: totalVotes === 0 ? 0 : totalCorrect / totalVotes,
    players,
    verdictMix: mix,
    hardest,
    leaderboard: (await leaderboard(undefined, 5)).top,
  };
}

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

/**
 * A community that was just created has no posts, so there is nothing to read a
 * taste from. These seeds let the very first round exist; every later round is
 * driven by the community's own posts.
 */
const COLD_START_SEEDS = ['Dune', 'Radiohead', 'Tokyo'];

async function seedQueries(subredditName: string, theme: string): Promise<string[]> {
  const queries: string[] = [];
  if (theme) queries.push(theme);

  try {
    const posts = await reddit.getTopPosts({ subredditName, timeframe: 'week', limit: 15 }).all();
    for (const post of posts) {
      const cleaned = cleanTitle(post.title);
      if (cleaned.length >= 4 && !queries.includes(cleaned)) queries.push(cleaned);
    }
  } catch {
    // Brand-new or restricted communities have no hot posts yet; the theme is the seed.
  }

  if (queries.length === 0) queries.push(...COLD_START_SEEDS);
  return queries;
}

async function resolveAnchors(client: QlooClient, queries: string[]): Promise<{ id: string; name: string }[]> {
  const anchors: { id: string; name: string }[] = [];
  let unreachable: QlooError | undefined;

  for (const query of queries) {
    if (anchors.length >= MAX_ANCHORS) break;
    try {
      const { data } = await client.search({ query, take: 3, sortBy: 'match' });
      const top = normalizeEntities(data).items[0];
      if (top && !anchors.some((anchor) => anchor.id === top.id)) {
        anchors.push({ id: top.id, name: top.name });
      }
    } catch (error) {
      // One unresolvable title must not sink the whole round.
      console.error(`[taste-check] seed "${query}" did not resolve`, error);
      if (error instanceof QlooError && ['network', 'timeout', 'auth', 'config'].includes(error.kind)) {
        unreachable ??= error;
      }
    }
  }

  // Every seed failed for the same transport reason, so "add a theme" would be
  // the wrong advice: the real cause has to reach the caller.
  if (anchors.length === 0 && unreachable) throw unreachable;
  return anchors;
}

/**
 * Two picks per verdict band would make every round a fixed 2/2/2, so the
 * split is random instead — every band still contributes at least one.
 */
function pickAcrossBands(items: QlooEntity[], count: number, rng: () => number): QlooEntity[] {
  const third = Math.ceil(items.length / 3);
  const bands = [items.slice(0, third), items.slice(third, third * 2), items.slice(third * 2)];
  const counts = new Array(bands.length).fill(1) as number[];

  for (let left = count - bands.length; left > 0; left -= 1) {
    const slot = Math.floor(rng() * bands.length);
    counts[slot] = (counts[slot] ?? 0) + 1;
  }

  const taken = new Set<string>();
  const picked: QlooEntity[] = [];

  bands.forEach((band, index) => {
    const available = band.filter((item) => !taken.has(item.id));
    for (let i = 0; i < (counts[index] ?? 0) && available.length > 0; i += 1) {
      const [item] = available.splice(Math.floor(rng() * available.length), 1);
      if (!item) break;
      taken.add(item.id);
      picked.push(item);
    }
  });

  // Thin bands (a small pool) get topped up from whatever is left.
  for (const item of items) {
    if (picked.length >= count) break;
    if (!taken.has(item.id)) {
      taken.add(item.id);
      picked.push(item);
    }
  }

  return picked.slice(0, count);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function cleanTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[|•—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items: Candidate[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const current = items[i];
    const other = items[j];
    if (current && other) {
      items[i] = other;
      items[j] = current;
    }
  }
}
