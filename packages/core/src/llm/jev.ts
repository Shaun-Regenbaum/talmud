/**
 * TypeSafe "System One" transport (the Jev model).
 *
 * Jev is not a chat model. It takes a `state` (text or JSON) plus a map of
 * typed questions and returns typed answers: a Choice (one option from a set,
 * with a probability per option), a Noul (probability that a yes/no holds), or
 * a Score (position on ordered levels). It never generates prose, so it fits
 * the calls in this codebase where code already knows the answer set and only
 * needs a judgment: which registry rabbi a bare name denotes, which segment a
 * study note discusses, whether a sugya continues across the page break.
 *
 * Same discipline as runLLM: the budget gate runs first, every call lands in
 * the cost ledger and the spend counters, transient failures (429 / 529 / 5xx
 * / network) retry with backoff, and a hard timeout caps each attempt. There
 * is no fallback chain here — a caller that wants one keeps its old runLLM
 * path and falls back to it when runJev throws (a missing TYPESAFE_API_KEY
 * throws immediately, so the fallback is also how a deploy without the key
 * keeps working).
 *
 * Limits (docs.typesafe.ai): a Choice takes up to 255 options; state and all
 * questions together must fit 64k tokens, state plus the longest question 32k.
 * Pack independent questions over one state into one call — they are answered
 * in parallel and the state is paid for once.
 */

import { runWithRetry } from './ai-gateway';
import { BudgetPausedError, checkBudget, recordSpend } from './budget';
import { type CostAttribution, type LLMEnv, recordCostLedgerEntry } from './llm';
import { LLMError, NEITHER, TIMEOUT } from './llm-error';
import { costSplitUsd } from './pricing';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-latest';
/** Cost-ledger model prefix; pricing.ts prices anything under it. */
export const JEV_MODEL_PREFIX = 'typesafe/';
export const JEV_TRANSPORT = 'typesafe';

// Jev answers in about a second; 30s is generous and keeps a stalled call
// from wedging a queue consumer (the OpenRouter path uses 240s because prose
// generation legitimately runs minutes — nothing here does).
const JEV_HARD_TIMEOUT_MS = 30_000;

/** Instructions and criteria accept a string or JSON structure (an object
 *  with definitions / exclusions / examples, or an array of rules). */
export type JevText = string | Record<string, unknown> | unknown[];

export interface ChoiceQuestion {
  type: 'choice';
  instructions: JevText;
  /** Option name → description (null when the name says enough). */
  criteria: Record<string, JevText | null>;
}
export interface NoulQuestion {
  type: 'noul';
  instructions: JevText;
  criteria?: { true?: JevText; false?: JevText };
}
export interface ScoreQuestion {
  type: 'score';
  instructions: JevText;
  /** Ordered level descriptions, at least two. */
  criteria: JevText[];
}
export type JevQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  /** Every option → probability; sums to 1. */
  probabilities: Record<string, number>;
  /** 0..1, derived by TypeSafe from how peaked `probabilities` is. */
  confidence: number;
}
export interface NoulAnswer {
  type: 'noul';
  /** Probability the answer is yes. No separate confidence. */
  noul: number;
}
export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}
export type JevAnswer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export type AnswerFor<Q extends JevQuestion> = Q extends ChoiceQuestion
  ? ChoiceAnswer
  : Q extends NoulQuestion
    ? NoulAnswer
    : ScoreAnswer;
export type JevAnswers<Q extends Record<string, JevQuestion>> = { [K in keyof Q]: AnswerFor<Q[K]> };

export interface JevCallOptions<Q extends Record<string, JevQuestion>> {
  /** What the questions are about: a string, or (preferably) an object with
   *  named fields the instructions can reference in backticks. */
  state: unknown;
  questions: Q;
  /** `jev-latest` unless pinned. The result reports the versioned id. */
  model?: string;
  /** Cost-ledger label, e.g. 'rabbi.identity.pin'. */
  tag?: string;
  attribution?: CostAttribution;
  cost_class?: 'custom-question';
}

export interface JevResult<Q extends Record<string, JevQuestion>> {
  answers: JevAnswers<Q>;
  /** Versioned model id that answered (e.g. `jev-1.13.0`). */
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  elapsed_ms: number;
  transport: typeof JEV_TRANSPORT;
}

// --- question constructors ---------------------------------------------------

export function choice(
  instructions: JevText,
  criteria: Record<string, JevText | null>,
): ChoiceQuestion {
  return { type: 'choice', instructions, criteria };
}
export function noul(instructions: JevText, criteria?: NoulQuestion['criteria']): NoulQuestion {
  return { type: 'noul', instructions, criteria };
}
export function score(instructions: JevText, levels: JevText[]): ScoreQuestion {
  return { type: 'score', instructions, criteria: levels };
}

// --- answer helpers ------------------------------------------------------------

