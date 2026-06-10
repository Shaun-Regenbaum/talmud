/**
 * Key-scheme parity — the load-bearing guarantee that the store layer can
 * never cold-miss the production KV cache:
 *
 *  - talmudLegacyKeyScheme is byte-equal to keyForMark / keyForEnrichment,
 *    asserted against LITERAL key strings copied from the PR #356 golden
 *    snapshot (packages/talmud/tests/__snapshots__/producer-key-golden.test.ts.snap);
 *  - previousKey is byte-equal to previousVersionKey;
 *  - templateKeyScheme reproduces the tanach app's hand-built keys
 *    byte-exactly (templates copied from packages/tanach/src/worker/index.ts).
 */

import { describe, expect, it } from 'vitest';
import {
  instanceIdOf,
  keyForEnrichment,
  keyForMark,
  previousVersionKey,
  qualifierHash,
} from '../src/cache/keys.ts';
import type { ArtifactAddress, ProducerKeyInfo } from '../src/store/key-schemes.ts';
import { talmudLegacyKeyScheme, templateKeyScheme } from '../src/store/key-schemes.ts';

const DAF_UNIT = { work: 'Berakhot', unit: '5a' };

function producer(
  id: string,
  cacheVersion: string,
  scope: ProducerKeyInfo['scope'],
  key_shape: ProducerKeyInfo['key_shape'],
): ProducerKeyInfo {
  return { id, cacheVersion, scope, key_shape };
}

