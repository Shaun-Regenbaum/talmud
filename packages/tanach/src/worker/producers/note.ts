/**
 * The "section note" enrichment — the second Tanach smart-note.
 *
 * Composes on the events mark: given a section (a verse range the events
 * producer delimited) it writes a short plain-language p'shat note about what
 * happens there, in both English and Hebrew. Rendered when the reader clicks a
 * margin anchor. Strictly plain sense — no midrash, no homily.
 */

import { type LLMEnv, runLLM } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface NoteResult {
  en: string;
  he: string;
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

const SYSTEM = [
  'You write a short note explaining what happens in a passage of the Hebrew',
  "Bible, on the p'shat (plain, contextual) level — for a reader who just",
  'arrived at this section.',
  '',
  'Rules:',
  '- 2 to 3 sentences. Plain and concrete: what plainly happens, and what the',
  '  text means in its own context.',
  "- Strictly p'shat. No midrash, no homily, no theology, no commentary debates,",
  '  no quoting commentators.',
  '- Do not just restate the verses — orient and explain plainly.',
  '- Give the note in BOTH English ("en") and natural, fluent Hebrew ("he").',
].join('\n');

const SCHEMA = {
  name: 'section_note',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};

export async function sectionNote(
  env: LLMEnv,
  ref: string,
  label: string,
  versesText: string,
): Promise<NoteResult> {
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Passage: ${ref}${label ? ` — "${label}"` : ''}\n\n${versesText}` },
    ],
    max_tokens: 700,
    temperature: 0.3,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:note',
  });

  let en = '';
  let he = '';
  try {
    const p = JSON.parse(res.content) as { en?: string; he?: string };
    en = String(p.en ?? '').trim();
    he = String(p.he ?? '').trim();
  } catch {
    /* leave empty */
  }

  return {
    en,
    he,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
  };
}
