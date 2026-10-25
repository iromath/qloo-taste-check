import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import { Hono } from 'hono';
import { QlooError, type Verdict } from '@taste/qloo';
import {
  currentRound,
  dashboard,
  gradeRound,
  hasPlayed,
  leaderboard,
  loadRound,
  startRound,
  toPublic,
  type StoredRound,
} from './game.js';
import { keyConfigured } from './qloo.js';

const VERDICTS = new Set<string>(['LOVE', 'MEH', 'PASS']);

const app = new Hono();

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

type Failure = { error: { kind: string; message: string; hint?: string } };

function fail(kind: string, message: string, hint?: string): Failure {
  return { error: { kind, message, ...(hint ? { hint } : {}) } };
}

function statusFor(kind: string): 400 | 403 | 404 | 429 | 500 | 502 | 503 | 504 {
  switch (kind) {
    case 'invalid_input':
    case 'bad_request':
    case 'forbidden':
      return 400;
    case 'unauthorized':
      return 403;
    case 'not_found':
      return 404;
    case 'rate_limited':
      return 429;
    case 'timeout':
      return 504;
    case 'config':
      return 503;
    default:
      return 502;
  }
}

/** `context` only exists inside a request, so every handler reads it lazily. */
function playerName(): string {
  return context.username ?? 'anonymous';
}

async function isModerator(): Promise<boolean> {
  const username = context.username;
  if (!username) return false;
  const mods = await reddit
    .getModerators({ subredditName: context.subredditName, username })
    .all();
  return mods.some((mod) => mod.username === username);
}

/** The post carries its round id in `postData`; bare visits fall back to the newest round. */
async function resolveRound(): Promise<StoredRound | null> {
  const postData = context.postData;
  const roundId = postData && typeof postData.roundId === 'string' ? postData.roundId : null;
  return roundId ? loadRound(roundId) : currentRound();
}

/* ------------------------------------------------------------------ */
/* Fallback notice                                                     */
/* ------------------------------------------------------------------ */

const PENDING_NOTICE_KEY = 'notice:pending';

type Notice = { title: string; reason: string; hint: string };

/**
 * A fresh install that cannot reach Qloo would leave the feed empty and the
 * reason buried in the server logs. This posts the reason instead, and records
 * the post so the daily task repeats it at most once.
 */
async function postPendingNotice(notice: Notice): Promise<void> {
  // A retried install replaces yesterday's explanation instead of stacking them.
  await withdrawPendingNotice();
  try {
    const post = await reddit.submitPost({
      subredditName: context.subredditName,
      title: notice.title,
      text: [
        'Taste Check is installed, but it has not managed to build a round yet, so there is nothing to play.',
        `**Why:** ${notice.reason}`,
        `**What to do:** ${notice.hint}`,
        'A moderator can retry at any time from **Mod tools → Start a Taste Check round**. This post is removed automatically once a round goes live.',
      ].join('\n\n'),
    });
    await redis.set(PENDING_NOTICE_KEY, post.id);
    console.log(`[taste-check] pending notice posted as ${post.id}`);
  } catch (error) {
    // The notice is a courtesy; it must never fail the trigger that asked for it.
    console.error('[taste-check] could not post the pending notice', error);
  }
}

/** Clears the placeholder once a real round exists, so the feed stops explaining itself. */
async function withdrawPendingNotice(): Promise<void> {
  const id = await redis.get(PENDING_NOTICE_KEY);
  if (!id) return;
  try {
    const post = await reddit.getPostById(id as `t3_${string}`);
    await post.delete();
  } catch (error) {
    console.error('[taste-check] could not withdraw the pending notice', error);
  }
  await redis.del(PENDING_NOTICE_KEY);
}

function noticeFor(error: unknown): Notice {
  if (error instanceof QlooError) {
    if (error.kind === 'network') {
      return {
        title: 'Taste Check — waiting for Reddit to approve Qloo access',
        reason:
          "Reddit has not approved this app's request to reach hackathon.api.qloo.com, and Devvit blocks outbound requests to domains that are not on the allowlist.",
        hint:
          "Nothing to fix in the code: the request is queued under Domain exceptions in the app's developer settings and is normally reviewed in 1–2 business days.",
      };
    }
    return {
      title: 'Taste Check — Qloo request failed',
      reason: `${error.kind}: ${error.message}`,
      hint: error.hint,
    };
  }

  return {
    title: 'Taste Check — the first round could not be built',
    reason: error instanceof Error ? error.message : 'Unexpected server error',
    hint: 'Check the logs with `npx devvit logs`, then retry from the moderator menu.',
  };
}

/** Menu toasts are one line, so they surface the actionable part of the failure only. */
function toastFor(error: unknown): string {
  if (error instanceof QlooError && error.kind === 'network') {
    return 'Qloo is blocked until Reddit approves hackathon.api.qloo.com. Retry once the domain review clears.';
  }
  return error instanceof Error ? error.message : 'The round could not be built. Check the app logs.';
}

/* ------------------------------------------------------------------ */
/* Webview API                                                         */
/* ------------------------------------------------------------------ */

app.get('/api/health', async (c) =>
  c.json({ ok: true, app: 'taste-check', qloo: (await keyConfigured()) ? 'configured' : 'missing_key' }),
);

app.get('/api/round', async (c) => {
  const round = await resolveRound();
  if (!round) {
    return c.json(
      fail('not_found', 'No Taste Check round exists yet', 'A moderator can start one from the subreddit menu.'),
      404,
    );
  }
  const player = playerName();
  return c.json({
    round: toPublic(round),
    played: await hasPlayed(round.id, player),
    board: await leaderboard(context.username, 5),
  });
});

