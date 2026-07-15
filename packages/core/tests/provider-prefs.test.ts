import { describe, expect, it } from 'vitest';
import { defaultDeepseekProviderPrefs } from '../src/llm/llm';

describe('defaultDeepseekProviderPrefs', () => {
  it('prefers first-party deterministically for v4-pro', () => {
    const p = defaultDeepseekProviderPrefs('deepseek/deepseek-v4-pro');
    expect(p).toEqual({
      order: ['deepseek'],
      sort: 'price',
      allow_fallbacks: true,
      require_parameters: true,
    });
  });

  it('keeps flash on plain price-sorting (third parties undercut first-party)', () => {
    const p = defaultDeepseekProviderPrefs('deepseek/deepseek-v4-flash');
    expect(p).toEqual({ sort: 'price', allow_fallbacks: true, require_parameters: true });
    expect(p?.order).toBeUndefined();
  });

  it('covers other deepseek slugs with the first-party preference', () => {
    expect(defaultDeepseekProviderPrefs('deepseek/deepseek-v3.2-exp')?.order).toEqual(['deepseek']);
  });

  it('returns undefined for non-deepseek slugs', () => {
    expect(defaultDeepseekProviderPrefs('anthropic/claude-sonnet-4.5')).toBeUndefined();
    expect(defaultDeepseekProviderPrefs('openai/gpt-5.5')).toBeUndefined();
    expect(defaultDeepseekProviderPrefs('z-ai/glm-4.6')).toBeUndefined();
  });
});
