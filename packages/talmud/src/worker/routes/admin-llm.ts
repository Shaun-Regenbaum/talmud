/**
 * The two read-only LLM diagnostics endpoints: GET /api/admin/ai-gateway-test
 * (gateway config, plus an optional live probe) and GET /api/admin/llm-settings
 * (the effective model config and the preset catalog).
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import { gatewayActive, gatewayStatus } from '@corpus/core/llm/ai-gateway';
import { type LLMModelId, runLLM } from '@corpus/core/llm/llm';
import {
  DEFAULT_FALLBACK_CHAIN,
  DEFAULT_MODEL,
  isLLMModelId,
  MODEL_PRESETS,
} from '@corpus/core/llm/settings';
import type { Hono } from 'hono';
import type { Bindings } from '../types';

export function registerAdminLlmRoutes(app: Hono<{ Bindings: Bindings }>): void {
  // AI Gateway smoke test. Reports gateway config + routes a tiny Kimi prompt
  // through whichever path is active (gateway when configured, else binding).
  // Append ?run=1 to actually invoke; bare GET just shows status. env.AI here
  // is already the proxied version when the gateway is active, so this hits
  // the same code path as every other AI call in the worker.
  app.get('/api/admin/ai-gateway-test', async (c) => {
    const status = gatewayStatus(c.env);
    if (c.req.query('run') !== '1') return c.json({ status, hint: 'append ?run=1 to invoke' });
    const explicitModel = c.req.query('model');
    const nonce = c.req.query('nonce') || '';
    try {
      const result = await runLLM(c.env, {
        // omit model when no override → runLLM resolves from settings KV.
        ...(explicitModel ? { model: explicitModel as LLMModelId } : {}),
        messages: [
          { role: 'system', content: 'Reply with the single word OK and nothing else.' },
          { role: 'user', content: `Ping${nonce ? ` ${nonce}` : ''}.` },
        ],
        max_tokens: 16,
        temperature: 0,
        tag: 'gateway-test',
        attribution: { kind: 'other', producerId: 'gateway-test' },
      });
      return c.json({
        status,
        route: gatewayActive(c.env) ? 'gateway' : 'binding',
        transport: result.transport,
        model: result.model,
        attempts: result.attempts,
        ms: result.elapsed_ms,
        usage: result.usage,
        reply: result.content,
      });
    } catch (err) {
      return c.json(
        {
          status,
          route: gatewayActive(c.env) ? 'gateway' : 'binding',
          explicitModel: explicitModel ?? null,
          error: String((err as Error)?.message ?? err),
        },
        500,
      );
    }
  });

  /**
   * LLM model config — READ-ONLY. There is no runtime settings store anymore;
   * the default model + fallback are code constants (settings.ts) optionally
   * overridden per-deploy by the DEFAULT_LLM_MODEL env var, and each
   * mark/enrichment pins its own model. This endpoint just surfaces the
   * effective config (for display) + the preset catalog (for the probe tool).
   */
  app.get('/api/admin/llm-settings', (c) => {
    const fromEnv = c.env.DEFAULT_LLM_MODEL;
    const defaultModel = isLLMModelId(fromEnv) ? fromEnv : DEFAULT_MODEL;
    return c.json({
      settings: {
        defaultModel,
        fallbackChain: DEFAULT_FALLBACK_CHAIN,
        source: isLLMModelId(fromEnv)
          ? 'env (wrangler.toml DEFAULT_LLM_MODEL)'
          : 'code (settings.ts)',
        editable: false,
      },
      presets: MODEL_PRESETS,
    });
  });
}
