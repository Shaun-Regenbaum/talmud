import { runWithRetry } from '@corpus/core/llm/ai-gateway';
import {
  classifyStatus,
  isFallbackWorthy,
  isRetryable,
  isSharedCredentialFailure,
  LLMError,
  NEITHER,
  nextFallbackIndex,
  openRouterFailureClass,
  SWITCH_PROVIDER,
  TIMEOUT,
} from '@corpus/core/llm/llm-error';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Typed error classification replaces the old stringly-typed RETRYABLE /
// FALLBACK_WORTHY regexes. Routing (retry same model vs. fail over vs. surface)
// is now a property of the error rather than a match on its .message.
// ---------------------------------------------------------------------------

describe('LLMError classification', () => {
  it('defaults a 5xx to transient (retry + fall over)', () => {
    const e = new LLMError(503, 'upstream blew up');
    expect(e.retryable).toBe(true);
    expect(e.fallbackWorthy).toBe(true);
  });

  it('defaults a 429 to transient', () => {
    const e = new LLMError(429, 'rate limited');
    expect(e.retryable).toBe(true);
    expect(e.fallbackWorthy).toBe(true);
  });

  it('treats a TIMEOUT 408 as fail-over-only (never retry the same stalled model)', () => {
    const e = new LLMError(408, 'hard-timed-out', { cls: TIMEOUT });
    expect(e.retryable).toBe(false);
    expect(e.fallbackWorthy).toBe(true);
  });

  it('surfaces a 4xx immediately (neither retry nor fall over)', () => {
    const e = new LLMError(400, 'bad request');
    expect(e.retryable).toBe(false);
    expect(e.fallbackWorthy).toBe(false);
  });

  it('lets a misconfig 5xx opt out of transient via explicit NEITHER', () => {
    const e = new LLMError(503, 'AI binding not available', { cls: NEITHER });
    expect(e.retryable).toBe(false);
    expect(e.fallbackWorthy).toBe(false);
  });
});

describe('classifyStatus', () => {
  it('maps 429 and 5xx to transient, everything else to neither', () => {
    expect(classifyStatus(429)).toEqual({ retryable: true, fallbackWorthy: true });
    expect(classifyStatus(500)).toEqual({ retryable: true, fallbackWorthy: true });
    expect(classifyStatus(502)).toEqual({ retryable: true, fallbackWorthy: true });
    expect(classifyStatus(400)).toEqual({ retryable: false, fallbackWorthy: false });
    expect(classifyStatus(404)).toEqual({ retryable: false, fallbackWorthy: false });
  });
});

describe('foreign error classification (errors we did not construct)', () => {
  it('treats a raw "fetch failed" as retryable (transient transport)', () => {
    const e = new TypeError('fetch failed');
    expect(isRetryable(e)).toBe(true);
    expect(isFallbackWorthy(e)).toBe(true);
  });

  it('treats Workers-AI 3046 / 1031 as retryable', () => {
    expect(isRetryable(new Error('AiError 3046: InferenceUpstreamError'))).toBe(true);
    expect(isRetryable(new Error('1031 something'))).toBe(true);
  });

  it('treats an abort/timeout as fail-over-only, not retryable', () => {
    const e = new DOMException('The operation was aborted', 'AbortError');
    expect(isRetryable(e)).toBe(false);
    expect(isFallbackWorthy(e)).toBe(true);
  });

  it('treats an unrelated error as neither', () => {
    const e = new Error('schema validation failed: missing field');
    expect(isRetryable(e)).toBe(false);
    expect(isFallbackWorthy(e)).toBe(false);
  });
});

describe('shared-credential failures', () => {
  const chain = ['openrouter/deepseek/a', 'openrouter/deepseek/b', '@cf/google/gemma-4-26b-a4b-it'];
  const keyLimit = new LLMError(
    403,
    'OpenRouter HTTP 403: {"error":{"message":"Key limit exceeded (weekly limit). Manage it using https://openrouter.ai/settings/keys"}}',
    { cls: SWITCH_PROVIDER },
  );

  it('does not retry a key cap, but will hand off to another provider', () => {
    expect(keyLimit.retryable).toBe(false);
    expect(keyLimit.fallbackWorthy).toBe(true);
    expect(isSharedCredentialFailure(keyLimit)).toBe(true);
  });

  it('classes a key-cap body as switch-provider even when the status is 429', () => {
    expect(openRouterFailureClass(429, 'Key limit exceeded (weekly limit)')).toEqual(
      SWITCH_PROVIDER,
    );
    expect(openRouterFailureClass(402, 'Insufficient credits')).toEqual(SWITCH_PROVIDER);
    expect(openRouterFailureClass(403, 'forbidden')).toEqual(NEITHER);
    expect(openRouterFailureClass(429, 'rate limited')).toEqual({
      retryable: true,
      fallbackWorthy: true,
    });
  });

  it('skips later models on the same key and keeps a Workers AI hop', () => {
    expect(nextFallbackIndex(chain, 0, keyLimit)).toBe(2);
    expect(nextFallbackIndex(['openrouter/a', 'openrouter/b'], 0, keyLimit)).toBe(-1);
  });

  it('still walks the next model on the same provider for an ordinary upstream error', () => {
    const down = new LLMError(503, 'OpenRouter HTTP 503: upstream');
    expect(isSharedCredentialFailure(down)).toBe(false);
    expect(nextFallbackIndex(chain, 0, down)).toBe(1);
    const stalled = new LLMError(408, 'hard-timed-out', { cls: TIMEOUT });
    expect(nextFallbackIndex(chain, 0, stalled)).toBe(1);
  });

  it('stops on a plain 4xx', () => {
    expect(nextFallbackIndex(chain, 0, new LLMError(400, 'bad request'))).toBe(-1);
    expect(isFallbackWorthy(new LLMError(400, 'bad request'))).toBe(false);
  });
});

describe('runWithRetry honors the abort signal during backoff', () => {
  it('bails out of the backoff immediately instead of waiting the full delay', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const perform = async () => {
      attempts++;
      throw new TypeError('fetch failed'); // retryable → would enter the ~1s backoff
    };
    // Abort well before the first backoff (backoffMs(1) is ~1000ms).
    setTimeout(() => controller.abort(), 10);

    const start = Date.now();
    await expect(runWithRetry(perform, controller.signal)).rejects.toBeDefined();
    const elapsed = Date.now() - start;

    expect(attempts).toBe(1); // aborted mid-backoff, never retried
    expect(elapsed).toBeLessThan(500); // without interruption this would be >= 1000ms
  });
});
