import { context, reddit, redis } from '@devvit/web/server';
import {
  INSIGHTS_TYPES,
  normalizeEntities,
  type InsightsType,
  type QlooClient,
  type QlooEntity,
} from '@taste/qloo';
import { cleanTitle, type StoredRound } from './game.js';
import { qloo } from './qloo.js';

/** Enough loved entities to describe a taste without turning the seed list into noise. */
const MAX_SEEDS = 8;
/** Hot posts are read once per view; every title costs one /search call. */
const POST_LIMIT = 30;
const SEARCH_CONCURRENCY = 5;
/** Deep enough that a post's entity is usually inside the user's neighbourhood. */
const POOL = 50;
const MAX_PICKS = 10;

export type TasteVerdict = 'LOVE' | 'PASS';

type StoredVote = {
  name: string;
  /** Entity subtype, e.g. `urn:entity:movie`. */
  type: string;
  verdict: TasteVerdict;
  at: number;
};

type TasteVote = StoredVote & { id: string };

export type TastePick = {
  postId: string;
  title: string;
  permalink: string;
  author: string;
  /** 0–1 position in the user's taste neighbourhood. */
  score: number;
  entity: { id: string; name: string; subtype: string };
  affinity?: number;
  /** Which of the user's own likes pulled this result in. */
  why: { name: string; score: number }[];
};

export type ForYou = {
  /** `you` once the player has voted; `community` is the cold-start fallback. */
  source: 'you' | 'community';
  profile: { loved: number; passed: number };
  seeds: { id: string; name: string; type?: string }[];
  scanned: number;
  matched: number;
  picks: TastePick[];
};

const tasteKey = (player: string) => `taste:${player}`;
const FOR_YOU_POST_KEY = 'post:for-you';

/* ------------------------------------------------------------------ */
/* Per-user taste store                                                */
/* ------------------------------------------------------------------ */

/**
 * The game grades guesses, which say nothing about the player's own taste, so
 * the reveal view also offers LOVE / PASS. Only those explicit taps land here.
 */
export async function recordVotes(
  round: StoredRound,
  player: string,
  votes: { id: string; verdict: TasteVerdict }[],
): Promise<void> {
  const fields: Record<string, string> = {};
  for (const vote of votes) {
    const candidate = round.candidates.find((item) => item.id === vote.id);
    if (!candidate) continue;
    const stored: StoredVote = {
      name: candidate.name,
      // `Candidate.type` is always `urn:entity`; the subtype lives in `subtitle`.
      type: candidate.subtitle ?? candidate.type,
      verdict: vote.verdict,
      at: Date.now(),
    };
    fields[vote.id] = JSON.stringify(stored);
  }
  if (Object.keys(fields).length > 0) {
    await redis.hSet(tasteKey(player), fields);
  }
}

export async function readTaste(player: string): Promise<TasteVote[]> {
  const raw = await redis.hGetAll(tasteKey(player));
  const votes: TasteVote[] = [];
  for (const [id, value] of Object.entries(raw)) {
    try {
      const vote = JSON.parse(value) as StoredVote;
      votes.push({ id, ...vote });
    } catch {
      // A malformed row must not break the whole profile.
    }
  }
  return votes.sort((a, b) => b.at - a.at);
}

export async function clearTaste(player: string): Promise<void> {
  await redis.del(tasteKey(player));
}

/* ------------------------------------------------------------------ */
/* For You                                                             */
/* ------------------------------------------------------------------ */

export async function buildForYou(player: string): Promise<ForYou> {
  const votes = await readTaste(player);
  const loved = votes.filter((vote) => vote.verdict === 'LOVE');
  const profile = {
    loved: loved.length,
    passed: votes.filter((vote) => vote.verdict === 'PASS').length,
  };

  // A cold-start community has no personal votes yet; the round's own anchors
  // still describe what the subreddit likes, so the page is not empty.
  const round = loved.length === 0 ? await currentRoundOrNull() : null;
  const seeds: ForYou['seeds'] =
    loved.length > 0
      ? loved.map((vote) => ({ id: vote.id, name: vote.name, type: vote.type })).slice(0, MAX_SEEDS)
      : (round?.anchors ?? []).slice(0, MAX_SEEDS);
  const source: ForYou['source'] = loved.length > 0 ? 'you' : 'community';

  const empty: ForYou = { source, profile, seeds, scanned: 0, matched: 0, picks: [] };
  if (seeds.length === 0) return empty;

  const posts = await reddit.getHotPosts({ subredditName: context.subredditName, limit: POST_LIMIT }).all();
  const resolved = await resolvePosts(await qloo(), posts);

  if (resolved.length === 0) return { ...empty, scanned: posts.length };

  // One /v2/insights call per entity family keeps this at a handful of calls
  // instead of one per post.
  const groups = new Map<string, ResolvedPost[]>();
  for (const item of resolved) {
    const group = groups.get(item.entity.subtype) ?? [];
    group.push(item);
    groups.set(item.entity.subtype, group);
  }

  const seedNames = new Map(seeds.map((seed) => [seed.id, seed.name]));
  const picks: TastePick[] = [];

  for (const [subtype, group] of groups) {
    // Qloo rejects some cross-family seed sets, so prefer seeds of this family
    // and fall back to all of them only when nothing more specific is known.
    const compatible = seeds.filter((seed) => !seed.type || seed.type === subtype).map((seed) => seed.id);
    const entities = compatible.length > 0 ? compatible : seeds.map((seed) => seed.id);
    let items: QlooEntity[];
    try {
      const client = await qloo();
      const { data } = await client.insights({
        type: subtype as InsightsType,
        entities,
        take: POOL,
        explainability: true,
      });
      items = normalizeEntities(data, { explainability: true }).items;
    } catch (error) {
      // One family failing must not empty the whole feed.
      console.error(`[taste-check] for-you insights failed for ${subtype}`, error);
      continue;
    }
    if (items.length === 0) continue;
    const index = new Map(items.map((item) => [item.id, item]));

    for (const entry of group) {
      const hit = index.get(entry.entity.id);
      if (!hit) continue; // outside the user's top-50 for this family
      picks.push({
        postId: entry.postId,
        title: entry.title,
        permalink: entry.permalink,
        author: entry.author,
        score: hit.affinity ?? 1 - (hit.rank - 1) / Math.max(items.length, 1),
        entity: { id: hit.id, name: hit.name, subtype: hit.subtype },
        ...(hit.affinity === undefined ? {} : { affinity: hit.affinity }),
        why: (hit.why ?? [])
          .slice(0, 3)
          .map((contribution) => ({
            name: seedNames.get(contribution.entityId) ?? contribution.name ?? 'one of your likes',
            score: contribution.score,
          })),
      });
    }
  }

  picks.sort((a, b) => b.score - a.score);
  return { source, profile, seeds, scanned: posts.length, matched: resolved.length, picks: picks.slice(0, MAX_PICKS) };
}

