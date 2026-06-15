import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment } from '../src/worker/cache-keys';

// The root cause of the inspector's false misses: a per-instance enrichment is
// cached under a key whose instance_id derives — via instanceIdOf — from the
// rich mark_input the reader warms with (e.g. fields.verseRef). The inspector
// used the whole-daf placeholder {fields:{}} instead, which can NEVER reproduce
// that id. These tests pin the invariant the fix relies on: instanceIdOf is
// shape-tolerant (reader mark_input and stored mark instance agree), and the
// {fields:{}} probe is provably a different key.
describe('per-instance key parity — reader mark_input vs stored instance', () => {
  it('verseRef-bearing instances share an id regardless of surrounding fields', async () => {
    // What pasukInstance() warms vs what the mark stores (same verseRef, extra fields differ).
    const reader = {
      startSegIdx: 7,
      endSegIdx: 7,
      fields: { verseRef: 'Deuteronomy 6:7', excerpt: 'x', summary: 'y' },
    };
    const stored = { startSegIdx: 7, endSegIdx: 7, fields: { verseRef: 'Deuteronomy 6:7' } };
    expect(await instanceIdOf(reader)).toBe(await instanceIdOf(stored));
  });
  it('the whole-daf probe {fields:{}} computes a DIFFERENT id — the false-miss bug', async () => {
    const real = await instanceIdOf({ fields: { verseRef: 'Deuteronomy 6:7' } });
    expect(await instanceIdOf({ fields: {} })).not.toBe(real);
  });
  it('rabbi flat shape and stored {fields:{name}} shape share an id', async () => {
    const flat = await instanceIdOf({ name: 'Abaye', generation: '4' });
    const stored = await instanceIdOf({ excerpt: '...', fields: { name: 'Abaye' } });
    expect(flat).toBe(stored);
  });
  it('the cache key differs between the real instance and the {fields:{}} probe', async () => {
    const def = { id: 'pesukim.why-here', cache_version: '2', scope: 'local' as const };
    const daf = { tractate: 'Berakhot', page: '2a' };
    const realKey = keyForEnrichment(
      def,
      await instanceIdOf({ fields: { verseRef: 'Deuteronomy 6:7' } }),
      daf,
      undefined,
      'en',
    );
    const probeKey = keyForEnrichment(
      def,
      await instanceIdOf({ fields: {} }),
      daf,
      undefined,
      'en',
    );
    expect(realKey).not.toBe(probeKey);
    expect(realKey).toContain('pesukim.why-here');
  });
});