app.post('/api/guess', async (c) => {
  const round = await resolveRound();
  if (!round) return c.json(fail('not_found', 'No Taste Check round exists yet'), 404);

  const body = await c.req.json<{ guesses?: Record<string, unknown> }>().catch(() => ({}) as { guesses?: Record<string, unknown> });
  const guesses = body.guesses ?? {};

  const missing = round.candidates
    .filter((candidate) => !VERDICTS.has(String(guesses[candidate.id])))
    .map((candidate) => candidate.id);
  if (missing.length > 0) {
    return c.json(
      fail('invalid_input', `${missing.length} candidate(s) have no LOVE/MEH/PASS answer`, `Answer every card. Missing: ${missing.join(', ')}`),
      400,
    );
  }

  const answers: Record<string, Verdict> = {};
  for (const candidate of round.candidates) {
    answers[candidate.id] = guesses[candidate.id] as Verdict;
  }

  const player = playerName();
  const graded = await gradeRound(round, player, answers);
  return c.json({ ...graded, board: await leaderboard(context.username, 5) });
});

app.get('/api/leaderboard', async (c) => c.json(await leaderboard(context.username, 10)));

app.get('/api/dashboard', async (c) => {
  if (!(await isModerator())) {
    return c.json(fail('unauthorized', 'The dashboard is moderator-only', 'Open it from the mod tools menu.'), 403);
  }
  return c.json(await dashboard());
});

/* ------------------------------------------------------------------ */
/* Menu / scheduler / trigger endpoints (Devvit-internal)              */
/* ------------------------------------------------------------------ */

app.post('/internal/menu/new-round', async (c) => {
  if (!(await isModerator())) {
    return c.json({ showToast: 'Only moderators can start a round.' });
  }

  const body = await c.req.json<{ theme?: unknown }>().catch(() => ({}) as { theme?: unknown });
  const theme = typeof body.theme === 'string' ? body.theme.trim() : '';

  try {
    const round = await startRound({ theme, submit: true });
    await withdrawPendingNotice();
    return c.json({
      showToast: { text: `Round live: ${round.candidates.length} cards, ${round.anchors.length} anchors.`, appearance: 'success' },
    });
  } catch (error) {
    // This menu item is also the retry action, so it reports instead of throwing.
    console.error('[taste-check] manual round failed', error);
    return c.json({ showToast: { text: toastFor(error), appearance: 'neutral' } });
  }
});

app.post('/internal/menu/dashboard-post', async (c) => {
  if (!(await isModerator())) {
    return c.json({ showToast: 'Only moderators can post the dashboard.' });
  }

  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Taste Check — subreddit dashboard',
    entry: 'dashboard',
    textFallback: {
      text: 'Moderator-only performance dashboard for this subreddit’s Taste Check rounds.',
    },
    userGeneratedContent: { text: 'Moderator dashboard for the Taste Check game.' },
  });

  return c.json({ navigateTo: post.permalink, showToast: 'Dashboard post created.' });
});

// Hono falls back to the notFound handler when a route returns a falsy value, so
// every Devvit-internal endpoint must end with a Response.
app.post('/internal/cron/daily-round', async (c) => {
  if (!(await keyConfigured())) {
    console.log('[taste-check] daily round skipped: qlooApiKey is not set');
    return c.json({ status: 'ok' });
  }
  try {
    const round = await startRound({ submit: true });
    await withdrawPendingNotice();
    console.log(`[taste-check] daily round ${round.id} posted as ${round.postId ?? 'unsubmitted'}`);
  } catch (error) {
    console.error('[taste-check] daily round failed', error);
    // Post the reason once, not once a day: the notice stays until a round works.
    if (!(await redis.get(PENDING_NOTICE_KEY))) {
      await postPendingNotice(noticeFor(error));
    }
  }
  return c.json({ status: 'ok' });
});

app.post('/internal/triggers/install', async (c) => {
  if (!(await keyConfigured())) {
    console.log('[taste-check] installed without a Qloo key; waiting for `devvit settings set qlooApiKey`');
    await postPendingNotice({
      title: 'Taste Check is installed — the Qloo API key is missing',
      reason:
        'This app has no Qloo API key yet, so it cannot ask Qloo which films, artists and places this community will love.',
      hint:
        'A moderator must run `npx devvit settings set qlooApiKey` from the app directory, then retry from the moderator menu.',
    });
    return c.json({ status: 'ok' });
  }
  try {
    const round = await startRound({ submit: true });
    await withdrawPendingNotice();
    console.log(`[taste-check] install round ${round.id} posted as ${round.postId ?? 'unsubmitted'}`);
  } catch (error) {
    // A failed first round must not roll back the installation.
    console.error('[taste-check] install round failed', error);
    await postPendingNotice(noticeFor(error));
  }
  return c.json({ status: 'ok' });
});

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

app.notFound((c) =>
  c.json(fail('not_found', `No route for ${c.req.method} ${new URL(c.req.url).pathname}`, 'Try /api/round, /api/health or /game.html.'), 404),
);

app.onError((error, c) => {
  if (error instanceof QlooError) {
    return c.json(fail(error.kind, error.message, error.hint), statusFor(error.kind));
  }
  console.error('[taste-check] unhandled', error);
  return c.json(fail('unknown', error instanceof Error ? error.message : 'Unexpected server error'), 500);
});

serve({ fetch: app.fetch, port: getServerPort(), createServer });
