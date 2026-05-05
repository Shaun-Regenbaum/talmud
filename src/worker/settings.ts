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
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: '@cf/moonshotai/kimi-k2.5',                vendor: 'Cloudflare/Moonshot', label: 'Kimi K2.5 (Workers AI)',  notes: 'Current production default — thinking-mode capable' },
  { id: '@cf/google/gemma-4-26b-a4b-it',           vendor: 'Cloudflare/Google',   label: 'Gemma 4 26B (Workers AI)', notes: 'Fast, no thinking; used for translate + era' },
  { id: 'openrouter/deepseek/deepseek-v4-flash',   vendor: 'DeepSeek',            label: 'DeepSeek V4 Flash',        notes: '$0.14/$0.28 per 1M — cheapest frontier-adjacent option' },
  { id: 'openrouter/deepseek/deepseek-v4-pro',     vendor: 'DeepSeek',            label: 'DeepSeek V4 Pro',          notes: '$0.435/$0.87 per 1M (75% off through 2026-05-31), $1.74/$3.48 after' },
  { id: 'openrouter/deepseek/deepseek-v3.2-exp',   vendor: 'DeepSeek',            label: 'DeepSeek V3.2 Sparse',     notes: 'Sparse attention, long context' },
  { id: 'openrouter/z-ai/glm-4.6',                 vendor: 'Zhipu',               label: 'GLM-4.6',                  notes: '$0.60/$2.20 per 1M — frontier-ish reasoning' },
  { id: 'openrouter/anthropic/claude-sonnet-4.5',  vendor: 'Anthropic',           label: 'Claude Sonnet 4.5',        notes: 'Frontier; expensive' },
  { id: 'openrouter/google/gemini-2.5-flash',      vendor: 'Google',              label: 'Gemini 2.5 Flash',         notes: 'Fast, multimodal' },
];

const DEFAULTS: LLMSettings = {
  defaultModel: '@cf/moonshotai/kimi-k2.5',
  fallbackChain: ['openrouter/deepseek/deepseek-v4-pro'],
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
