/**
 * anchor-verbatim severity is promoted to `hard` on the marks where it's proven
 * reliable (pesukim, aggadata — zero flags sampled across 23 dapim), so a flag
 * there gates the cache write (a genuine hallucination). It stays `soft` on
 * argument / argument-move, which still flag occasionally (boundary-spanning
 * excerpts) — observe-only there.
 */
import { describe, it, expect } from 'vitest';
import { runPasses, type PassCtx } from '../../src/lib/check/passes';

// seg 0 has the text; the instance claims its excerpt is in seg 1 (it isn't) → flagged.
const segs = ['תנו רבנן המביא גט', 'אמר רבא הלכה כרבי'];
const flagged = { instances: [{ startSegIdx: 0, fields: { excerpt: 'מילים שאינן שם' } }] };
const ctx = (defId: string): PassCtx => ({ tractate: 'Gittin', page: '67b', segmentsHe: segs, defId });

describe('anchor-verbatim per-mark severity', () => {
  it('is HARD on pesukim and aggadata', async () => {
    for (const defId of ['pesukim', 'aggadata']) {
      const { issues } = await runPasses(['anchor-verbatim'], structuredClone(flagged), ctx(defId));
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('hard');
    }
  });

  it('stays SOFT on argument and argument-move', async () => {
    for (const defId of ['argument', 'argument-move']) {
      const { issues } = await runPasses(['anchor-verbatim'], structuredClone(flagged), ctx(defId));
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('soft');
    }
  });
});
