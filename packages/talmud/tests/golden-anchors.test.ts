/**
 * Golden regression for the unified verbatim placer. For each captured mark
 * fixture, run the pure re-anchorer over the RAW LLM output and assert it
 * reproduces the RESOLVED anchors that production currently caches. This pins
 * the src/lib/place extraction to byte-identical behavior with the old inline
 * postProcessX functions, so A1 can land additively (no cache_version bump).
 *
 * Fixtures captured from talmud.shaunregenbaum.com (cache hits) into
 * tests/fixtures/golden-anchors/: <tractate>_<page>_<mark>.json = { raw,
 * expected }, plus gemara_<tractate>_<page>.json = the GemaraSlice.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  reanchorAggadata,
  reanchorArgument,
  reanchorArgumentMove,
  reanchorPesukim,
} from '../src/lib/place/reanchor';

const FIX_DIR = join(__dirname, 'fixtures', 'golden-anchors');

const REANCHOR: Record<string, (parsed: unknown, segs: string[]) => unknown> = {
  argument: reanchorArgument,
  'argument-move': reanchorArgumentMove,
  pesukim: reanchorPesukim,
  aggadata: reanchorAggadata,
};

interface Fixture {
  tractate: string;
  page: string;
  mark: string;
  raw: unknown;
  expected: unknown;
}

function loadSegments(tractate: string, page: string): string[] {
  const f = join(FIX_DIR, `gemara_${tractate.toLowerCase()}_${page}.json`);
  const slice = JSON.parse(readFileSync(f, 'utf8')) as { segments_he?: string[] };
  return slice.segments_he ?? [];
}

const files = readdirSync(FIX_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('gemara_'));

describe('golden anchors — unified verbatim placer matches production', () => {
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(FIX_DIR, file), 'utf8')) as Fixture;
    const fn = REANCHOR[fx.mark];
    if (!fn) continue; // rabbi etc. — not a verbatim re-anchorer
    it(`${fx.tractate} ${fx.page} · ${fx.mark}`, () => {
      const segs = loadSegments(fx.tractate, fx.page);
      expect(segs.length).toBeGreaterThan(0);
      const input = structuredClone(fx.raw);
      const out = fn(input, segs);
      expect(out).toEqual(fx.expected);
    });
  }
});
