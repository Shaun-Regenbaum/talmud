/**
 * Word / phrase translation. The reader selects Hebrew in the text (double-click
 * a word, or drag across a phrase) and gets a concise English gloss. Context
 * (the surrounding verse) is passed so a word is translated in the sense it has
 * here. Cached per normalized selection.
 *
 * DELIBERATELY NOT migrated onto runProducer/ArtifactStore (the only one of the
 * five producers left on bespoke plumbing): its cache stores a RAW STRING with
 * a 30-day TTL — both incompatible with the StoredArtifact envelope and the
 * store's no-TTL contract (decided at the tanach migration stage; also locked
 * in core's key-schemes tests, which exclude translate:v1 from the template
 * scheme). The producer is still DECLARED in producers/defs.ts so the registry
 * is complete; this module remains its live implementation.
 */

import { type LLMEnv, runLLM } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface TranslateResult {
  translation: string;
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

export const TRANSLATE_SYSTEM = [
  'You translate Biblical Hebrew into concise, plain English.',
  '',
  'You are given a word or short phrase (it may carry niqqud and cantillation)',
  'and, when available, the verse it comes from for context. Return ONLY the',
  'English translation — a word or short phrase, in the sense it carries in this',
  'context. No explanation, no transliteration, no notes.',
].join('\n');

/** DESCRIPTIVE template for the registry (the live call below builds the same
 *  prompt by hand — this producer does not run through runProducer). */
export const TRANSLATE_USER_TEMPLATE = 'Hebrew: {{q}}{{context_suffix}}';

export const TRANSLATE_SCHEMA = {
  name: 'translation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['translation'],
    properties: { translation: { type: 'string' } },
  },
};

/**
 * The gloss is a single short phrase, so we ask for plain text rather than a
 * strict json_schema — the cheap Flash model behind this route does not reliably
 * honour strict structured output and was silently returning unparseable content
 * (empty -> 502 "No translation" on every lookup). Tolerate every shape we might
 * still get back: plain text, a markdown code fence, a raw JSON object, or a
 * quoted string, so a well-formed answer is never dropped on the floor.
 */
function extractGloss(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  // Strip a leading/trailing markdown code fence.
  s = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  // If the model wrapped it as {"translation": "..."}, pull the field out.
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s) as { translation?: unknown };
      if (typeof obj.translation === 'string') s = obj.translation;
    } catch {
      /* not JSON after all; fall through to the raw text */
    }
  }
  // Drop surrounding quotes the model sometimes adds, and collapse whitespace.
  return s
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function translateHebrew(
  env: LLMEnv,
  q: string,
  context: string,
): Promise<TranslateResult> {
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: TRANSLATE_SYSTEM },
      { role: 'user', content: `Hebrew: ${q}${context ? `\n\nFrom this verse: ${context}` : ''}` },
    ],
    max_tokens: 120,
    temperature: 0.2,
    tag: 'tanach:translate',
  });

  const translation = extractGloss(res.content);

  return {
    translation,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
  };
}
