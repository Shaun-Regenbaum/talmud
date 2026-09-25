/**
 * The per-move Q&A endpoints: GET /api/qa/registry, POST /api/qa/ask and
 * POST /api/qa/click, plus the small KV registry and the per-IP rate limit
 * they share.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import { checkBudget } from '@corpus/core/llm/budget';
import type { Hono } from 'hono';
import { z } from 'zod';
import { qualifierHash } from '../cache-keys';
import { readJsonBody } from '../http-helpers';
import { kvGetJSONAs } from '../kv-json';
import { pausedAiFields, pauseErrorMessage, pauseRetryAfterSec } from '../request-guards';
import { makeRunId } from '../run-id';
import type { Bindings, JobMessage } from '../types';

// ---------------------------------------------------------------------------
// Per-move Q&A registry — supports the Explore-deeper panel on argument-move
// cards. We keep ONE small JSON blob per move that lists which questions
// users have asked about it (curated + community). The actual answers live
// in the shared enrichment cache via argument-move.qa, keyed per
// (move, normalized question hash). Decoupling these means: (a) the answer
// cache stays uniformly shaped; (b) the registry stays small enough to read
// + rewrite as a single value on every interaction.
//
// Key shape:
//   qa-registry:{mark}:v1:{instance_id}:{tractate}:{page}
//
// Body shape (JSON):
//   {
//     community: [{ q, qHash, askedAt, clickCount }]
//   }
//
// Curated questions aren't stored here — they live in the
// {mark}.suggested-questions enrichment cache and are fetched by the client
// directly. The registry only tracks user-submitted ones because those are
// the ones the worker would otherwise have no way to enumerate (KV list-by-
// prefix is slow / paginated and we want this on the hot path).
//
// The `mark` partition lets argument-move and pesukim share the same QA
// machinery without colliding on instance ids. The endpoint dispatches the
// `<mark>.qa` enrichment to fill the answer cache.
// ---------------------------------------------------------------------------

// Marks that have a `<mark>.qa` enrichment registered. Keep this small —
// adding a mark here requires the corresponding suggested-questions + qa
// enrichments to exist in code-marks.ts.
const QA_ALLOWED_MARKS = new Set(['argument-move', 'pesukim', 'aggadata']);
const QA_DEFAULT_MARK = 'argument-move';
const QA_COMMUNITY_CAP = 50;
const QA_QUESTION_MAX_CHARS = 280;
// Rate limiting for /api/qa/ask: per-IP rolling window keyed in KV. Cheap
// abuse gate; not perfect (NAT, mobile carriers share IPs) but raises the
// floor for someone trying to burn LLM credits via the open endpoint.
const QA_ASK_RATE_LIMIT_WINDOW_SEC = 60 * 60;
const QA_ASK_RATE_LIMIT_MAX = 8;

interface QaRegistryEntry {
  q: string;
  qHash: string;
  askedAt: number;
  clickCount: number;
}
interface QaRegistry {
  community: QaRegistryEntry[];
}

/** The stored registry. The list is what the route walks; an entry's own fields
 *  are rendered with defaults, so they are left open. This says exactly what
 *  the hand-written check below it used to say. */
const qaRegistryShape = z.looseObject({ community: z.array(z.looseObject({})) });

/** One rate-limit counter. Both fields are compared against numbers, so a
 *  value missing either is unusable and the window simply starts over. */
const rateLimitShape = z.looseObject({ count: z.number(), windowStart: z.number() });

function qaRegistryKey(mark: string, tractate: string, page: string, instanceId: string): string {
  // Mirror the cache-keys.ts sanitization so registry keys can't carry
  // colons or slashes that would collide across instances.
  const safe = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .slice(0, 80);
  return `qa-registry:${safe(mark)}:v1:${safe(instanceId)}:${safe(tractate)}:${safe(page)}`;
}

async function readQaRegistry(
  env: Bindings,
  mark: string,
  tractate: string,
  page: string,
  instanceId: string,
): Promise<QaRegistry> {
  if (!env.CACHE) return { community: [] };
  try {
    const key = qaRegistryKey(mark, tractate, page, instanceId);
    return (await kvGetJSONAs<QaRegistry>(env.CACHE, key, qaRegistryShape)) ?? { community: [] };
  } catch {
    return { community: [] };
  }
}

