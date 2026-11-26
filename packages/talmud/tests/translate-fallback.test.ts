import { BudgetPausedError } from '@corpus/core/llm/budget';
import { LLMError } from '@corpus/core/llm/llm-error';
import { describe, expect, it } from 'vitest';
import {
  TRANSLATE_MODELS,
  type TranslateModelSpec,
  walkTranslateModels,
} from '../src/worker/translate-fallback';

const KEY_URL = 'https://openrouter.ai/settings/keys';

function keyLimit(): LLMError {
  return new LLMError(
    403,
    `OpenRouter HTTP 403: {"error":{"message":"Key limit exceeded (weekly limit). $50.19 of $50.00 used. Manage it using ${KEY_URL}"}}`,
  );
}

const chain: TranslateModelSpec[] = [
  { id: 'openrouter/deepseek/a', label: 'a', provider: 'openrouter' },
  { id: 'openrouter/deepseek/b', label: 'b', provider: 'openrouter' },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'gemma', provider: 'workers-ai' },
];

describe('walkTranslateModels', () => {
  it('uses Gemma on Workers AI, not the deprecated Kimi hop', () => {
    expect(TRANSLATE_MODELS.map((m) => m.id)).toEqual([
      'openrouter/deepseek/deepseek-v4-flash',
      '@cf/google/gemma-4-26b-a4b-it',
    ]);
  });

  it('skips the rest of the OpenRouter key after a cap and still tries Workers AI', async () => {
    const called: string[] = [];
    const result = await walkTranslateModels({
      models: chain,
      workersAi: true,
      run: async (model) => {
        called.push(model.label);
        if (model.provider === 'openrouter') throw keyLimit();
        return '"dialectic"';
      },
    });
    expect(called).toEqual(['a', 'gemma']);
    expect(result).toMatchObject({
      ok: true,
      translation: 'dialectic',
      provider: 'workers-ai',
      credentialFailure: 'key-limit',
    });
  });

  it('treats a 429 the same way: do not walk the rest of that provider', async () => {
    const called: string[] = [];
    await walkTranslateModels({
      models: chain,
      workersAi: true,
      run: async (model) => {
        called.push(model.label);
        if (model.label === 'a') throw new LLMError(429, 'OpenRouter HTTP 429: slow down');
        return 'ok';
      },
    });
    expect(called).toEqual(['a', 'gemma']);
  });

  it('still tries the next OpenRouter model on an ordinary upstream error', async () => {
    const called: string[] = [];
    const result = await walkTranslateModels({
      models: chain,
      workersAi: true,
      run: async (model) => {
        called.push(model.label);
        if (model.label === 'a') {
          throw new LLMError(500, `OpenRouter HTTP 500: upstream ${KEY_URL}`);
        }
        return 'from-b';
      },
    });
    expect(called).toEqual(['a', 'b']);
    expect(result).toMatchObject({ ok: true, translation: 'from-b', provider: 'openrouter' });
  });

  it('stops on our own budget pause — the next model is refused too', async () => {
    const called: string[] = [];
    const result = await walkTranslateModels({
      models: chain,
      workersAi: true,
      run: async (model) => {
        called.push(model.label);
        throw new BudgetPausedError('all', Date.now() + 5_000, 'daily spend over trip');
      },
    });
    expect(called).toEqual(['a']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe('daily-cap');
  });

  it('does not call Workers AI when the binding is absent', async () => {
    const called: string[] = [];
    const result = await walkTranslateModels({
      models: chain,
      workersAi: false,
      run: async (model) => {
        called.push(model.label);
        throw keyLimit();
      },
    });
    expect(called).toEqual(['a']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('key-limit');
      expect(result.detail).toContain(KEY_URL);
      expect(result.detail).toContain('Workers AI binding unavailable');
    }
  });

  it('reports the known cap when the sentinel already skipped OpenRouter and Gemma fails', async () => {
    const called: string[] = [];
    const result = await walkTranslateModels({
      models: chain,
      blocked: ['openrouter'],
      workersAi: true,
      seed: { reason: 'key-limit' },
      run: async (model) => {
        called.push(model.label);
        throw new Error(`workers-ai down ${KEY_URL}`);
      },
    });
    expect(called).toEqual(['gemma']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe('key-limit');
  });
});
