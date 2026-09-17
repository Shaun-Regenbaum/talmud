/**
 * Registry duplicates + the sage filter (src/worker/rabbi-graph.ts).
 *
 * The Shas-wide Jev run (2026-09-17) exposed two registry defects: three
 * people carried two nodes each, so a homonym pick split between them; and
 * the sage filter tested the RAW Hebrew string, so Rabbi Abbahu ("רַ' אַבָּהוּ",
 * the geresh shorthand under nikud, 187 Bavli mentions) was not a sage.
 */
import { describe, expect, it } from 'vitest';
import duplicates from '../src/lib/data/rabbi-duplicates.json';
import hierarchy from '../src/lib/data/rabbi-hierarchy.json';
import {
  canonicalSlug,
  DUPLICATE_SLUGS,
  isRabbinicHebrewName,
  rabbiCandidateSummaries,
  rabbiCandidates,
} from '../src/worker/rabbi-graph';

const nodes = (hierarchy as { nodes: Record<string, { canonicalHe?: string }> }).nodes;

describe('rabbi-duplicates.json', () => {
  it('maps every duplicate to a different node that exists in the registry', () => {
    for (const [dup, canon] of Object.entries(duplicates.duplicates)) {
      expect(dup).not.toBe(canon);
      expect(nodes[dup], `duplicate ${dup} missing from registry`).toBeTruthy();
      expect(nodes[canon], `canonical ${canon} missing from registry`).toBeTruthy();
      expect(DUPLICATE_SLUGS[dup]).toBe(canon);
    }
  });
  it('never chains (a canonical is not itself a duplicate)', () => {
    for (const canon of Object.values(duplicates.duplicates)) {
      expect(DUPLICATE_SLUGS[canon]).toBeUndefined();
    }
  });
  it('canonicalSlug is identity for everything else', () => {
    expect(canonicalSlug('rabbah-bar-nahmani')).toBe('rabbah-b-nachmani');
    expect(canonicalSlug('rabbah-b-nachmani')).toBe('rabbah-b-nachmani');
    expect(canonicalSlug('rabbi-oshaya-2')).toBe('rabbi-oshaya-2');
    expect(canonicalSlug('not-a-slug')).toBe('not-a-slug');
  });
});

describe('rabbiCandidates folds duplicates', () => {
  it('the duplicate spelling resolves to the Sefaria node, once', () => {
    expect(rabbiCandidates('Rabbah bar Nahmani')).toEqual(['rabbah-b-nachmani']);
    expect(rabbiCandidates('Rabbi Shmuel bar Nachmani')).toEqual(['rabbi-shmuel-b-nahmani']);
  });
  it('a bare Hebrew name that both nodes extended offers the person once', () => {
    const c = rabbiCandidates('Rabbi Yehoshua', 'רבי יהושע');
    expect(c).toContain('rabbi-yehoshua-b-hananyah');
    expect(c).not.toContain('rabbi-yehoshua-b-hananiah');
    expect(new Set(c).size).toBe(c.length);
  });
  it('candidate summaries carry no duplicate slug', () => {
    const s = rabbiCandidateSummaries('Rabbah', 'רבה');
    const slugs = s.map((x) => x.slug);
    expect(slugs).toContain('rabbah-b-nachmani');
    expect(slugs).not.toContain('rabbah-bar-nahmani');
  });
  it('keeps genuinely distinct near-namesakes apart', () => {
    const c = rabbiCandidates('Rabbi Oshaya');
    expect(c).toContain('rabbi-oshaya');
    // rabbi-oshaya-2 is a different amora; folding would erase him.
    expect(DUPLICATE_SLUGS['rabbi-oshaya-2']).toBeUndefined();
  });
});

describe('Hebrew disambiguators in parentheses', () => {
  it('a verbal disambiguator is stripped, so bare שמואל resolves to Shmuel the amora', () => {
    // Registry entry is "שמואל (שם אמורא)"; the Talmud writes שמואל. Before the
    // strip the bare form matched nothing (Shmuel: 3,259 Sefaria refs).
    expect(rabbiCandidates('Shmuel', 'שמואל')).toContain('shmuel-(amora)');
    expect(isRabbinicHebrewName('שמואל (שם אמורא)')).toBe(true);
    expect(isRabbinicHebrewName('רב (שם אמורא)')).toBe(true);
    expect(isRabbinicHebrewName('רבי יעקב (תנא)')).toBe(true);
  });
  it('a numeric disambiguator still marks the bare form as shared', () => {
    // "רב כהנא (2)" — the bare Hebrew must not pin one bearer.
    const c = rabbiCandidates('Rav Kahana', 'רב כהנא');
    expect(c.length).toBeGreaterThan(1);
  });
});

describe('isRabbinicHebrewName', () => {
  it('accepts the geresh shorthand under nikud (Rabbi Abbahu)', () => {
    expect(isRabbinicHebrewName("רַ' אַבָּהוּ")).toBe(true);
    expect(isRabbinicHebrewName(nodes['rabbi-abahu']?.canonicalHe ?? '')).toBe(true);
  });
  it('accepts plain titles and the standalone sage names', () => {
    expect(isRabbinicHebrewName('רבי יוחנן')).toBe(true);
    expect(isRabbinicHebrewName('רב כהנא (2)')).toBe(true);
    expect(isRabbinicHebrewName('אביי')).toBe(true);
    expect(isRabbinicHebrewName('שמואל')).toBe(true);
  });
  it('rejects concepts, places and biblical figures', () => {
    expect(isRabbinicHebrewName('ציצית')).toBe(false);
    expect(isRabbinicHebrewName('רבקה')).toBe(false);
    expect(isRabbinicHebrewName('סְפִירָה (קבלה)')).toBe(false);
    expect(isRabbinicHebrewName('')).toBe(false);
  });
});
