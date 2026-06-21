import { describe, expect, it } from 'vitest';
import type { RishonimBundle } from '../src/lib/sefref/sefaria/client';
import { capRishonimBundle } from '../src/worker/source-cache';

// Memory regression guard. The cold-daf isolate OOM was driven by the rishonim
// bundle: a few long commentators (Shita Mekubetzet, Maharsha) concatenated with
// NO cap pushed a generation job past the 128 MB isolate limit. capRishonimBundle
// must bound each comment's text so the bundle — and the slice/context derived
// from it — can't scale with daf density. If this budget is ever loosened, the
// OOM can return; this test fails first.
const HE_CAP = 8_000;
const EN_CAP = 10_000;

function comment(over: Partial<RishonimBundle[number]>): RishonimBundle[number] {
  return { label: 'Maharsha', ref: 'x', hebrew: '', english: '', segStart: 0, segEnd: 0, ...over };
}

describe('capRishonimBundle', () => {
  it('bounds a pathologically long comment to the per-language caps', () => {
    const huge = capRishonimBundle([
      comment({ hebrew: 'א'.repeat(200_000), english: 'a'.repeat(200_000) }),
    ]);
    expect(huge[0].hebrew.length).toBeLessThanOrEqual(HE_CAP + 16); // + " …[trimmed]"
    expect(huge[0].english.length).toBeLessThanOrEqual(EN_CAP + 16);
    expect(huge[0].hebrew).toContain('[trimmed]');
  });

  it('keeps the total bundle footprint O(#comments × cap), not O(daf density)', () => {
    const dense: RishonimBundle = Array.from({ length: 60 }, (_, i) =>
      comment({ label: `r${i}`, hebrew: 'א'.repeat(50_000), english: 'a'.repeat(50_000) }),
    );
    const capped = capRishonimBundle(dense);
    const bytes = capped.reduce((n, c) => n + c.hebrew.length + c.english.length, 0);
    // 60 comments × ~18k = ~1.1MB ceiling — vs ~6MB uncapped. Bounded by the cap.
    expect(bytes).toBeLessThan(60 * (HE_CAP + EN_CAP + 32));
    // Sanity: the same input uncapped would be ~6MB, far over the ceiling.
    expect(60 * 100_000).toBeGreaterThan(bytes * 4);
  });

  it('leaves ordinary comments untouched and returns the SAME array (no realloc)', () => {
    const normal: RishonimBundle = [
      comment({ label: 'Rashba', hebrew: 'א'.repeat(1_200), english: 'a'.repeat(900) }),
      comment({ label: 'Ritva', hebrew: 'ב'.repeat(800), english: 'b'.repeat(700) }),
    ];
    const out = capRishonimBundle(normal);
    expect(out).toBe(normal); // identity preserved when nothing exceeds the cap
    expect(out[0].hebrew).toBe('א'.repeat(1_200));
  });

  it('handles missing/empty text fields safely', () => {
    const out = capRishonimBundle([
      comment({ hebrew: '', english: '' }),
      comment({ hebrew: undefined as unknown as string, english: undefined as unknown as string }),
    ]);
    expect(out[0].hebrew).toBe('');
    expect(out[1].hebrew ?? '').toBe('');
  });
});
