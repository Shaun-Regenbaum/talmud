/**
 * Starting a daf's generation: POST /api/admin/workflow-warm/:tractate/:page
 * (the trusted Workflow trigger) and POST /api/daf-generate/:tractate/:page.
 *
 * startDafGeneration is exported because /api/daf-view?generate=1 and
 * /api/pesukim?generate=1 answer with the same envelope and still live in
 * index.ts.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import { aiUnavailableMessage } from '@corpus/core/llm/ai-status';
import { checkBudget } from '@corpus/core/llm/budget';
import type { Hono } from 'hono';
import { isValidAmud } from '../../lib/sefref/amudim';
import { resolveAiDown } from '../ai-credits';
import { dafGenerationFollowUp } from '../follow-up';
import { isTrustedRequest, pausedAiFields, pauseErrorMessage } from '../request-guards';
import type { Bindings } from '../types';
import { dafGenSentinelKey } from '../workflow-warm';

// The generation coordinator's trigger (Phase 2 foundation): kick off ONE
// per-daf warm Workflow, single-flighted via a short KV sentinel so N concurrent
// readers trigger ONE generation, not N. Open (readers call it) but budget-gated
// and rate-limited by the sentinel (one Workflow per daf+lang per 15 min). The
// Workflow generates the daf's pieces as bounded per-step invocations; the reader
// sees them fill in via /api/daf-view. (The client cutover + streaming render are
// the next step; this is the verifiable backend the coordinator is built on.)
type DafGenerateOutcome = { status: 200 | 404 | 503; body: Record<string, unknown> };

/**
 * Start (or join) the daf's generation Workflow. Shared by POST /api/daf-generate
 * and GET /api/daf-view?generate=1 so both answer with the SAME envelope: a
 * machine caller gets `checkUrl` / `readerUrl` / `retryAfterSeconds` /
 * `etaMinutes` alongside `generating`, and the refusal envelopes (unknown daf,
 * budget pause, provider down) are identical on both paths.
 */
export async function startDafGeneration(
  c: { env: Bindings },
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<DafGenerateOutcome> {
  const wf = c.env.DAF_WARM_WORKFLOW;
  // A page outside the tractate's real extent (e.g. Megillah 32b — Megillah
  // ends at 32a) must not spawn a Workflow: every Sefaria-backed step gets a
  // permanent ref error, the queue retries hard-fail, and the LLM steps bill
  // for a daf that doesn't exist. 404 now, before any budget/breaker checks.
  if (!isValidAmud(tractate, page)) {
    return { status: 404, body: { generating: false, error: `unknown daf: ${tractate} ${page}` } };
  }
  const gate = await checkBudget(c.env, { custom: false });
  if (!gate.ok) {
    return {
      status: 200,
      body: {
        generating: false,
        paused: true,
        error: pauseErrorMessage(gate.scope),
        ...pausedAiFields(gate.scope),
      },
    };
  }
  // Checked after the budget gate so staging, which has no Workflow binding and
  // GENERATION_DISABLED=1, answers with the paused envelope rather than a 503.
  if (!wf) {
    return {
      status: 503,
      body: { generating: false, error: 'DAF_WARM_WORKFLOW binding not available' },
    };
  }
  // Provider-down circuit breaker: out-of-credits / key-cap / provider outage
  // is NOT a budget pause, so the gate above passes while every Workflow step
  // is doomed to fail. Without this check a cold daf spawns a Workflow that
  // churns 402s, and the client sits in view-driven mode (its /api/run fan-out
  // — the only path that raises the AI-paused banner — suppressed) until the
  // ~40s stall detector gives up. `resolveAiDown` is AUTHORITATIVE: it consults
  // the actual OpenRouter balance (cached), so out-of-credits is caught even in
  // a quiet window where the reactive sentinel has expired. Answer with the
  // explained envelope NOW.
  const down = await resolveAiDown(c.env);
  if (down) {
    return {
      status: 200,
      body: {
        generating: false,
        paused: true,
        error: aiUnavailableMessage(down.reason),
        aiUnavailable: true as const,
        reason: down.reason,
      },
    };
  }
  const cache = c.env.CACHE;
  const sentinel = dafGenSentinelKey(tractate, page, lang);
  const followUp = dafGenerationFollowUp(tractate, page, lang);
  // Single-flight: if a generation is already in flight for this daf, return it
  // rather than starting a duplicate. (A rare simultaneous-first-hit race may
  // start two; the 2nd's steps mostly cache-hit the 1st's output — a no-op. A
  // Durable Object would make this atomic; the sentinel is good enough here.)
  if (cache) {
    const inflight = await cache.get(sentinel);
    if (inflight) {
      return {
        status: 200,
        body: { generating: true, already: true, instanceId: inflight, ...followUp },
      };
    }
  }
  const instance = await wf.create({ params: { tractate, page, lang } });
  if (cache) await cache.put(sentinel, instance.id, { expirationTtl: 900 });
  return { status: 200, body: { generating: true, instanceId: instance.id, ...followUp } };
}

export function registerDafGenerateRoutes(app: Hono<{ Bindings: Bindings }>): void {
  // Phase 3 (step 1): trigger the warm Workflow for a daf (trusted). Generates the
  // daf's whole-daf pieces as separate per-step invocations (bounded per-step
  // memory) and returns the workflow instance id. Additive — does not touch the
  // queue/run/reader paths. Inspect progress with `wrangler workflows instances`.
  app.post('/api/admin/workflow-warm/:tractate/:page', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const wf = c.env.DAF_WARM_WORKFLOW;
    if (!wf) return c.json({ error: 'DAF_WARM_WORKFLOW binding not available' }, 503);
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
    const instance = await wf.create({ params: { tractate, page, lang } });
    return c.json({ ok: true, id: instance.id, tractate, page, lang });
  });

  app.post('/api/daf-generate/:tractate/:page', async (c) => {
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    const lang: 'en' | 'he' = c.req.query('lang') === 'he' ? 'he' : 'en';
    const out = await startDafGeneration(c, tractate, page, lang);
    return c.json(out.body, out.status);
  });
}
