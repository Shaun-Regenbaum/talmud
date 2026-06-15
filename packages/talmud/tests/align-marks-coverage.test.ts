import { describe, expect, it } from 'vitest';
import { CODE_MARKS } from '../src/worker/code-marks';
import { ALIGN_EXCLUDED, ALIGN_MARKS, alignAnchorOf } from '../src/worker/mark-categories';

/**
 * Guards the alignment workbench / GET /api/marks against silent drift: every
 * code mark must be either categorized for the workbench (ALIGN_MARKS, derived
 * by anchor) or explicitly excluded (ALIGN_EXCLUDED). Adding a new mark without
 * doing one of those fails here — which is how `geography` slipped out of the
 * workbench before.
 */
describe('alignment mark coverage', () => {
  it('every code mark is categorized for alignment or explicitly excluded', () => {
    const categorized = new Set(ALIGN_MARKS.map((m) => m.id));
    const uncovered = CODE_MARKS.map((m) => m.id).filter(
      (id) => !categorized.has(id) && !ALIGN_EXCLUDED.has(id),
    );
    expect(uncovered).toEqual([]);
  });

  it('every non-excluded mark maps to a known alignment anchor bucket', () => {
    const unknown = CODE_MARKS.filter(
      (m) => !ALIGN_EXCLUDED.has(m.id) && alignAnchorOf(m.anchor) === null,
    ).map((m) => `${m.id}:${m.anchor}`);
    expect(unknown).toEqual([]);
  });

  it('exclusions reference real marks (no stale ids)', () => {
    const ids = new Set(CODE_MARKS.map((m) => m.id));
    expect([...ALIGN_EXCLUDED].filter((id) => !ids.has(id))).toEqual([]);
  });

  it('ALIGN_MARKS and ALIGN_EXCLUDED are disjoint', () => {
    expect(ALIGN_MARKS.filter((m) => ALIGN_EXCLUDED.has(m.id))).toEqual([]);
  });

  it('whole-daf computed marks (incl. geography) are surfaced', () => {
    const byId = new Map(ALIGN_MARKS.map((m) => [m.id, m]));
    for (const id of ['geography', 'daf-background', 'tidbit', 'biyun', 'argument-overview']) {
      expect(byId.get(id)?.anchorBy).toBe('whole-daf');
    }
  });
});
