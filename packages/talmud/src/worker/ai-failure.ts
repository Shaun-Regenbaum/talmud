/**
 * The client envelope for a failed AI call. The message is the fixed
 * one-liner from @corpus/core/llm/ai-status — never the provider body, which
 * has included an OpenRouter key-management URL.
 */

import {
  type AiUnavailable,
  aiUnavailableMessage,
  retryAfterSeconds,
} from '@corpus/core/llm/ai-status';
import type { Context } from 'hono';

export function aiUnavailableJson(c: Context, u: AiUnavailable): Response {
  c.header('Retry-After', String(retryAfterSeconds(u)));
  return c.json(
    {
      error: aiUnavailableMessage(u.reason),
      aiUnavailable: true as const,
      reason: u.reason,
    },
    503,
  );
}
