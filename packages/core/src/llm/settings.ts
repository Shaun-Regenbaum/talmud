/**
 * LLM model catalog + the explicit default model chain.
 *
 * There is NO runtime KV settings layer — the default model + fallback are the
 * CODE constants below (DEFAULT_MODEL / DEFAULT_FALLBACK_CHAIN), so what runs is
 * what the repo says. (We removed the old `llm-settings:v1` KV override: it
 * could silently diverge from the code — prod had Kimi pinned in its fallback
 * long after the code dropped it — which was confusing and a footgun.)
 *
 * Per-task model choices are PINNED at each mark/enrichment (see
 * ARGUMENT_FLASH_MODEL / ARGUMENT_PRO_MODEL in code-marks.ts); this default only
 * governs LLM calls that pass no explicit model. wrangler.toml's
 * DEFAULT_LLM_MODEL env var can still override the default per-deploy without a
 * code change (explicit + in-repo), falling back to DEFAULT_MODEL here.
 */

import type { LLMModelId } from './llm';

/**
 * Curated list shown in the settings dropdown. Add an entry here to make a
 * model selectable from the UI without code changes elsewhere.
 */
export interface ModelPreset {
  id: LLMModelId;
  label: string;
  vendor: string;
  notes?: string;
  /**
   * List price in USD per 1M tokens. Used by pricing.ts for self-tracked cost
   * estimation. Only set where we have an authoritative published/promo rate —
   * leave undefined when unknown so cost surfaces as "unpriced" rather than a
   * fabricated number. The AI Gateway analytics figure is authoritative for
   * every model regardless of whether it's priced here.
   */
  inputPer1M?: number;
  outputPer1M?: number;
}

export const MODEL_PRESETS: ModelPreset[] = [
  // Workers AI (@cf/*) bills in neurons, not per-token list prices — left
  // unpriced; lean on the AI Gateway analytics figure for these.
  {
    id: '@cf/moonshotai/kimi-k2.5',
    vendor: 'Cloudflare/Moonshot',
    label: 'Kimi K2.5 (Workers AI)',
    notes:
      'Free (neuron-billed) but dropped from prod over Workers AI concurrency limits — selectable, not the default/fallback',
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    vendor: 'Cloudflare/Google',
    label: 'Gemma 4 26B (Workers AI)',
    notes: 'Fast, no thinking; used for translate + era',
  },
  {
    id: 'openrouter/deepseek/deepseek-v4-flash',
    vendor: 'DeepSeek',
    label: 'DeepSeek V4 Flash',
    notes: '$0.14/$0.28 per 1M — cheapest frontier-adjacent option',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
  },
  {
    id: 'openrouter/deepseek/deepseek-v4-pro',
    vendor: 'DeepSeek',
    label: 'DeepSeek V4 Pro',
    notes: '$0.435/$0.87 per 1M (75% off through 2026-05-31), $1.74/$3.48 after',
    inputPer1M: 0.435,
    outputPer1M: 0.87,
  },
  {
    id: 'openrouter/deepseek/deepseek-v3.2-exp',
    vendor: 'DeepSeek',
    label: 'DeepSeek V3.2 Sparse',
    notes: 'Sparse attention, long context',
  },
  {
    id: 'openrouter/z-ai/glm-4.6',
    vendor: 'Zhipu',
    label: 'GLM-4.6',
    notes: '$0.60/$2.20 per 1M — frontier-ish reasoning',
    inputPer1M: 0.6,
    outputPer1M: 2.2,
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4.5',
    vendor: 'Anthropic',
    label: 'Claude Sonnet 4.5',
    notes: 'Frontier; expensive',
  },
  {
    id: 'openrouter/google/gemini-2.5-flash',
    vendor: 'Google',
    label: 'Gemini 2.5 Flash',
    notes: 'Fast, multimodal',
  },
];

// The default model + fallback for any LLM call that passes no explicit model.
// This is THE source of truth (no KV override). Marks/enrichments mostly pin
// their own model per task (ARGUMENT_FLASH_MODEL / ARGUMENT_PRO_MODEL in
// code-marks.ts), so this governs only un-pinned calls. DeepSeek because that's
// what actually runs in prod; never Kimi (dropped over Workers AI limits).
export const DEFAULT_MODEL: LLMModelId = 'openrouter/deepseek/deepseek-v4-pro';
export const DEFAULT_FALLBACK_CHAIN: LLMModelId[] = ['openrouter/deepseek/deepseek-v4-flash'];

/** Validate a string is one of the model-id shapes runLLM accepts. */
export function isLLMModelId(s: unknown): s is LLMModelId {
  if (typeof s !== 'string') return false;
  return s.startsWith('@cf/') || s.startsWith('openrouter/');
}
