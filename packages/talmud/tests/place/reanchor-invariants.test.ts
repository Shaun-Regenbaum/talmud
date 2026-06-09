/**
 * Structural-invariant + idempotency guards for the re-anchorers. These catch
 * regressions that a value-diff golden might miss: e.g. a future matcher change
 * that still resolves *somewhere* but breaks clean partitioning, leaves moves
 * outside their section, or produces unstable (non-idempotent) output.
 *
 * Runs over the captured golden fixtures (resolved production output).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  reanchorAggadata,
  reanchorArgument,
  reanchorArgumentMove,
  reanchorPesukim,
} from '../../src/lib/place/reanchor';

const FIX_DIR = join(__dirname, '..', 'fixtures', 'golden-anchors');
const REANCHOR: Record<string, (p: unknown, s: string[]) => unknown> = {
  argument: reanchorArgument,
  'argument-move': reanchorArgumentMove,
  pesukim: reanchorPesukim,
  aggadata: reanchorAggadata,
};

interface Inst {
  startSegIdx?: number;
  endSegIdx?: number;
  fields?: Record<string, unknown>;
}
interface Fixture {
  tractate: string;
  page: string;
  mark: string;
  expected: { instances?: Inst[] };
}

function segsFor(tractate: string, page: string): string[] {
  const s = JSON.parse(
    readFileSync(join(FIX_DIR, `gemara_${tractate.toLowerCase()}_${page}.json`), 'utf8'),
  );
  return s.segments_he ?? [];
}

const fixtures = readdirSync(FIX_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('gemara_'))
  .map((f) => JSON.parse(readFileSync(join(FIX_DIR, f), 'utf8')) as Fixture)
  .filter((fx) => REANCHOR[fx.mark]);

describe('re-anchor idempotency — re-running on resolved output is stable', () => {
  for (const fx of fixtures) {
    it(`${fx.tractate} ${fx.page} · ${fx.mark}`, () => {
      const segs = segsFor(fx.tractate, fx.page);
      const once = REANCHOR[fx.mark](structuredClone(fx.expected), segs);
      const twice = REANCHOR[fx.mark](structuredClone(once), segs);
      expect(twice).toEqual(once);
    });
  }
});

describe('re-anchor structural invariants', () => {
  const lastSegFor = (tractate: string, page: string) => segsFor(tractate, page).length - 1;

  for (const fx of fixtures) {
    const insts = fx.expected.instances ?? [];
    const lastSeg = lastSegFor(fx.tractate, fx.page);

    it(`${fx.tractate} ${fx.page} · ${fx.mark}: ranges are in-bounds and ordered`, () => {
      for (const inst of insts) {
        const a = inst.startSegIdx ?? -1;
        const b = inst.endSegIdx ?? -1;
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(a);
        expect(b).toBeLessThanOrEqual(lastSeg);
      }
    });

    if (fx.mark === 'argument') {
      it(`${fx.tractate} ${fx.page} · argument: sections partition the daf with no gaps/overlaps`, () => {
        let prevEnd = -1;
        for (const inst of insts) {
          expect(inst.startSegIdx).toBe(prevEnd + 1); // contiguous tiling
          prevEnd = inst.endSegIdx ?? prevEnd;
        }
        if (insts.length > 0) expect(prevEnd).toBe(lastSeg); // covers through the end
      });
    }

    if (fx.mark === 'argument-move') {
      it(`${fx.tractate} ${fx.page} · argument-move: moves stay within their section + carry token offsets`, () => {
        for (const inst of insts) {
          const f = inst.fields ?? {};
          const sStart = f.sectionStartSegIdx as number;
          const sEnd = f.sectionEndSegIdx as number;
          expect(inst.startSegIdx).toBeGreaterThanOrEqual(sStart);
          expect(inst.endSegIdx).toBeLessThanOrEqual(sEnd);
          expect(typeof f.tokenStart).toBe('number');
          expect(typeof f.tokenEnd).toBe('number');
        }
      });
    }

    if (fx.mark === 'pesukim' || fx.mark === 'aggadata') {
      it(`${fx.tractate} ${fx.page} · ${fx.mark}: token offsets are ordered when present`, () => {
        for (const inst of insts) {
          const f = inst.fields ?? {};
          if (
            typeof f.tokenStart === 'number' &&
            typeof f.tokenEnd === 'number' &&
            inst.startSegIdx === inst.endSegIdx
          ) {
            expect(f.tokenEnd as number).toBeGreaterThanOrEqual(f.tokenStart as number);
          }
        }
      });
    }
  }
});