/** Options ranked by probability, highest first. */
export function rankedChoices(a: ChoiceAnswer): Array<[string, number]> {
  return Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
}

/**
 * Sum probability across options that mean the same thing. `groups` maps a
 * representative option to the options folded into it (the representative
 * may or may not list itself). Options outside every group pass through.
 * Returns the merged distribution and its top option; TypeSafe's `confidence`
 * is NOT recomputed — threshold on the merged probability instead.
 *
 * Why: the rabbi registry carries duplicate nodes for one person (e.g.
 * `rabbi-oshaya` / `rabbi-oshaya-2`). Offered both, Jev rightly splits its
 * probability between them, which reads as low confidence for what is really
 * a confident pick.
 */
export function mergeChoiceMass(
  a: ChoiceAnswer,
  groups: Record<string, readonly string[]>,
): { choice: string; probabilities: Record<string, number> } {
  const rep = new Map<string, string>();
  for (const [head, members] of Object.entries(groups)) {
    rep.set(head, head);
    for (const m of members) rep.set(m, head);
  }
  const merged: Record<string, number> = {};
  for (const [opt, p] of Object.entries(a.probabilities)) {
    const k = rep.get(opt) ?? opt;
    merged[k] = (merged[k] ?? 0) + p;
  }
  let best = a.choice;
  let bestP = -1;
  for (const [k, p] of Object.entries(merged)) {
    if (p > bestP) {
      best = k;
      bestP = p;
    }
  }
  return { choice: best, probabilities: merged };
}

// --- the call ------------------------------------------------------------------

function withHardTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LLMError(408, `Jev call hard-timed-out after ${ms}ms`, { cls: TIMEOUT })),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Ask Jev one state + a map of questions. Throws LLMError: 503/NEITHER when
 * the key is missing, 4xx/NEITHER on a rejected request (a malformed question
 * is a bug, not a transient), 502/NEITHER when the answers don't match the
 * questions, 408/TIMEOUT on the hard timeout; 429/529/5xx retry with backoff
 * and throw only after the last attempt. BudgetPausedError when the spend
 * guard is latched.
 */
// --- availability breaker ----------------------------------------------------
// A 401/402/403 (bad key, no credits, forbidden) will repeat identically until
// a person acts at console.typesafe.ai. Every caller keeps a fallback, so the
// only cost of hammering is a wasted round trip per call; latch for a while and
// fail fast instead. Per isolate, in memory — a redeploy or a new isolate
// starts clean, which is the right cadence for "did someone add credits yet".
const UNAVAILABLE_LATCH_MS = 10 * 60_000;
let unavailable: { until: number; status: number; message: string } | null = null;

export function jevAvailability(now: number = Date.now()): {
  ok: boolean;
  until?: number;
  status?: number;
  message?: string;
} {
  if (unavailable && now < unavailable.until) return { ok: false, ...unavailable };
  return { ok: true };
}
/** Tests + admin: forget a latched rejection. */
export function resetJevAvailability(): void {
  unavailable = null;
}

export async function runJev<Q extends Record<string, JevQuestion>>(
  env: LLMEnv,
  opts: JevCallOptions<Q>,
): Promise<JevResult<Q>> {
  const custom = opts.cost_class === 'custom-question';
  const gate = await checkBudget(env, { custom });
  if (!gate.ok) throw new BudgetPausedError(gate.scope ?? 'all', gate.until, gate.reason);
  if (!env.TYPESAFE_API_KEY) throw new LLMError(503, 'TYPESAFE_API_KEY not set', { cls: NEITHER });
  const questionIds = Object.keys(opts.questions);
  if (questionIds.length === 0) throw new LLMError(400, 'runJev: no questions', { cls: NEITHER });
  const avail = jevAvailability();
  if (!avail.ok) {
    throw new LLMError(avail.status ?? 503, `Jev unavailable (latched): ${avail.message}`, {
      cls: NEITHER,
    });
  }

  const model = opts.model ?? JEV_DEFAULT_MODEL;
  const body = JSON.stringify({ state: opts.state, model, questions: opts.questions });
  const t0 = Date.now();
  let raw: unknown;
  try {
    raw = await withHardTimeout(
      runWithRetry(async () => {
        let r: Response;
        try {
          r = await fetch(JEV_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
            },
            body,
          });
        } catch (err) {
          // Network failure: TRANSIENT via classifyStatus(503) → retried.
          throw new LLMError(503, `Jev fetch failed: ${String((err as Error)?.message ?? err)}`, {
            cause: err,
          });
        }
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          // 429 + 5xx (incl. 529 overloaded) classify TRANSIENT; other 4xx NEITHER.
          throw new LLMError(r.status, `Jev HTTP ${r.status}: ${text.slice(0, 500)}`);
        }
        return (await r.json()) as unknown;
      }),
      JEV_HARD_TIMEOUT_MS,
    );
  } catch (err) {
    if (
      err instanceof LLMError &&
      (err.status === 401 || err.status === 402 || err.status === 403)
    ) {
      unavailable = {
        until: Date.now() + UNAVAILABLE_LATCH_MS,
        status: err.status,
        message: err.message.slice(0, 300),
      };
    }
    throw err;
  }
  const elapsed_ms = Date.now() - t0;
  const parsed = validateResponse(raw, opts.questions);
  const result: JevResult<Q> = {
    answers: parsed.answers,
    model: parsed.model,
    usage: parsed.usage,
    elapsed_ms,
    transport: JEV_TRANSPORT,
  };
  await recordJevCost(env, result, opts);
  return result;
}

