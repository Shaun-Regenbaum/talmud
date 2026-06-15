/**
 * Which marks the alignment workbench (`/api/marks` → AlignPage) lists, and how
 * each anchors. DERIVED from CODE_MARKS by the mark's own `anchor`, so a newly
 * added mark can never be silently omitted (geography once was). The coverage
 * test (tests/align-marks-coverage.test.ts) fails if a mark is neither
 * categorized here nor explicitly excluded below.
 */

import { CODE_MARKS } from './code-marks';

/** The mark's anchor, projected to the workbench's three display buckets. */
export type AlignAnchor = 'segment' | 'name' | 'whole-daf';

/** Marks deliberately NOT surfaced in the workbench. Keep tiny + documented —
 *  the coverage test forces a conscious decision for every new mark. */
export const ALIGN_EXCLUDED: ReadonlySet<string> = new Set<string>([
  // The sub-move layer of `argument`; the workbench shows the section layer.
  'argument-move',
]);

/** Map a mark's `anchor` onto an alignment bucket; null = unknown anchor type
 *  (the coverage test flags it so it can't slip through uncategorized). */
export function alignAnchorOf(anchor: string): AlignAnchor | null {
  if (anchor === 'segment' || anchor === 'segment-range') return 'segment';
  if (anchor === 'phrase' || anchor === 'name') return 'name';
  if (anchor === 'whole-daf') return 'whole-daf';
  return null;
}

// `kind` drives the gutter icon/color in the workbench — mostly the id, a few
// aliases where the icon key differs from the mark id.
const KIND_ALIAS: Record<string, string> = { pesukim: 'pesuk', places: 'place' };

export interface AlignMarkEntry {
  id: string;
  kind: string;
  anchorBy: AlignAnchor;
}

/** Every mark the workbench lists, derived from CODE_MARKS by anchor. */
export const ALIGN_MARKS: AlignMarkEntry[] = CODE_MARKS.flatMap((m) => {
  if (ALIGN_EXCLUDED.has(m.id)) return [];
  const anchorBy = alignAnchorOf(m.anchor);
  return anchorBy ? [{ id: m.id, kind: KIND_ALIAS[m.id] ?? m.id, anchorBy }] : [];
});
