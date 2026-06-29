import { describe, expect, it } from 'vitest';
import {
  type AiUnavailableReason,
  aiUnavailableMessage,
  classifyAiUnavailable,
  isAiUnavailable,
} from '../src/llm/ai-status.ts';
import { BudgetPausedError } from '../src/llm/budget.ts';
import { LLMError } from '../src/llm/llm-error.ts';

describe('classifyAiUnavailable', () => {
  it('maps OpenRouter 402 to credits', () => {
    const err = new LLMError(
      402,
      'OpenRouter HTTP 402: {"error":{"message":"Insufficient credits..."}}',
    );
    expect(classifyAiUnavailable(err)).toEqual({ reason: 'credits' });
  });

  it('maps an out-of-credits message without a 402 status to credits', () => {
    // Foreign throwable re-wrapped so the status is lost.
    const err = new Error('Translate failed: Insufficient credits. Add more using ...');
    expect(classifyAiUnavailable(err)).toEqual({ reason: 'credits' });
  });

  it('maps the daily budget pause to daily-cap and carries the lift time', () => {
    const err = new BudgetPausedError('all', 1_700_000_000_000, 'daily spend over trip');
    expect(classifyAiUnavailable(err)).toEqual({
      reason: 'daily-cap',
      retryAfter: 1_700_000_000_000,
    });
  });

  it('maps the hourly custom-question pause to hourly-cap', () => {
    const err = new BudgetPausedError('custom', 1_700_000_000_000);
    expect(classifyAiUnavailable(err)).toEqual({
      reason: 'hourly-cap',
      retryAfter: 1_700_000_000_000,
    });
  });

  it('maps provider 429 to rate-limit and 5xx to provider', () => {
    expect(classifyAiUnavailable(new LLMError(429, 'OpenRouter HTTP 429: rate limited'))).toEqual({
      reason: 'rate-limit',
    });
    expect(classifyAiUnavailable(new LLMError(503, 'OpenRouter HTTP 503: upstream'))).toEqual({
      reason: 'provider',
    });
  });

  it('returns null for ordinary failures (a real bug is not a spend pause)', () => {
    expect(classifyAiUnavailable(new LLMError(400, 'bad request'))).toBeNull();
    expect(classifyAiUnavailable(new Error('cannot read property foo of undefined'))).toBeNull();
    expect(classifyAiUnavailable(null)).toBeNull();
    expect(isAiUnavailable(new Error('TypeError'))).toBe(false);
  });

  it('has a message for every reason', () => {
    const reasons: AiUnavailableReason[] = [
      'credits',
      'daily-cap',
      'hourly-cap',
      'rate-limit',
      'provider',
    ];
    for (const r of reasons) expect(aiUnavailableMessage(r).length).toBeGreaterThan(10);
  });
});
