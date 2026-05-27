/**
 * LLM settings: persisted in KV under key `llm-settings:v1`. Read by runLLM
 * to resolve the default model + fallback chain at call time. Mutated via
 * /api/admin/llm-settings.
 *
 * Designed for the single-user case — one settings object, no per-user
 * scoping. Phase 4 (Studio) layers `?model=` query overrides on top of
 * these defaults; Phase 3 will add `perStepOverrides` entries that runLLM
 * looks up by enrichment step ID.
 */

import type { LLMModelId } from './llm';

export const SETTINGS_KEY = 'llm-settings:v1';

export interface LLMSettings {
  defaultModel: LLMModelId;
  fallbackChain: LLMModelId[];
  perStepOverrides?: Record<string, LLMModelId>;
  updatedAt: string;
}

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
  { id: '@cf/moonshotai/kimi-k2.5',                vendor: 'Cloudflare/Moonshot', label: 'Kimi K2.5 (Workers AI)',  notes: 'Free (neuron-billed) but dropped from prod over Workers AI concurrency limits — selectable, not the default/fallback' },
  { id: '@cf/google/gemma-4-26b-a4b-it',           vendor: 'Cloudflare/Google',   label: 'Gemma 4 26B (Workers AI)', notes: 'Fast, no thinking; used for translate + era' },
  { id: 'openrouter/deepseek/deepseek-v4-flash',   vendor: 'DeepSeek',            label: 'DeepSeek V4 Flash',        notes: '$0.14/$0.28 per 1M — cheapest frontier-adjacent option', inputPer1M: 0.14, outputPer1M: 0.28 },
  { id: 'openrouter/deepseek/deepseek-v4-pro',     vendor: 'DeepSeek',            label: 'DeepSeek V4 Pro',          notes: '$0.435/$0.87 per 1M (75% off through 2026-05-31), $1.74/$3.48 after', inputPer1M: 0.435, outputPer1M: 0.87 },
  { id: 'openrouter/deepseek/deepseek-v3.2-exp',   vendor: 'DeepSeek',            label: 'DeepSeek V3.2 Sparse',     notes: 'Sparse attention, long context' },
  { id: 'openrouter/z-ai/glm-4.6',                 vendor: 'Zhipu',               label: 'GLM-4.6',                  notes: '$0.60/$2.20 per 1M — frontier-ish reasoning', inputPer1M: 0.60, outputPer1M: 2.20 },
  { id: 'openrouter/anthropic/claude-sonnet-4.5',  vendor: 'Anthropic',           label: 'Claude Sonnet 4.5',        notes: 'Frontier; expensive' },
  { id: 'openrouter/google/gemini-2.5-flash',      vendor: 'Google',              label: 'Gemini 2.5 Flash',         notes: 'Fast, multimodal' },
];

// The actual production workhorse. Note: marks/enrichments PIN their model
// per task (DeepSeek V4 Flash for structural extraction + synthesis, V4 Pro
// for Q&A) via shared constants in code-marks.ts — see ARGUMENT_FLASH_MODEL /
// ARGUMENT_PRO_MODEL. This default only governs LLM calls that DON'T pass an
// explicit model, so it must reflect reality (DeepSeek), not an aspirational
// or legacy value. (It was '@cf/…/kimi-k2.5', which read as "Kimi is the
// default" even though nothing un-pinned actually ran on it.)
const DEFAULTS: LLMSettings = {
  defaultModel: 'openrouter/deepseek/deepseek-v4-pro',
  fallbackChain: ['openrouter/deepseek/deepseek-v4-flash'],
  updatedAt: new Date(0).toISOString(),
};

export interface SettingsEnv {
  CACHE?: KVNamespace;
}

export async function readSettings(env: SettingsEnv): Promise<LLMSettings> {
  if (!env.CACHE) return DEFAULTS;
  const raw = await env.CACHE.get(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    return {
      defaultModel: parsed.defaultModel ?? DEFAULTS.defaultModel,
      fallbackChain: Array.isArray(parsed.fallbackChain) ? parsed.fallbackChain as LLMModelId[] : DEFAULTS.fallbackChain,
      perStepOverrides: parsed.perStepOverrides,
      updatedAt: parsed.updatedAt ?? DEFAULTS.updatedAt,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function writeSettings(env: SettingsEnv, next: Omit<LLMSettings, 'updatedAt'>): Promise<LLMSettings> {
  if (!env.CACHE) throw new Error('CACHE binding not available');
  const merged: LLMSettings = { ...next, updatedAt: new Date().toISOString() };
  await env.CACHE.put(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

/** Validate a string is one of the model-id shapes runLLM accepts. */
export function isLLMModelId(s: unknown): s is LLMModelId {
  if (typeof s !== 'string') return false;
  return s.startsWith('@cf/') || s.startsWith('openrouter/');
}