function validateResponse<Q extends Record<string, JevQuestion>>(
  raw: unknown,
  questions: Q,
): {
  answers: JevAnswers<Q>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
} {
  const bad = (why: string): never => {
    throw new LLMError(502, `Jev response invalid: ${why}`, { cls: NEITHER });
  };
  if (!raw || typeof raw !== 'object') return bad('not an object');
  const o = raw as { model?: unknown; answers?: unknown; usage?: unknown };
  const answers = o.answers;
  if (!answers || typeof answers !== 'object') return bad('missing answers');
  const out: Record<string, JevAnswer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = (answers as Record<string, unknown>)[id];
    if (!a || typeof a !== 'object') return bad(`no answer for ${id}`);
    const ans = a as Record<string, unknown>;
    if (ans.type !== q.type) return bad(`${id}: expected ${q.type}, got ${String(ans.type)}`);
    if (q.type === 'noul') {
      if (!isUnit(ans.noul)) return bad(`${id}: noul not in 0..1`);
      out[id] = { type: 'noul', noul: ans.noul as number };
    } else if (q.type === 'choice') {
      const probs = ans.probabilities;
      if (!probs || typeof probs !== 'object') return bad(`${id}: missing probabilities`);
      const options = Object.keys(q.criteria);
      const p: Record<string, number> = {};
      for (const opt of options) {
        const v = (probs as Record<string, unknown>)[opt];
        p[opt] = isUnit(v) ? (v as number) : 0;
      }
      if (typeof ans.choice !== 'string' || !(ans.choice in q.criteria))
        return bad(`${id}: choice "${String(ans.choice)}" is not an option`);
      if (!isUnit(ans.confidence)) return bad(`${id}: confidence not in 0..1`);
      out[id] = {
        type: 'choice',
        choice: ans.choice,
        probabilities: p,
        confidence: ans.confidence as number,
      };
    } else {
      if (typeof ans.score !== 'number' || !Number.isFinite(ans.score))
        return bad(`${id}: score not a number`);
      if (!ans.probabilities || typeof ans.probabilities !== 'object')
        return bad(`${id}: missing probabilities`);
      if (!isUnit(ans.confidence)) return bad(`${id}: confidence not in 0..1`);
      out[id] = {
        type: 'score',
        score: ans.score,
        legend: (ans.legend && typeof ans.legend === 'object' ? ans.legend : {}) as Record<
          string,
          string
        >,
        probabilities: ans.probabilities as Record<string, number>,
        confidence: ans.confidence as number,
      };
    }
  }
  const u = (o.usage && typeof o.usage === 'object' ? o.usage : {}) as Record<string, unknown>;
  return {
    answers: out as JevAnswers<Q>,
    model: typeof o.model === 'string' ? o.model : JEV_DEFAULT_MODEL,
    usage: {
      input_tokens: typeof u.input_tokens === 'number' ? u.input_tokens : 0,
      output_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : 0,
    },
  };
}

function isUnit(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** Ledger + spend counters, same shape as an OpenRouter call so /usage and the
 *  budget guard see Jev spend without special cases. Jev bills input tokens
 *  only; output is free — pricing.ts carries that rate under `typesafe/`. */
async function recordJevCost<Q extends Record<string, JevQuestion>>(
  env: LLMEnv,
  result: JevResult<Q>,
  opts: JevCallOptions<Q>,
): Promise<void> {
  const model = `${JEV_MODEL_PREFIX}${result.model}`;
  const usage = {
    prompt_tokens: result.usage.input_tokens,
    completion_tokens: result.usage.output_tokens,
    total_tokens: result.usage.input_tokens + result.usage.output_tokens,
  };
  const { costInUsd, costOutUsd } = costSplitUsd(model, usage);
  await recordCostLedgerEntry(env, {
    model,
    transport: JEV_TRANSPORT,
    tag: opts.tag ?? 'untagged',
    attempts: 1,
    ms: result.elapsed_ms,
    cost: null,
    cost_in_est: costInUsd,
    cost_out_est: costOutUsd,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    cached_tokens: null,
    attribution: opts.attribution,
    cost_class: opts.cost_class ?? null,
  });
  await recordSpend(env, {
    model,
    usage,
    custom: opts.cost_class === 'custom-question',
  });
}
