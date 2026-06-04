/**
 * Self-tracked cost estimation. Maps a model id + token usage to a USD figure
 * using the list prices recorded on MODEL_PRESETS. Models without a known rate
 * (Workers AI neuron-billed `@cf/*`, anything we don't have an authoritative
 * number for) return null — we never guess a rate. The AI Gateway analytics
 * figure (see aigw-analytics.ts) is authoritative for every model regardless;
 * this in-app number exists so we can attribute spend per mark / enrichment,
 * which the gateway can't break down.
 */
import { MODEL_PRESETS } from './settings';

/**
 * Token usage as it appears across the codebase. runLLM returns the
 * OpenAI-shaped `prompt_tokens` / `completion_tokens`; the deterministic
 * short-circuits (graph / lookup) emit `input_tokens` / `output_tokens`.
 * Normalize both.
 */
export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICES = new Map<string, ModelPrice>();
for (const p of MODEL_PRESETS) {
  if (typeof p.inputPer1M === 'number' && typeof p.outputPer1M === 'number') {
    PRICES.set(p.id, { inputPer1M: p.inputPer1M, outputPer1M: p.outputPer1M });
  }
}

/** True if we have a list price for this model id. */
export function isPriced(model: string | null | undefined): boolean {
  return !!model && PRICES.has(model);
}

export function priceFor(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  return PRICES.get(model) ?? null;
}

export function normalizeUsage(u: TokenUsage | null | undefined): { input: number; output: number } {
  if (!u) return { input: 0, output: 0 };
  const input = u.prompt_tokens ?? u.input_tokens ?? 0;
  const output = u.completion_tokens ?? u.output_tokens ?? 0;
  return { input, output };
}

/**
 * Estimated USD cost of one call. Returns null when the model has no known
 * list price (so callers can render "unpriced" rather than $0.00, which would
 * understate real spend on Workers AI models).
 */
export function costUsd(model: string | null | undefined, usage: TokenUsage | null | undefined): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const { input, output } = normalizeUsage(usage);
  return (input / 1e6) * price.inputPer1M + (output / 1e6) * price.outputPer1M;
}

/**
 * The list-price estimate split into its input-side and output-side dollars.
 * OpenRouter only returns ONE billed `cost` number (net of prompt-cache), so an
 * exact input-vs-output dollar decomposition isn't available — this estimate
 * (tokens x list rate) is how the dashboard shows the in/out ratio. Both fields
 * are null for unpriced models (Workers AI etc.).
 */
export function costSplitUsd(
  model: string | null | undefined,
  usage: TokenUsage | null | undefined,
): { costInUsd: number | null; costOutUsd: number | null } {
  const price = priceFor(model);
  if (!price) return { costInUsd: null, costOutUsd: null };
  const { input, output } = normalizeUsage(usage);
  return {
    costInUsd: (input / 1e6) * price.inputPer1M,
    costOutUsd: (output / 1e6) * price.outputPer1M,
  };
}