describe('talmudLegacyKeyScheme — byte-equal to the frozen cache/keys contract', () => {
  const scheme = talmudLegacyKeyScheme();

  it('mark keys match the golden snapshot literals (Berakhot 5a)', () => {
    // Literals copied from producer-key-golden.test.ts.snap:
    //   "rabbi@4 mark lang=en  mark:rabbi:4:berakhot:5a"
    //   "aggadata@4 mark lang=he->he mark:aggadata:4:he:berakhot:5a"
    const rabbi = producer('rabbi', '4', 'local', 'mark');
    expect(scheme.key(rabbi, { unit: DAF_UNIT, lang: 'en' })).toBe('mark:rabbi:4:berakhot:5a');
    expect(scheme.key(rabbi, { unit: DAF_UNIT })).toBe('mark:rabbi:4:berakhot:5a'); // lang defaults en
    const aggadata = { ...producer('aggadata', '4', 'local', 'mark'), hasHePrompt: true };
    expect(scheme.key(aggadata, { unit: DAF_UNIT, lang: 'he' })).toBe(
      'mark:aggadata:4:he:berakhot:5a',
    );
  });

  it("mark ':he' namespace requires a Hebrew prompt — production's lang-collapse rule", () => {
    // cacheKeyForRunBody: a lang='he' mark request keys onto the ':he'
    // namespace ONLY when the def declares system_prompt_he; computed and
    // he-less marks collapse to the English key. Deriving ':he' here for a
    // he-less mark would orphan writes and cold-miss the production entries.
    const heLess = producer('rabbi', '4', 'local', 'mark'); // hasHePrompt absent → false
    expect(scheme.key(heLess, { unit: DAF_UNIT, lang: 'he' })).toBe(
      keyForMark({ id: 'rabbi', cache_version: '4' }, 'Berakhot', '5a', 'en'),
    );
    const hePrompted = { ...producer('aggadata', '4', 'local', 'mark'), hasHePrompt: true };
    expect(scheme.key(hePrompted, { unit: DAF_UNIT, lang: 'he' })).toBe(
      keyForMark({ id: 'aggadata', cache_version: '4' }, 'Berakhot', '5a', 'he'),
    );
    // en requests never touch the ':he' namespace either way.
    expect(scheme.key(hePrompted, { unit: DAF_UNIT, lang: 'en' })).toBe(
      keyForMark({ id: 'aggadata', cache_version: '4' }, 'Berakhot', '5a', 'en'),
    );
  });

  it('global enrichment keys match the golden snapshot literals', async () => {
    // Literals copied from producer-key-golden.test.ts.snap:
    //   "rabbi.bio@5 enrich inst=named lang=en enrich:rabbi.bio:5:abaye"
    //   "rabbi.bio@5 enrich inst=named lang=he enrich:rabbi.bio:5:he:abaye"
    //   "rabbi.bio@5 enrich inst=daf lang=en enrich:rabbi.bio:5:f35cd02cd97b"
    const bio = producer('rabbi.bio', '5', 'global', 'enrich');
    const named = await instanceIdOf({ fields: { name: 'Abaye' } });
    const wholeDaf = await instanceIdOf({ fields: {} });
    expect(named).toBe('abaye');
    expect(wholeDaf).toBe('f35cd02cd97b');
    expect(scheme.key(bio, { instanceId: named, lang: 'en' })).toBe('enrich:rabbi.bio:5:abaye');
    expect(scheme.key(bio, { instanceId: named, lang: 'he' })).toBe('enrich:rabbi.bio:5:he:abaye');
    expect(scheme.key(bio, { instanceId: wholeDaf })).toBe('enrich:rabbi.bio:5:f35cd02cd97b');
    // A supplied unit must NOT leak into a global key (production omits daf).
    expect(scheme.key(bio, { instanceId: named, unit: DAF_UNIT })).toBe('enrich:rabbi.bio:5:abaye');
  });

  it('local enrichment keys match the golden snapshot literals', async () => {
    // Literals copied from producer-key-golden.test.ts.snap:
    //   "aggadata.synthesis@3 enrich inst=named lang=en enrich:aggadata.synthesis:3:abaye:berakhot:5a"
    //   "aggadata.synthesis@3 enrich inst=named lang=he enrich:aggadata.synthesis:3:he:abaye:berakhot:5a"
    const synthesis = producer('aggadata.synthesis', '3', 'local', 'enrich');
    const named = await instanceIdOf({ fields: { name: 'Abaye' } });
    expect(scheme.key(synthesis, { instanceId: named, unit: DAF_UNIT, lang: 'en' })).toBe(
      'enrich:aggadata.synthesis:3:abaye:berakhot:5a',
    );
    expect(scheme.key(synthesis, { instanceId: named, unit: DAF_UNIT, lang: 'he' })).toBe(
      'enrich:aggadata.synthesis:3:he:abaye:berakhot:5a',
    );
  });

  it('the qualified (.qa) key matches the golden snapshot literal', async () => {
    // Literal copied from producer-key-golden.test.ts.snap:
    //   "argument-move.qa@5 enrich inst=named lang=en q="What is the halacha?"
    //    enrich:argument-move.qa:5:abaye:berakhot:5a:q_311ab477fd15"
    const qa = producer('argument-move.qa', '5', 'local', 'enrich');
    const named = await instanceIdOf({ fields: { name: 'Abaye' } });
    const qHash = await qualifierHash('What is the halacha?');
    expect(qHash).toBe('311ab477fd15');
    expect(scheme.key(qa, { instanceId: named, unit: DAF_UNIT, qualifier: qHash })).toBe(
      'enrich:argument-move.qa:5:abaye:berakhot:5a:q_311ab477fd15',
    );
  });

  it('spine-scope keys mirror keyForEnrichment exactly (tractate-only tail)', async () => {
    // No spine-scope def exists in the code registry yet, so there is no golden
    // line to copy — parity against the delegate IS the contract here.
    const spineDef = { id: 'test.spine', cache_version: '1', scope: 'spine' as const };
    const spineProducer = producer('test.spine', '1', 'spine', 'enrich');
    const named = await instanceIdOf({ fields: { name: 'Abaye' } });
    const key = scheme.key(spineProducer, { instanceId: named, unit: DAF_UNIT });
    expect(key).toBe(
      keyForEnrichment(spineDef, named, { tractate: 'Berakhot', page: '5a' }, undefined, 'en'),
    );
    expect(key).toBe('enrich:test.spine:1:abaye:berakhot'); // tractate only, no page
    // The page never reaches a spine key, so a page-less unit derives the same bytes.
    expect(scheme.key(spineProducer, { instanceId: named, unit: { work: 'Berakhot' } })).toBe(key);
  });

  it('local scope REQUIRES a full unit — page-less addresses fail, never derive', async () => {
    const synthesis = producer('aggadata.synthesis', '3', 'local', 'enrich');
    const named = await instanceIdOf({ fields: { name: 'Abaye' } });
    expect(() => scheme.key(synthesis, { instanceId: named })).toThrow(/needs unit/);
    // A work-only unit must not silently derive an ':berakhot:' key with an
    // empty page segment — that would be a new, wrong key namespace.
    expect(() => scheme.key(synthesis, { instanceId: named, unit: { work: 'Berakhot' } })).toThrow(
      /needs unit/,
    );
  });

  it('previousKey is byte-equal to previousVersionKey', () => {
    const cases: Array<[string, ProducerKeyInfo]> = [
      ['enrich:rabbi.bio:5:abaye', producer('rabbi.bio', '5', 'global', 'enrich')],
      ['enrich:rabbi.bio:5:he:abaye', producer('rabbi.bio', '5', 'global', 'enrich')],
      [
        'enrich:aggadata.synthesis:3:abaye:berakhot:5a',
        producer('aggadata.synthesis', '3', 'local', 'enrich'),
      ],
      ['mark:rabbi:4:berakhot:5a', producer('rabbi', '4', 'local', 'mark')],
      ['enrich:tidbit:1:f35cd02cd97b', producer('tidbit', '1', 'global', 'enrich')], // v1 → null
      ['enrich:thing:v2:abc', producer('thing', 'v2', 'global', 'enrich')], // non-numeric → null
    ];
    for (const [key, p] of cases) {
      expect(scheme.previousKey(key, p), key).toBe(previousVersionKey(key, p.id, p.cacheVersion));
    }
    // And the literal decrement, so the SWR shape is visible in the test.
    expect(
      scheme.previousKey(
        'enrich:rabbi.bio:5:abaye',
        producer('rabbi.bio', '5', 'global', 'enrich'),
      ),
    ).toBe('enrich:rabbi.bio:4:abaye');
    expect(
      scheme.previousKey(
        'enrich:tidbit:1:f35cd02cd97b',
        producer('tidbit', '1', 'global', 'enrich'),
      ),
    ).toBeNull();
  });
});