type ResolvedPost = {
  postId: string;
  title: string;
  permalink: string;
  author: string;
  entity: QlooEntity;
};

/**
 * `/search` has no affinity on the result, and it answers almost any string
 * ("Weekly discussion thread" resolves to a podcast, "…think of Oppenheimer?"
 * to a book called "Think Again"), so the resolved name must actually be
 * mentioned: its first meaningful word has to appear in the title, along with
 * at least half of its other meaningful words.
 */
async function resolvePosts(
  client: QlooClient,
  posts: { id: string; title: string; permalink: string; authorName: string }[],
): Promise<ResolvedPost[]> {
  const types = [...INSIGHTS_TYPES];
  const results = await pool(posts, SEARCH_CONCURRENCY, async (post) => {
    const query = cleanTitle(post.title);
    if (query.length < 4) return null;
    try {
      const { data } = await client.search({ query, types, take: 1, sortBy: 'match' });
      const entity = normalizeEntities(data).items[0];
      if (!entity || !mentions(query, entity.name)) return null;
      return {
        postId: post.id,
        title: post.title,
        permalink: post.permalink,
        author: post.authorName,
        entity,
      } satisfies ResolvedPost;
    } catch {
      // One unresolvable title must not sink the whole feed.
      return null;
    }
  });
  return results.filter((item): item is ResolvedPost => item !== null);
}

/** Generic thread titles must not count as a match on "weekly" or "discussion". */
const STOPWORDS = new Set([
  'about', 'after', 'again', 'all', 'also', 'and', 'any', 'are', 'best', 'but', 'can', 'check',
  'could', 'daily', 'day', 'did', 'discussion', 'do', 'does', 'dont', 'every', 'for', 'from', 'get',
  'got', 'had', 'has', 'have', 'help', 'here', 'how', 'into', 'its', 'just', 'know', 'like', 'look',
  'made', 'make', 'many', 'more', 'most', 'much', 'must', 'need', 'new', 'news', 'not', 'now', 'one',
  'only', 'other', 'our', 'out', 'over', 'own', 'post', 'posts', 'really', 'see', 'should', 'some',
  'still', 'such', 'talk', 'taste', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'thing', 'things', 'think', 'this', 'those', 'thread', 'threads', 'through', 'today',
  'tomorrow', 'too', 'top', 'two', 'under', 'update', 'updates', 'use', 'very', 'want', 'was', 'way',
  'week', 'weekly', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will',
  'with', 'work', 'would', 'year', 'you', 'your',
]);

function mentions(title: string, name: string): boolean {
  const titleWords = new Set(tokens(title));
  const nameWords = tokens(name).filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  const primary = nameWords[0];
  // The first meaningful word is the franchise/title token; without it the
  // match is almost always a lexical accident ("think" -> "Think Again").
  if (!primary || primary.length < 4 || !titleWords.has(primary)) return false;
  const hits = nameWords.filter((word) => titleWords.has(word)).length;
  return hits * 2 >= nameWords.length;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Small bounded-concurrency map so 30 titles do not open 30 sockets at once. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------------ */
/* Shared For You post                                                 */
/* ------------------------------------------------------------------ */

/**
 * The post is shared, not per user: every visitor gets their own ranking from
 * `/api/for-you`. Re-running the menu item reopens the existing post.
 */
export async function ensureForYouPost(): Promise<{ permalink: string; created: boolean }> {
  const existing = await redis.get(FOR_YOU_POST_KEY);
  if (existing) {
    try {
      const post = await reddit.getPostById(existing as `t3_${string}`);
      return { permalink: post.permalink, created: false };
    } catch {
      await redis.del(FOR_YOU_POST_KEY);
    }
  }

  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Posts picked for your taste',
    entry: 'foryou',
    textFallback: {
      text: 'Open this post to see this subreddit’s posts ranked against your Taste Check profile.',
    },
    userGeneratedContent: { text: 'Personalised post ranking from Taste Check.' },
  });
  await redis.set(FOR_YOU_POST_KEY, post.id);
  return { permalink: post.permalink, created: true };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function currentRoundOrNull(): Promise<StoredRound | null> {
  const { currentRound } = await import('./game.js');
  return currentRound();
}
