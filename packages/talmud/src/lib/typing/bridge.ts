/**
 * @fileoverview Cross-daf sugya bridge — does the discussion at the END of one
 * daf continue into the START of the next? This is the boundary-finder the
 * cross-page sugya map needs: combined with the per-daf flow (argument-overview),
 * a `continues` bridge marks where two dapim's sections join into one sugya that
 * spans the page break (Shabbat 125b–126b).
 *
 * Two-tier, cheap-first:
 *   - DETERMINISTIC: a Hadran ("הדרן עלך …") at the end of the from-daf means the
 *     perek closed there, so the sugya cannot continue — no LLM (hadranBridge).
 *   - LLM: otherwise, judge the boundary from the two sections' summaries +
 *     verbatim closing/opening text. The prompt is built here (pure, testable);
 *     the call itself is in the worker.
 *
 * Pure + DOM-free.
 */

import type { DafRef } from '@corpus/core/context/coord';

export type BridgeKind = 'continues' | 'perek-boundary' | 'new-topic';

export interface DafBridge {
  from: DafRef;
  /** The next amud, or null at the end of the tractate. */
  to: DafRef | null;
  /** Does the from-daf's closing discussion carry into the to-daf? */
  continues: boolean;
  kind: BridgeKind;
  via: 'hadran' | 'llm' | 'edge-of-tractate' | 'no-data';
  note?: string;
}

export interface BridgeSection {
  title?: string;
  summary?: string;
  excerpt?: string;
}

/** No next daf (tractate end) → no bridge. */
export function edgeOfTractateBridge(from: DafRef): DafBridge {
  return { from, to: null, continues: false, kind: 'new-topic', via: 'edge-of-tractate' };
}

/** Deterministic short-circuit: a Hadran ending the from-daf closes the perek,
 *  so the sugya does NOT continue — skip the LLM. Returns null when there's no
 *  Hadran (caller falls through to the LLM judgement). */
export function hadranBridge(
  from: DafRef,
  to: DafRef,
  fromEndsWithHadran: boolean,
): DafBridge | null {
  if (!fromEndsWithHadran) return null;
  return {
    from,
    to,
    continues: false,
    kind: 'perek-boundary',
    via: 'hadran',
    note: 'Hadran — perek boundary',
  };
}

/** The LLM prompt judging whether the boundary continues. Pure string assembly
 *  so it's unit-testable; the worker runs it through runLLM. */
export function buildBridgePrompt(prev: BridgeSection, next: BridgeSection): string {
  return [
    'Two consecutive dapim of Talmud. Decide whether the discussion at the END of the first daf continues directly into the START of the second, or the second begins a new topic.',
    '',
    `END of daf 1 — section "${prev.title ?? ''}":`,
    prev.summary ?? '',
    `closing text: ${prev.excerpt ?? ''}`,
    '',
    `START of daf 2 — section "${next.title ?? ''}":`,
    next.summary ?? '',
    `opening text: ${next.excerpt ?? ''}`,
    '',
    "Set continues=true ONLY if daf 2 directly carries forward daf 1's same discussion / sugya thread (not merely the same tractate or a loosely related theme). Answer per the schema.",
  ].join('\n');
}

/** Build a DafBridge from the LLM verdict. */
export function llmBridge(
  from: DafRef,
  to: DafRef,
  verdict: { continues?: unknown; note?: unknown },
): DafBridge {
  const continues = verdict?.continues === true;
  return {
    from,
    to,
    continues,
    kind: continues ? 'continues' : 'new-topic',
    via: 'llm',
    note: typeof verdict?.note === 'string' ? verdict.note : undefined,
  };
}
