// Minimal LLM support glue, moved out of index.ts so route modules can share
// it without importing the worker entry file (which would make a cycle).
// Intentionally compact - support glue, not architecture.

import { type CostAttribution, type LLMModelId, runLLM } from '@corpus/core/llm/llm';
import type { Bindings } from './types';

export interface StreamedResult {
  content: string;
  reasoning_content: string;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  } | null;
  finish_reason: string | null;
  prompt_chars: number;
  content_chars: number;
  reasoning_chars: number;
  elapsed_ms: number;
}

export function extractJsonPayload(resp: unknown): string {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  const r = resp as Record<string, unknown>;
  if (typeof r.response === 'string') return r.response;
  if (typeof r.content === 'string') return r.content;
  if (typeof r.text === 'string') return r.text;
  return '';
}

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function runKimiStreaming(
  env: Bindings,
  modelId: string,
  messages: KimiMessage[],
  maxTokens: number,
  opts?: {
    temperature?: number;
    chatTemplateKwargs?: { enable_thinking?: boolean };
    responseFormat?: unknown;
    tag?: string;
    attribution?: CostAttribution;
  },
): Promise<StreamedResult> {
  const t0 = Date.now();
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
  const enableThinking = opts?.chatTemplateKwargs?.enable_thinking;
  const r = await runLLM(env, {
    model: modelId as LLMModelId,
    messages,
    max_tokens: maxTokens,
    temperature: opts?.temperature ?? 0.1,
    thinking: typeof enableThinking === 'boolean' ? enableThinking : undefined,
    response_format: opts?.responseFormat as
      | { type: 'json_schema'; json_schema: unknown }
      | undefined,
    stream: true,
    tag: opts?.tag,
    attribution: opts?.attribution,
  });
  return {
    content: r.content,
    reasoning_content: r.reasoning_content ?? '',
    usage: r.usage as StreamedResult['usage'],
    finish_reason: r.finish_reason ?? null,
    prompt_chars: promptChars,
    content_chars: r.content.length,
    reasoning_chars: (r.reasoning_content ?? '').length,
    elapsed_ms: Date.now() - t0,
  };
}
