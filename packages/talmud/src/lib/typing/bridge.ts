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

// --- Jev (TypeSafe System One) path -----------------------------------------
// The bridge is one yes/no judgment, so it maps onto a single Noul: the
// probability that the sugya carries across the page break. The worker tries
// this first and keeps the prompt above as the fallback. `via` stays 'llm'
// (a model judged it); the probability is recorded in `note`.

/** p(continues) at/above which the boundary counts as continuing. Precision
 *  over recall: a false "continues" stitches two unrelated sugyot together. */
export const BRIDGE_CONTINUES_MIN = 0.6;

export function buildBridgeJevRequest(prev: BridgeSection, next: BridgeSection) {
  return {
    state: {
      end_of_first_daf: {
        section_title: prev.title ?? '',
        summary: prev.summary ?? '',
        closing_text: prev.excerpt ?? '',
      },
      start_of_second_daf: {
        section_title: next.title ?? '',
        summary: next.summary ?? '',
        opening_text: next.excerpt ?? '',
      },
    },
    questions: {
      continues: {
        type: 'noul' as const,
        instructions:
          'Two consecutive pages (dapim) of Talmud. `end_of_first_daf` is the last argument section of the first page; `start_of_second_daf` is the first section of the next page. Does the discussion at the end of the first page continue DIRECTLY into the start of the second, carrying forward the same sugya thread?',
        criteria: {
          true: 'Yes: the second page picks up the same discussion, question, or dispute where the first page left off (its next step, answer, or objection).',
          false:
            'No: the second page begins a new topic. Sharing the tractate, a loosely related theme, or the same sages is NOT enough.',
        },
      },
    },
  };
}

/** Build a DafBridge from Jev's p(continues). */
export function jevBridge(
  from: DafRef,
  to: DafRef,
  pContinues: number,
  min: number = BRIDGE_CONTINUES_MIN,
): DafBridge {
  const continues = pContinues >= min;
  return {
    from,
    to,
    continues,
    kind: continues ? 'continues' : 'new-topic',
    via: 'llm',
    note: `p(continues)=${pContinues.toFixed(2)}`,
  };
}
