/**
 * Which translation models to try, and when to stop.
 *
 * The primary is OpenRouter (one API key). A key-cap or an empty balance fails
 * every later `openrouter/*` model the same way, so those are skipped. The
 * Workers AI hop does not use that key — it is the `AI` binding already in
 * wrangler.toml, no extra secret.
 *
 * Gemma, not Kimi. Kimi K2.5 (`@cf/moonshotai/kimi-k2.5`) was the old hop; Workers
 * AI deprecated it on 2026-05-30 (calls alias to K2.6) and it had already been
 * dropped from the default chain over concurrency limits. While the OpenRouter
 * key sat at its weekly cap, that hop failed too, and every word click 502'd.
 * Gemma is the local model the rest of the app already uses when OpenRouter
 * is down (hebraize). It is a worse gloss than DeepSeek — the dict still
 * covers the words it botches — so a Gemma answer is cached for an hour, not
 * the month a DeepSeek answer is.
 */

import {
  type AiUnavailable,
  type AiUnavailableReason,
  classifyAiUnavailable,
} from '@corpus/core/llm/ai-status';
import type { LLMModelId } from '@corpus/core/llm/llm';

export type TranslateProvider = 'openrouter' | 'workers-ai';

export interface TranslateModelSpec {
  id: LLMModelId;
  label: string;
  provider: TranslateProvider;
}

export const TRANSLATE_MODELS: readonly TranslateModelSpec[] = [
  {
    id: 'openrouter/deepseek/deepseek-v4-flash',
    label: 'deepseek-v4-flash',
    provider: 'openrouter',
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'gemma-4-26b',
    provider: 'workers-ai',
  },
];

export const TRANSLATE_CACHE_TTL_S = 60 * 60 * 24 * 30;
/** Degraded gloss. Long enough to absorb a click-storm, short enough that a
 *  recovered key is asked again instead of serving Gemma for a month. */
export const TRANSLATE_FALLBACK_TTL_S = 60 * 60;

const RANK: Record<AiUnavailableReason, number> = {
  'key-limit': 50,
  credits: 50,
  'daily-cap': 40,
  'hourly-cap': 40,
  'cost-control': 40,
  'rate-limit': 20,
  provider: 10,
};

export type TranslateWalk =
  | {
      ok: true;
      translation: string;
      label: string;
      provider: TranslateProvider;
      /** An earlier model refused on the shared OpenRouter credential. */
      credentialFailure: 'key-limit' | 'credits' | null;
    }
  | {
      ok: false;
      failure: AiUnavailable;
      /** Server log only. Never copy this into a response. */
      detail: string;
    };

function blocksAll(reason: AiUnavailableReason): boolean {
  return reason === 'daily-cap' || reason === 'hourly-cap' || reason === 'cost-control';
}

/** Stop walking this provider. A key cap is a property of the OpenRouter key,
 *  not of Workers AI. A 429 is the provider refusing, so the rest of its
 *  models are not called either. Our own budget pause is handled by blocksAll. */
function blocksProvider(provider: TranslateProvider, reason: AiUnavailableReason): boolean {
  if (reason === 'key-limit' || reason === 'credits') return provider === 'openrouter';
  return reason === 'rate-limit';
}

function prefer(best: AiUnavailable | null, next: AiUnavailable): AiUnavailable {
  if (!best || RANK[next.reason] >= RANK[best.reason]) return next;
  return best;
}

/**
 * Call `run` for each model that can still succeed. `blocked` is copied.
 * `seed` is the ai-down sentinel: when the key is already known capped, the
 * OpenRouter models are not called, and a failed fallback still reports that
 * cap rather than a generic outage.
 */
export async function walkTranslateModels(args: {
  models: readonly TranslateModelSpec[];
  blocked?: Iterable<TranslateProvider>;
  workersAi: boolean;
  seed?: AiUnavailable | null;
  run: (model: TranslateModelSpec) => Promise<string>;
}): Promise<TranslateWalk> {
  const blocked = new Set(args.blocked);
  const logs: string[] = [];
  let best: AiUnavailable | null = args.seed ?? null;
  let credentialFailure: 'key-limit' | 'credits' | null =
    args.seed?.reason === 'key-limit' || args.seed?.reason === 'credits' ? args.seed.reason : null;

  for (const model of args.models) {
    if (model.provider === 'workers-ai' && !args.workersAi) {
      logs.push(`${model.label}: skipped (Workers AI binding unavailable)`);
      continue;
    }
    if (blocked.has(model.provider)) {
      logs.push(`${model.label}: skipped (${model.provider} already refused)`);
      continue;
    }
    try {
      const translation = (await args.run(model)).trim().replace(/^["']|["']$/g, '');
      if (!translation) {
        logs.push(`${model.label}: empty response`);
        continue;
      }
      return {
        ok: true,
        translation,
        label: model.label,
        provider: model.provider,
        credentialFailure,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push(`${model.label}: ${message.slice(0, 500)}`);
      const unavailable = classifyAiUnavailable(err);
      if (!unavailable) continue;
      best = prefer(best, unavailable);
      if (unavailable.reason === 'key-limit' || unavailable.reason === 'credits') {
        credentialFailure = unavailable.reason;
      }
      if (blocksAll(unavailable.reason)) break;
      if (blocksProvider(model.provider, unavailable.reason)) blocked.add(model.provider);
    }
  }

  return {
    ok: false,
    failure: best ?? { reason: 'provider' },
    detail: logs.join(' | '),
  };
}
