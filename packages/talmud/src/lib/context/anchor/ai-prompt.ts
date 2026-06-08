/**
 * @fileoverview AI segment-matcher prompt builder + response parser (pure).
 *
 * Given the daf as numbered segments and a batch of context items that sit at
 * whole-daf/amud level, ask an LLM which segment (or contiguous range) each
 * item most directly discusses. Kept free of Worker/LLM deps so the prompt and
 * the parse are unit-testable; the Worker side (`src/worker/context-match.ts`)
 * just wires this to runLLM.
 */

import type { SegMatch } from '@corpus/core/context/match';
import { segRange } from '@corpus/core/context/match';

export interface MatchInput {
  key: string;
  /** Source label, e.g. "Insights", "Rishonim" — helps the model. */
  label: string;
  title?: string;
  /** Item prose; truncate before passing. */
  text?: string;
}

const SYS = `You align Talmud study-note items to the segments of a daf (page).
You are given the daf as a numbered list of Hebrew segments with English translation, and a list of items.
For EACH item, decide which segment (or contiguous range of segments) it most directly discusses or comments on.
Rules:
- Use the segment INDICES shown (0-based).
- Match by MEANING, not shared words: read the English translations to understand what each item is about, then pick the segment that discusses the same point — even when the item and the segment share no vocabulary (e.g. an English study note about a Hebrew line).
- Most study-note items DO comment on a specific line — localize whenever you reasonably can. Prefer the single best segment over a wide range.
- If an item maps to one segment, set segEnd = segStart.
- If it spans consecutive segments, set segStart..segEnd.
- Set segStart = null ONLY when the item genuinely concerns the whole daf (a general summary or methodology note) and no single segment fits best. This is a real "whole-daf" placement, not a failure — still give a confidence.
- confidence is 0..1 (how sure you are of the localization).
- "quote": copy 3-8 CONSECUTIVE words of HEBREW exactly as they appear in the chosen segment — the precise phrase the item is about — so it can be tightened onto the exact printed words. Do not translate, paraphrase, reorder, or merge non-adjacent words. Use "" when no contiguous phrase fits; the segment placement still stands.
Reply with ONLY JSON: {"matches":[{"key":"<key>","segStart":<int|null>,"segEnd":<int|null>,"confidence":<number>,"quote":"<hebrew or empty>"}]}`;

export function buildMatchPrompt(
  segmentsHe: string[],
  segmentsEn: string[],
  items: MatchInput[],
  opts: { maxSegChars?: number; maxItemChars?: number } = {},
): { system: string; user: string } {
  const { maxSegChars = 220, maxItemChars = 400 } = opts;
  const segLines = segmentsHe.map((he, i) => {
    const en = (segmentsEn[i] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxSegChars);
    const h = he.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxSegChars);
    return `[${i}] ${h}${en ? `\n     EN: ${en}` : ''}`;
  });
  const itemLines = items.map((it) => {
    const t = (it.text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxItemChars);
    const title = it.title ? ` — ${it.title}` : '';
    return `key=${it.key} (${it.label}${title}): ${t}`;
  });
  const user = `DAF SEGMENTS:\n${segLines.join('\n')}\n\nITEMS TO PLACE:\n${itemLines.join('\n')}`;
  return { system: SYS, user };
}

interface RawMatch { key?: unknown; segStart?: unknown; segEnd?: unknown; confidence?: unknown; quote?: unknown }

/** Parse the model's JSON into validated SegMatches. Drops unknown keys and
 *  out-of-range segments. An explicit null `segStart` is a deliberate whole-daf
 *  placement (kept, marked `wholeDaf`); a non-null but out-of-range index is junk
 *  (dropped). */
export function parseMatchResponse(content: string, validKeys: Set<string>, segCount: number): SegMatch[] {
  let parsed: { matches?: RawMatch[] };
  try { parsed = JSON.parse(content); } catch { return []; }
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const out: SegMatch[] = [];
  for (const m of matches) {
    if (typeof m.key !== 'string' || !validKeys.has(m.key)) continue;
    const confidence = typeof m.confidence === 'number' ? clamp01(m.confidence) : undefined;
    if (m.segStart == null) {
      // Explicit whole-daf grounding — a placement, not a drop.
      out.push({ key: m.key, segs: [], via: 'ai', wholeDaf: true, confidence });
      continue;
    }
    const start = toSeg(m.segStart, segCount);
    if (start == null) continue; // a number but out of range → junk
    const end = toSeg(m.segEnd, segCount);
    const quote = typeof m.quote === 'string' && m.quote.trim() ? m.quote.trim() : undefined;
    out.push({ key: m.key, segs: segRange(start, end != null && end >= start ? end : start), via: 'ai', confidence, quote });
  }
  return out;
}

function toSeg(v: unknown, segCount: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v >= segCount) return null;
  return v;
}
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
