import { type LLMCallOptions, type LLMEnv, resolveChain } from '@corpus/core/llm/llm';
import { DEFAULT_FALLBACK_CHAIN, DEFAULT_MODEL } from '@corpus/core/llm/settings';
import { describe, expect, it } from 'vitest';

// The KV settings layer was removed: the model chain is resolved purely from
// code (DEFAULT_MODEL / DEFAULT_FALLBACK_CHAIN) + the optional DEFAULT_LLM_MODEL
// env var + per-call opts. These lock that behavior — especially that the
// default never silently becomes Kimi again.

const opts = (o: Partial<LLMCallOptions>): LLMCallOptions =>
  ({ messages: [], max_tokens: 1, ...o }) as LLMCallOptions;

describe('resolveChain — code-driven, no KV', () => {
  it('pins an explicit model and appends no default fallback', () => {
    expect(resolveChain({} as LLMEnv, opts({ model: 'openrouter/x/y' }))).toEqual([
      'openrouter/x/y',
    ]);
  });

  it('appends the caller-supplied fallback to a pinned model', () => {
    expect(
      resolveChain({} as LLMEnv, opts({ model: 'openrouter/x/y', fallback: ['@cf/a/b'] })),
    ).toEqual(['openrouter/x/y', '@cf/a/b']);
  });

  it('falls to DEFAULT_MODEL + DEFAULT_FALLBACK_CHAIN when nothing is set', () => {
    expect(resolveChain({} as LLMEnv, opts({}))).toEqual([
      DEFAULT_MODEL,
      ...DEFAULT_FALLBACK_CHAIN,
    ]);
  });

  it('honors a valid DEFAULT_LLM_MODEL env override', () => {
    expect(resolveChain({ DEFAULT_LLM_MODEL: 'openrouter/foo/bar' } as LLMEnv, opts({}))).toEqual([
      'openrouter/foo/bar',
      ...DEFAULT_FALLBACK_CHAIN,
    ]);
  });

  it('ignores an invalid env value and uses DEFAULT_MODEL', () => {
    expect(resolveChain({ DEFAULT_LLM_MODEL: 'not-a-model' } as LLMEnv, opts({}))).toEqual([
      DEFAULT_MODEL,
      ...DEFAULT_FALLBACK_CHAIN,
    ]);
  });

  it('never resolves to Kimi (Workers AI) by default', () => {
    const chain = resolveChain({} as LLMEnv, opts({}));
    expect(chain.some((m) => m.includes('kimi'))).toBe(false);
    expect(DEFAULT_MODEL.startsWith('openrouter/deepseek')).toBe(true);
    expect(DEFAULT_FALLBACK_CHAIN.some((m) => m.includes('kimi'))).toBe(false);
  });
});