describe('templateKeyScheme — the tanach literal key family', () => {
  // Templates copied byte-exactly from packages/tanach/src/worker/index.ts:
  //   `events:v2:${book}:${chapter}`
  //   `note:v1:${book}:${chapter}:${start}-${end}`
  //   `synthesis:v1:${book}:${chapter}:${verse}`
  //   `midrash:v1:${book}:${chapter}:${verse}`
  //   `midrash-synth:v1:${book}:${chapter}:${verse}`   (producer: midrash-synthesis)
  // book/chapter ride in addr.unit ({work: book, unit: chapter}); verse and
  // start/end ride as open extra fields. Producer IDS are the app's producer
  // names; the key PREFIX is whatever literal the app stored under — they need
  // not match (midrash-synthesis writes midrash-synth:v1:* keys).
  //
  // tanach's `translate:v1:${norm}` cache is deliberately NOT modeled here: it
  // stores a RAW STRING with a 30-day TTL, not a StoredArtifact envelope, so
  // it stays outside ArtifactStore (decided at the tanach migration stage).
  type A = ArtifactAddress & Record<string, unknown>;
  const scheme = templateKeyScheme({
    events: { key: (a: A) => `events:v2:${a.unit?.work}:${a.unit?.unit}` },
    note: { key: (a: A) => `note:v1:${a.unit?.work}:${a.unit?.unit}:${a.start}-${a.end}` },
    synthesis: { key: (a: A) => `synthesis:v1:${a.unit?.work}:${a.unit?.unit}:${a.verse}` },
    midrash: { key: (a: A) => `midrash:v1:${a.unit?.work}:${a.unit?.unit}:${a.verse}` },
    'midrash-synthesis': {
      key: (a: A) => `midrash-synth:v1:${a.unit?.work}:${a.unit?.unit}:${a.verse}`,
    },
  });
  const p = (id: string) => producer(id, '1', 'local', 'enrich');

  it('reproduces every tanach key byte-exactly', () => {
    expect(scheme.key(p('events'), { unit: { work: 'Genesis', unit: '1' } })).toBe(
      'events:v2:Genesis:1',
    );
    expect(
      scheme.key(p('note'), { unit: { work: 'Genesis', unit: '1' }, start: 3, end: 5 } as A),
    ).toBe('note:v1:Genesis:1:3-5');
    expect(
      scheme.key(p('synthesis'), { unit: { work: 'Genesis', unit: '1' }, verse: '1' } as A),
    ).toBe('synthesis:v1:Genesis:1:1');
    expect(scheme.key(p('midrash'), { unit: { work: 'Exodus', unit: '3' }, verse: '2' } as A)).toBe(
      'midrash:v1:Exodus:3:2',
    );
    // Producer id and key prefix differ on purpose — the id routes, the
    // template owns the literal bytes.
    expect(
      scheme.key(p('midrash-synthesis'), { unit: { work: 'Exodus', unit: '3' }, verse: '2' } as A),
    ).toBe('midrash-synth:v1:Exodus:3:2');
  });

  it('previousKey defaults to null (no version segment in the templates)', () => {
    expect(scheme.previousKey('events:v2:Genesis:1', p('events'))).toBeNull();
  });

  it('throws on an unregistered producer id', () => {
    expect(() => scheme.key(p('unknown'), {})).toThrow(/no key template/);
  });
});