async function writeQaRegistry(
  env: Bindings,
  mark: string,
  tractate: string,
  page: string,
  instanceId: string,
  reg: QaRegistry,
): Promise<void> {
  if (!env.CACHE) return;
  await env.CACHE.put(qaRegistryKey(mark, tractate, page, instanceId), JSON.stringify(reg));
}

// Pull (mark, instanceId) out of a request. Accepts both legacy
// `move_id`/(no mark, defaults to argument-move) and the generalized
// `instance_id`+`mark` forms.
function resolveQaScope(input: {
  mark?: string;
  move_id?: string;
  instance_id?: string;
}): { mark: string; instanceId: string } | null {
  const mark = input.mark ?? QA_DEFAULT_MARK;
  if (!QA_ALLOWED_MARKS.has(mark)) return null;
  const instanceId = input.instance_id ?? input.move_id;
  if (!instanceId) return null;
  return { mark, instanceId };
}

function clientIp(c: { req: { header: (k: string) => string | undefined; raw: unknown } }): string {
  // CF-Connecting-IP is the standard CF header; fall back through the others
  // for local dev. Keep this as a single concatenated id rather than IP-only
  // so two-cookie / two-mobile scenarios still share a counter.
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}

async function tickRateLimit(
  env: Bindings,
  scope: string,
  who: string,
): Promise<{ ok: boolean; remaining: number }> {
  if (!env.CACHE) return { ok: true, remaining: QA_ASK_RATE_LIMIT_MAX };
  const key = `ratelimit:${scope}:${who}`;
  const parsed = await kvGetJSONAs<{ count: number; windowStart: number }>(
    env.CACHE,
    key,
    rateLimitShape,
  );
  const now = Math.floor(Date.now() / 1000);
  let count = 0;
  let windowStart = now;
  if (parsed && now - parsed.windowStart < QA_ASK_RATE_LIMIT_WINDOW_SEC) {
    count = parsed.count;
    windowStart = parsed.windowStart;
  }
  count += 1;
  await env.CACHE.put(key, JSON.stringify({ count, windowStart }), {
    expirationTtl: QA_ASK_RATE_LIMIT_WINDOW_SEC,
  });
  return {
    ok: count <= QA_ASK_RATE_LIMIT_MAX,
    remaining: Math.max(0, QA_ASK_RATE_LIMIT_MAX - count),
  };
}

