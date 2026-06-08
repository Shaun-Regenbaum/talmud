/**
 * @fileoverview The source registry — the single declarative list of every
 * external source the context pool can contain.
 *
 * Adding a source to the app means adding ONE entry here (plus its cached
 * fetcher + `from*` mapper). Because `SOURCE_META` is typed as an exhaustive
 * `Record<ContextSource, SourceMeta>`, TypeScript refuses to compile if a
 * `ContextSource` is missing an entry or an entry names a source that isn't in
 * the union — so the registry can never silently drift from what the system
 * actually serves. That is the foundation for:
 *   - the alignment workbench rendering one row per *declared* source (an
 *     unwired/empty source shows up as "0 items", never silently absent), and
 *   - the coverage tests in `tests/context-sources.test.ts`.
 *
 * `label` is the canonical display name (the `sourceLabel` on emitted items —
 * except `sefaria-rishonim`, whose per-item label is the specific rishon's
 * name; here it's the group name). `anchor` / `defaultLevel` document how the
 * source is placed; they mirror the `via` strings written by the matchers in
 * `anchor/` and the grounding levels in `placement.ts`.
 */

import type { DafyomiContentType } from '../sefref/dafyomi/schema.ts';

/** Every external source the Talmud context pool can contain. The Talmud-side
 *  narrowing of the corpus-agnostic `ContextItem.source` string. `SOURCE_META`
 *  below is exhaustive over this union, so the registry can never drift. */
export type ContextSource =
  | 'sefaria-rashi'
  | 'sefaria-tosafot'
  | 'sefaria-rishonim'
  | 'sefaria-halacha'
  | 'sefaria-mishnah'
  | 'sefaria-topic'
  | `dafyomi:${DafyomiContentType}`;

/** How a source is anchored onto the text. Mirrors the `via` values the
 *  deterministic + AI matchers write. `none` = placed only by the AI placer. */
export type AnchorStrategy =
  | 'pieceKeys'        // parallel Sefaria "S:P" piece segmentation (Rashi/Tosafot)
  | 'sefaria-link'     // Sefaria's own link to the daf segment(s)
  | 'mishnah'          // Mishnah anchor range
  | 'tosfos-dh'        // dibur-hamaschil matched to a Sefaria tosafot pieceKey
  | 'bg-term'          // background girsa/glossary term quoted in a segment
  | 'yerushalmi-text'  // verbatim phrase shared with a Bavli segment
  | 'section'          // conservative English↔English section alignment (Revach)
  | 'reference'        // daf-level by nature (cross-refs, topic tags)
  | 'ai'               // placed by the AI semantic placer
  | 'none';            // unplaced until the AI placer runs

/** The coarsest grounding a source reaches before per-item matchers refine it. */
export type DefaultLevel = 'segment' | 'amud' | 'daf';

export interface SourceMeta {
  /** Canonical display label (the `sourceLabel` on emitted items). */
  label: string;
  /** Where the bytes come from. */
  origin: 'sefaria' | 'dafyomi';
  /** How items from this source get anchored. */
  anchor: AnchorStrategy;
  /** Grounding level when no finer matcher fires. */
  defaultLevel: DefaultLevel;
  /** Emits cross-text citations (`refs`/`coord`) rather than only in-daf segs. */
  cites?: boolean;
  /** One line: what it is. Shown in docs + the alignment source rail. */
  notes: string;
}

/** EXHAUSTIVE over `ContextSource`. TypeScript enforces one entry per source. */
export const SOURCE_META: Record<ContextSource, SourceMeta> = {
  'sefaria-rashi': {
    label: 'Rashi', origin: 'sefaria', anchor: 'pieceKeys', defaultLevel: 'segment',
    notes: "Rashi commentary text, one item per piece, placed on its segment via Sefaria's pieceKeys.",
  },
  'sefaria-tosafot': {
    label: 'Tosafot', origin: 'sefaria', anchor: 'pieceKeys', defaultLevel: 'segment',
    notes: 'Tosafot commentary text, one item per piece, placed on its segment via pieceKeys.',
  },
  'sefaria-rishonim': {
    label: 'Rishonim', origin: 'sefaria', anchor: 'sefaria-link', defaultLevel: 'segment',
    notes: "Other rishonim (Rashba, Ritva, Rosh, …); per-item label is the rishon's name.",
  },
  'sefaria-halacha': {
    label: 'Halacha', origin: 'sefaria', anchor: 'reference', defaultLevel: 'daf', cites: true,
    notes: 'Halachic codifications (Mishneh Torah, Shulchan Aruch, …) linked to this daf.',
  },
  'sefaria-mishnah': {
    label: 'Mishnah', origin: 'sefaria', anchor: 'mishnah', defaultLevel: 'segment',
    notes: 'Mishnayot anchored to the daf on a segment range.',
  },
  'sefaria-topic': {
    label: 'Topic', origin: 'sefaria', anchor: 'reference', defaultLevel: 'daf', cites: true,
    notes: 'Sefaria topic tags + their cross-Shas sources — whole-daf reference.',
  },
  'dafyomi:insights': {
    label: 'Insights', origin: 'dafyomi', anchor: 'ai', defaultLevel: 'daf',
    notes: 'Kollel Iyun HaDaf insights — placed by the AI placer.',
  },
  'dafyomi:background': {
    label: 'Background', origin: 'dafyomi', anchor: 'bg-term', defaultLevel: 'daf',
    notes: 'Girsa variants + glossary terms; placed onto the segment that quotes the term.',
  },
  'dafyomi:halacha': {
    label: 'Halacha', origin: 'dafyomi', anchor: 'ai', defaultLevel: 'daf', cites: true,
    notes: 'Practical halachic rules (Gemara/Rishonim/Poskim).',
  },
  'dafyomi:tosfos': {
    label: 'Tosafot explanation', origin: 'dafyomi', anchor: 'tosfos-dh', defaultLevel: 'amud',
    notes: "The Kollel's explanation OF Tosafot; placed via the dibur-hamaschil → Sefaria pieceKey.",
  },
  'dafyomi:review': {
    label: 'Review', origin: 'dafyomi', anchor: 'ai', defaultLevel: 'amud',
    notes: 'Review questions for the amud.',
  },
  'dafyomi:points': {
    label: 'Points', origin: 'dafyomi', anchor: 'ai', defaultLevel: 'amud',
    notes: 'Key conceptual points for the amud.',
  },
  'dafyomi:hebcharts': {
    label: 'Charts', origin: 'dafyomi', anchor: 'ai', defaultLevel: 'amud',
    notes: 'Hebrew comparison tables; kept structured so the card renders a real table.',
  },
  'dafyomi:yerushalmi': {
    label: 'Yerushalmi', origin: 'dafyomi', anchor: 'yerushalmi-text', defaultLevel: 'daf',
    notes: 'Yerushalmi parallels; placed onto the Bavli segment sharing a verbatim phrase.',
  },
  'dafyomi:revach': {
    label: "Revach l'Daf", origin: 'dafyomi', anchor: 'section', defaultLevel: 'daf', cites: true,
    notes: "Revach l'Daf brief per-daf highlights; conservatively aligned to argument sections.",
  },
};

/** Every declared source id, in registry order. */
export const SOURCES = Object.keys(SOURCE_META) as ContextSource[];

/** Canonical label for a source (the registry is the single source of truth). */
export function sourceLabel(source: ContextSource): string {
  return SOURCE_META[source].label;
}
