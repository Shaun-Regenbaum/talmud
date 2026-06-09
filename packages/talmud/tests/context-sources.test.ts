import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDafyomi } from '../src/lib/context/fromDafyomi';
import {
  fromCommentaryPieces,
  fromHalachaRefs,
  fromMishna,
  fromRishonim,
  fromTopics,
} from '../src/lib/context/fromSefaria';
import { SOURCE_META, SOURCES, sourceLabel } from '../src/lib/context/sources';
import type { DafyomiDaf } from '../src/lib/sefref/dafyomi/schema';

/**
 * The registry is the single source of truth for what sources exist. Exhaustive
 * coverage over `ContextSource` is already enforced at compile time (SOURCE_META
 * is a `Record<ContextSource, …>`); these tests guard the runtime side:
 *   - the declared set doesn't silently drift, and
 *   - every mapper emits sources/labels the registry knows about (so a source
 *     can never reach the pool — and thus the alignment workbench — unregistered).
 */
describe('source registry', () => {
  it('declares exactly the 15 known sources', () => {
    expect([...SOURCES].sort()).toEqual([
      'dafyomi:background',
      'dafyomi:halacha',
      'dafyomi:hebcharts',
      'dafyomi:insights',
      'dafyomi:points',
      'dafyomi:revach',
      'dafyomi:review',
      'dafyomi:tosfos',
      'dafyomi:yerushalmi',
      'sefaria-halacha',
      'sefaria-mishnah',
      'sefaria-rashi',
      'sefaria-rishonim',
      'sefaria-topic',
      'sefaria-tosafot',
    ]);
  });

  it('every entry has a non-empty label + notes', () => {
    for (const id of SOURCES) {
      expect(SOURCE_META[id].label.length, id).toBeGreaterThan(0);
      expect(SOURCE_META[id].notes.length, id).toBeGreaterThan(0);
    }
  });

  it('labels are unique per origin group (Sefaria/dafyomi Halacha intentionally share)', () => {
    // "Halacha" appears for both sefaria-halacha and dafyomi:halacha by design.
    expect(sourceLabel('sefaria-halacha')).toBe('Halacha');
    expect(sourceLabel('dafyomi:halacha')).toBe('Halacha');
    expect(sourceLabel('dafyomi:tosfos')).toBe('Tosafot explanation');
    expect(sourceLabel('sefaria-tosafot')).toBe('Tosafot');
  });
});

describe('mappers stay inside the registry', () => {
  const corpus = (): DafyomiDaf =>
    JSON.parse(
      readFileSync(new URL('../static/dafyomi/Chullin/76.json', import.meta.url), 'utf-8'),
    );

  it('fromDafyomi: every item is a registered source with the registry label', () => {
    for (const it of fromDafyomi(corpus())) {
      expect(SOURCES, it.source).toContain(it.source);
      expect(it.sourceLabel, it.source).toBe(sourceLabel(it.source));
    }
  });

  it('fromSefaria mappers: every item is a registered source', () => {
    const items = [
      ...fromCommentaryPieces('rashi', {
        hebrew: '',
        english: '',
        pieces: ['a'],
        pieceKeys: ['1:1'],
      }),
      ...fromCommentaryPieces('tosafot', {
        hebrew: '',
        english: '',
        pieces: ['b'],
        pieceKeys: ['1:1'],
      }),
      ...fromRishonim([
        {
          label: 'Rashba',
          ref: 'Rashba on Berakhot 2a',
          hebrew: 'x',
          english: 'y',
          segStart: 0,
          segEnd: 0,
        },
      ]),
      ...fromHalachaRefs({
        'Shulchan Arukh': [{ ref: 'SA OC 1:1', hebrew: 'h', english: 'e', segStart: 0, segEnd: 0 }],
      }),
      ...fromMishna([
        {
          ref: 'Mishnah Berakhot 1:1',
          hebrew: 'h',
          english: 'e',
          anchorStartSeg: 0,
          anchorEndSeg: 1,
        },
      ]),
      ...fromTopics([
        { slug: 'shema', titleEn: 'Shema', titleHe: 'שמע', description: 'd', sources: [] },
      ]),
    ];
    for (const it of items) expect(SOURCES, it.source).toContain(it.source);
    // constant-label sources draw their label from the registry…
    expect(items.find((i) => i.source === 'sefaria-mishnah')?.sourceLabel).toBe(
      sourceLabel('sefaria-mishnah'),
    );
    expect(items.find((i) => i.source === 'sefaria-topic')?.sourceLabel).toBe(
      sourceLabel('sefaria-topic'),
    );
    // …rishonim keeps the specific rishon's name as its per-item label (documented exception).
    expect(items.find((i) => i.source === 'sefaria-rishonim')?.sourceLabel).toBe('Rashba');
  });
});
