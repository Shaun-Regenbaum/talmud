/**
 * @fileoverview The seam that makes "everything is potential context."
 *
 * Given the unified ContextItem pool for a daf and a target's segments (a mark
 * instance's location, or `[]` for a whole-daf synthesis), `contextForAnchor`
 * returns the relevant slice and `formatContextForPrompt` renders it for an LLM
 * prompt. A future `context` enrichment-dependency resolves the pool, calls
 * `contextForAnchor` with the instance's segments, and injects `{{context}}`.
 */

import { citationLink, linkLabel } from './link.ts';
import type { ContextItem } from './types.ts';
import { rangeLabel } from './types.ts';

export interface ContextSelectOpts {
  /** Restrict to these sources. Default: all. */
  sources?: ContextItem['source'][];
  /** Include whole-daf items (segs:[]) even for a segment-scoped target.
   *  Default true — daf-level context (topics, rishonim) is usually relevant. */
  includeWholeDaf?: boolean;
}

/** The target segments an enrichment instance covers, from its mark-input
 *  location (`startSegIdx`..`endSegIdx`). Returns `[]` when there's no segment
 *  location (a whole-daf instance) — which `contextForAnchor` treats as "all".
 *  So a section enrichment gets its own slice; a whole-daf one gets everything. */
export function segsFromMarkInput(markInput: unknown): number[] {
  const m =
    markInput && typeof markInput === 'object' ? (markInput as Record<string, unknown>) : null;
  if (!m) return [];
  const start =
    typeof m.startSegIdx === 'number'
      ? m.startSegIdx
      : typeof m.endSegIdx === 'number'
        ? m.endSegIdx
        : null;
  const end =
    typeof m.endSegIdx === 'number'
      ? m.endSegIdx
      : typeof m.startSegIdx === 'number'
        ? m.startSegIdx
        : null;
  if (start === null || end === null) return [];
  const out: number[] = [];
  for (let s = Math.max(0, Math.min(start, end)); s <= Math.max(start, end); s++) out.push(s);
  return out;
}

/** Items relevant to a target. `targetSegs: []` (whole daf) returns everything.
 *  Otherwise: whole-daf items are in (unless disabled), and segment items are
 *  in when they overlap the target. */
export function contextForAnchor(
  items: ContextItem[],
  targetSegs: number[],
  opts: ContextSelectOpts = {},
): ContextItem[] {
  const { sources, includeWholeDaf = true } = opts;
  const want = targetSegs.length ? new Set(targetSegs) : null;
  return items.filter((it) => {
    if (sources && !sources.includes(it.source)) return false;
    if (it.segs.length === 0) return includeWholeDaf; // whole-daf item
    if (!want) return true; // whole-daf target wants all
    return it.segs.some((s) => want.has(s));
  });
}

export interface FormatOpts {
  /** Max characters of each item's body. Default 600. */
  maxBody?: number;
  /** Max items per source group. Default 20. */
  maxPerSource?: number;
}

/** Render selected items as grouped plain text for an LLM prompt. */
export function formatContextForPrompt(items: ContextItem[], opts: FormatOpts = {}): string {
  const { maxBody = 600, maxPerSource = 20 } = opts;
  const groups = new Map<string, ContextItem[]>();
  for (const it of items) {
    const g = groups.get(it.sourceLabel) ?? [];
    if (g.length < maxPerSource) g.push(it);
    groups.set(it.sourceLabel, g);
  }
  const blocks: string[] = [];
  for (const [label, group] of groups) {
    const lines = group.map((it) => {
      const title = it.title?.en || it.title?.he || '';
      const body = (it.body?.en || it.body?.he || '').replace(/\s+/g, ' ').trim().slice(0, maxBody);
      const head = [`[${rangeLabel(it.segs, it.amud)}]`, title].filter(Boolean).join(' ');
      const cites = linkLabel(citationLink(it.refs));
      return `- ${head}${body ? `: ${body}` : ''}${cites ? ` (cites ${cites})` : ''}`;
    });
    blocks.push(`## ${label}\n${lines.join('\n')}`);
  }
  return blocks.join('\n\n');
}
