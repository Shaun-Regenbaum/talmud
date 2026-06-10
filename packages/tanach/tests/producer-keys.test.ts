/**
 * Key byte-parity — the load-bearing cache-compatibility guarantee: every key
 * the runProducer wiring derives is BYTE-IDENTICAL to the legacy hand-built
 * literal the route used to write, so no warmed entry ever cold-misses.
 * Expected literals are copied from the pre-migration index.ts:
 *
 *   `events:v2:${book}:${chapter}`
 *   `note:v1:${book}:${chapter}:${start}-${end}`
 *   `synthesis:v1:${book}:${chapter}:${verse}`
 *   `midrash-synth:v1:${book}:${chapter}:${verse}`   (producer: midrash-synthesis)
 *
 * translate:v1:* is deliberately absent (kept on bespoke raw-string+TTL
 * plumbing); midrash:v1:* is a source cache, not a producer output.
 */

import { instanceIdOf } from '@corpus/core/cache/keys';
import type { ProducerKeyInfo } from '@corpus/core/store/key-schemes';
import { describe, expect, it } from 'vitest';
import { enrichRunDefOf, markRunDefOf } from '../src/worker/producers/defs';
import { enrichmentAddress, TANACH_KEY_SCHEME } from '../src/worker/run-ports';

function info(
  def: { id: string; cache_version: string },
  key_shape: 'mark' | 'enrich',
): ProducerKeyInfo {
  return { id: def.id, cacheVersion: def.cache_version, scope: 'local', key_shape };
}

describe('key byte-parity with the legacy literals', () => {
  it('events — events:v2:{book}:{chapter}, raw book name (spaces preserved)', () => {
    const def = info(markRunDefOf('events'), 'mark');
    expect(TANACH_KEY_SCHEME.key(def, { unit: { work: 'Genesis', unit: '1' } })).toBe(
      'events:v2:Genesis:1',
    );
    expect(TANACH_KEY_SCHEME.key(def, { unit: { work: 'I Samuel', unit: '3' } })).toBe(
      'events:v2:I Samuel:3',
    );
    expect(TANACH_KEY_SCHEME.key(def, { unit: { work: 'Song of Songs', unit: '8' } })).toBe(
      'events:v2:Song of Songs:8',
    );
  });

  it('note — note:v1:{book}:{chapter}:{start}-{end}', () => {
    const def = info(enrichRunDefOf('note'), 'enrich');
    expect(TANACH_KEY_SCHEME.key(def, enrichmentAddress('note', '3-5', 'Genesis', '1'))).toBe(
      'note:v1:Genesis:1:3-5',
    );
    // Single-verse sections still key as `${start}-${end}` with start === end
    // (the legacy route always wrote both numbers).
    expect(TANACH_KEY_SCHEME.key(def, enrichmentAddress('note', '7-7', 'Exodus', '20'))).toBe(
      'note:v1:Exodus:20:7-7',
    );
  });

  it('synthesis — synthesis:v1:{book}:{chapter}:{verse}', () => {
    const def = info(enrichRunDefOf('synthesis'), 'enrich');
    expect(TANACH_KEY_SCHEME.key(def, enrichmentAddress('synthesis', '1', 'Genesis', '1'))).toBe(
      'synthesis:v1:Genesis:1:1',
    );
  });

  it('midrash-synthesis — id routes, the template owns midrash-synth:v1 bytes', () => {
    const def = info(enrichRunDefOf('midrash-synthesis'), 'enrich');
    expect(
      TANACH_KEY_SCHEME.key(def, enrichmentAddress('midrash-synthesis', '2', 'Exodus', '3')),
    ).toBe('midrash-synth:v1:Exodus:3:2');
  });

  it('previousKey is null (no SWR decrement in the literal templates)', () => {
    const def = info(markRunDefOf('events'), 'mark');
    expect(TANACH_KEY_SCHEME.previousKey('events:v2:Genesis:1', def)).toBeNull();
  });
});

describe('the markInput id carrier survives instanceIdOf verbatim', () => {
  // runProducer derives the enrichment instance id via instanceIdOf(markInput);
  // the routes set markInput.id to the legacy key component. Digits and '-'
  // pass slugId untouched, which is what keeps the keys byte-exact end-to-end.
  it('note range ids and verse ids pass through unchanged', async () => {
    expect(await instanceIdOf({ id: '3-5', start: 3, end: 5, label: 'Creation' })).toBe('3-5');
    expect(await instanceIdOf({ id: '7-7', start: 7, end: 7, label: '' })).toBe('7-7');
    expect(await instanceIdOf({ id: '12', verse: 12 })).toBe('12');
  });
});