export function registerQaRoutes(app: Hono<{ Bindings: Bindings }>): void {
  /**
   * GET /api/qa/registry?tractate&page&move_id|instance_id&mark
   *
   * Returns the community-submitted question list for one anchor so the client
   * can render the Questions panel without enumerating KV. Curated questions
   * are fetched separately via /api/run on `<mark>.suggested-questions`.
   *
   * `mark` defaults to 'argument-move' for back-compat with older clients.
   */
  app.get('/api/qa/registry', async (c) => {
    const tractate = c.req.query('tractate');
    const page = c.req.query('page');
    if (!tractate || !page) {
      return c.json({ error: 'tractate, page required' }, 400);
    }
    const scope = resolveQaScope({
      mark: c.req.query('mark'),
      move_id: c.req.query('move_id'),
      instance_id: c.req.query('instance_id'),
    });
    if (!scope) {
      return c.json(
        {
          error:
            'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
        },
        400,
      );
    }
    const reg = await readQaRegistry(c.env, scope.mark, tractate, page, scope.instanceId);
    return c.json(reg);
  });

  /**
   * POST /api/qa/ask
   *
   * Body: { tractate, page, mark?, instance_id|move_id, question, mark_input }
   *
   * Normalizes + hashes the question, dedupes against the registry, appends
   * to community if new, and enqueues the `<mark>.qa` enrichment so the
   * answer cache fills in for everyone. The actual answer is fetched
   * separately via /api/run by the client (which polls the queue) —
   * this endpoint only kicks the job and records the question for other users.
   *
   * `mark` defaults to 'argument-move' for back-compat with older clients.
   *
   * Returns: { qHash, alreadyAsked, rateLimited?, remaining }
   */
  app.post('/api/qa/ask', async (c) => {
    const parsed = await readJsonBody(c);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const b = body as Partial<{
      tractate: string;
      page: string;
      mark: string;
      move_id: string;
      instance_id: string;
      question: string;
      mark_input: unknown;
      lang: 'en' | 'he';
    }>;
    if (!b.tractate || !b.page || !b.question) {
      return c.json({ error: 'tractate, page, question required' }, 400);
    }
    const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
    if (!scope) {
      return c.json(
        {
          error:
            'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
        },
        400,
      );
    }
    const trimmed = b.question.trim();
    if (trimmed.length === 0) return c.json({ error: 'question is empty' }, 400);
    if (trimmed.length > QA_QUESTION_MAX_CHARS) {
      return c.json({ error: `question must be ≤${QA_QUESTION_MAX_CHARS} chars` }, 400);
    }

    const qHash = await qualifierHash(trimmed);

    // Existence check before rate-limiting. If the question is already in the
    // registry, we just bump click count and return — no LLM, no rate-limit
    // burn for the user. (They'd hit the cached answer anyway.)
    const reg = await readQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId);
    const existing = reg.community.find((e) => e.qHash === qHash);
    if (existing) {
      existing.clickCount += 1;
      await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);
      return c.json({ qHash, alreadyAsked: true, remaining: -1 });
    }

    // Budget gate: pause new custom questions once the hourly custom budget (or
    // the daily total) is exhausted. Checked before the per-IP rate limit so a
    // paused request doesn't burn the user's quota.
    const gate = await checkBudget(c.env, { custom: true });
    if (!gate.ok) {
      return c.json(
        {
          error: pauseErrorMessage(gate.scope),
          paused: true,
          scope: gate.scope,
          retryAfter: pauseRetryAfterSec(gate.until),
          ...pausedAiFields(gate.scope),
        },
        429,
      );
    }

    // Novel question — gate behind the per-IP rate limit because this will
    // trigger an LLM call.
    const rl = await tickRateLimit(c.env, 'qa-ask', clientIp(c));
    if (!rl.ok) {
      return c.json({ error: 'rate-limited', rateLimited: true, remaining: 0 }, 429);
    }

    reg.community.unshift({
      q: trimmed,
      qHash,
      askedAt: Date.now(),
      clickCount: 1,
    });
    while (reg.community.length > QA_COMMUNITY_CAP) reg.community.pop();
    await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);

    // Kick the enrichment job so the answer is ready by the time the client
    // polls for it. The /api/run hot-path lookup will still cache-hit
    // on the second user with the same normalized question.
    if (c.env.ENRICHMENT_QUEUE) {
      const job: JobMessage = {
        runId: '',
        enrichment_id: `${scope.mark}.qa`,
        tractate: b.tractate,
        page: b.page,
        mark_input: b.mark_input,
        user_question: trimmed,
        bypass_cache: false,
        lang: b.lang === 'he' ? 'he' : undefined,
      };
      job.runId = await makeRunId(job);
      try {
        await c.env.ENRICHMENT_QUEUE.send(job);
      } catch (err) {
        console.warn('[qa/ask] queue send failed:', String((err as Error)?.message ?? err));
      }
    }

    return c.json({ qHash, alreadyAsked: false, remaining: rl.remaining });
  });

  /**
   * POST /api/qa/click
   *
   * Body: { tractate, page, mark?, instance_id|move_id, qHash }
   *
   * Bumps click count for ranking. Best-effort — off-by-one doesn't matter
   * and we don't fail the request on a write race. Used for the "show top
   * 2 questions" ranking on the panel.
   */
  app.post('/api/qa/click', async (c) => {
    const parsed = await readJsonBody(c);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const b = body as Partial<{
      tractate: string;
      page: string;
      mark: string;
      move_id: string;
      instance_id: string;
      qHash: string;
    }>;
    if (!b.tractate || !b.page || !b.qHash) {
      return c.json({ error: 'tractate, page, qHash required' }, 400);
    }
    const scope = resolveQaScope({ mark: b.mark, move_id: b.move_id, instance_id: b.instance_id });
    if (!scope) {
      return c.json(
        {
          error:
            'mark must be one of argument-move|pesukim|aggadata and instance_id (or move_id) is required',
        },
        400,
      );
    }
    const reg = await readQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId);
    const entry = reg.community.find((e) => e.qHash === b.qHash);
    if (entry) {
      entry.clickCount += 1;
      await writeQaRegistry(c.env, scope.mark, b.tractate, b.page, scope.instanceId, reg);
    }
    return c.json({ ok: true });
  });
}
