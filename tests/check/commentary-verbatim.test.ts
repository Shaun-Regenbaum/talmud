/**
 * commentary-verbatim (#8): a cited Rashi/Tosafot Hebrew quote must actually
 * appear in the daf's real commentary text — catches invented citations
 * (quote-or-omit). Soft / observe-only.
 */
import { describe, it, expect } from 'vitest';
import { runPasses, type PassCtx, type CheckIssue } from '../../src/lib/check/passes';

// The daf's real Rashi/Tosafot (one entry per commentator).
const commentaryHe = [
  'רש"י: המביא גט ממדינת הים צריך לומר בפני נכתב ובפני נחתם',
  'תוספות: והא דאמרינן בעינן שיאמר בפני נכתב',
];
const ctx = (over: Partial<PassCtx> = {}): PassCtx =>
  ({ tractate: 'Gittin', page: '2a', segmentsHe: [], commentaryHe, defId: 'argument-move.commentaries', ...over });
const kinds = (i: CheckIssue[]) => i.map((x) => x.kind);

describe('commentary-verbatim', () => {
  it('passes when the cited Hebrew quote is in the real commentary', async () => {
    const parsed = { rashi: 'Rashi explains that בפני נכתב ובפני נחתם is required.', tosafot: '', other: '' };
    const { issues } = await runPasses(['commentary-verbatim'], parsed, ctx());
    expect(issues).toEqual([]);
  });

  it('flags an invented Hebrew quote not present in the commentary', async () => {
    const parsed = { rashi: 'Rashi says הדבר תלוי במחלוקת אביי ורבא about this.', tosafot: '', other: '' };
    const { issues } = await runPasses(['commentary-verbatim'], parsed, ctx());
    expect(kinds(issues)).toEqual(['invented-commentary-quote']);
    expect(issues[0].severity).toBe('soft');
    expect(issues[0].detail).toBe('rashi');
  });

  it('ignores short (1-2 word) Hebrew terms — those are glosses, not citations', async () => {
    const parsed = { rashi: 'A point about תרומה and גט.', tosafot: '', other: '' };
    const { issues } = await runPasses(['commentary-verbatim'], parsed, ctx());
    expect(issues).toEqual([]);
  });

  it('checks all of rashi/tosafot/other', async () => {
    const parsed = { rashi: '', tosafot: 'Tosafot: מילים שלא נכתבו כאן בכלל', other: '' };
    const { issues } = await runPasses(['commentary-verbatim'], parsed, ctx());
    expect(kinds(issues)).toEqual(['invented-commentary-quote']);
    expect(issues[0].detail).toBe('tosafot');
  });

  it('skips when no commentary is loaded (can\'t judge → no false positives)', async () => {
    const parsed = { rashi: 'Rashi says הדבר תלוי במחלוקת אביי ורבא.', tosafot: '', other: '' };
    const { issues } = await runPasses(['commentary-verbatim'], parsed, ctx({ commentaryHe: [] }));
    expect(issues).toEqual([]);
  });
});
