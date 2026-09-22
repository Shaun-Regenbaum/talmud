import { describe, expect, it } from 'vitest';
import { isFallbackWorthy, LLMError } from '../src/llm/llm-error';
import { readProviderJson } from '../src/llm/provider-json';

describe('provider response parsing', () => {
  it('lets an empty or truncated HTTP body reach the model fallback', async () => {
    for (const body of ['', '{']) {
      const error = await readProviderJson(new Response(body)).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(LLMError);
      expect(isFallbackWorthy(error)).toBe(true);
      expect((error as LLMError).status).toBe(502);
      expect((error as LLMError).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('preserves stream failures for timeout handling', async () => {
    const controller = new AbortController();
    controller.abort();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.error(controller.signal.reason);
      },
    });
    await expect(readProviderJson(new Response(body))).rejects.toBe(controller.signal.reason);
  });
});
