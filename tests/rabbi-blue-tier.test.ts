import { describe, it, expect } from 'vitest';
import {
  GENERATIONS,
  GENERATION_BY_ID,
  GENERATION_IDS,
  colorForGeneration,
  legibleTextColor,
  type GenerationId,
} from '../src/client/generations';
import { enrichRabbi, resolveGeneration } from '../src/worker/index';
import placesData from '../src/lib/data/rabbi-places.json';
import hierarchyData from '../src/lib/data/rabbi-hierarchy.json';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ---------------------------------------------------------------------------
// The two-tier color contract: pre-Geonim = red spectrum, Geonim onward = blue
// spectrum, each dark (earlier) -> light (later). Locks the rule so a future
// edit can't silently re-hue a tier or drop the blue-tier IDs.
// ---------------------------------------------------------------------------
describe('generation color spectrum — two tiers', () => {
  it('exposes the blue-tier generations', () => {
    for (const id of ['geonim', 'rishonim', 'achronim'] as const) {
      expect(GENERATION_IDS).toContain(id);
      expect(GENERATION_BY_ID[id].tier).toBe('late');
    }
  });

  it('every pre-Geonim (early-tier) generation is red-dominant', () => {
    for (const g of GENERATIONS.filter((x) => x.tier === 'early')) {
      const [r, , b] = rgb(g.color);
      expect(r, `${g.id} should be red-dominant`).toBeGreaterThan(b);
    }
  });

  it('every Geonim-onward (late-tier) generation is blue-dominant', () => {
    for (const g of GENERATIONS.filter((x) => x.tier === 'late')) {
      const [r, , b] = rgb(g.color);
      expect(b, `${g.id} should be blue-dominant`).toBeGreaterThan(r);
    }
  });

  it('runs dark (earlier) -> light (later) within each tier', () => {
    // Pre-Geonim: Zugim darkest, Savora lightest.
    expect(lum(GENERATION_BY_ID['zugim'].color)).toBeLessThan(lum(GENERATION_BY_ID['savora'].color));
    expect(lum(GENERATION_BY_ID['tanna-1'].color)).toBeLessThan(lum(GENERATION_BY_ID['tanna-6'].color));
    // Geonim onward: Geonim darkest, Achronim lightest.
    expect(lum(GENERATION_BY_ID['geonim'].color)).toBeLessThan(lum(GENERATION_BY_ID['rishonim'].color));
    expect(lum(GENERATION_BY_ID['rishonim'].color)).toBeLessThan(lum(GENERATION_BY_ID['achronim'].color));
  });

  it('tiers partition every generation (unknown is neutral)', () => {
    for (const g of GENERATIONS) {
      expect(['early', 'late', 'none']).toContain(g.tier);
    }
    expect(GENERATION_BY_ID['unknown'].tier).toBe('none');
    expect(colorForGeneration('unknown')).toBe(GENERATION_BY_ID['unknown'].color);
  });

  it('legibleTextColor flips to dark ink on the palest swatches', () => {
    expect(legibleTextColor('#1e3a8a')).toBe('#fff'); // dark blue
    expect(legibleTextColor('#fca5a5')).toBe('#1f2937'); // pale red
  });
});

// ---------------------------------------------------------------------------
// Data guard: rabbi-places.json feeds /api/rabbi/:slug. Every generation must
// be a real GenerationId (so it picks up a tier + color), and the curated
// later-authority overrides must survive a regenerate.
// ---------------------------------------------------------------------------
describe('rabbi-places.json generations', () => {
  const rabbis = (placesData as { rabbis: Record<string, { generation: string | null }> }).rabbis;
  const valid = new Set<string>(GENERATION_IDS);

  it('every generation value is null or a valid GenerationId', () => {
    const bad: string[] = [];
    for (const [slug, v] of Object.entries(rabbis)) {
      if (v.generation !== null && !valid.has(v.generation)) bad.push(`${slug}=${v.generation}`);
    }
    expect(bad).toEqual([]);
  });

  it('pins the clear-cut later authorities to the blue tier', () => {
    const expected: Record<string, GenerationId> = {
      'rav-huna-gaon': 'geonim',
      'rav-hanina-gaon': 'geonim',
      'rav-sheshena-gaon': 'geonim',
      rashi: 'rishonim',
      rambam: 'rishonim',
      ramban: 'rishonim',
      rashbam: 'rishonim',
      tosafot: 'rishonim',
    };
    for (const [slug, gen] of Object.entries(expected)) {
      expect(rabbis[slug]?.generation, slug).toBe(gen);
    }
  });
});

// rabbi-hierarchy.json feeds the live RabbiLineageTree's linked teacher/student
// nodes; it derives generation from rabbi-places, so the same later authorities
// must carry the blue-tier ids (not the stale savora/unknown).
describe('rabbi-hierarchy.json generations', () => {
  const nodes = (hierarchyData as { nodes: Record<string, { generation: string | null }> }).nodes;
  const valid = new Set<string>(GENERATION_IDS);

  it('every node generation is null or a valid GenerationId', () => {
    const bad: string[] = [];
    for (const [slug, v] of Object.entries(nodes)) {
      if (v.generation !== null && !valid.has(v.generation)) bad.push(`${slug}=${v.generation}`);
    }
    expect(bad).toEqual([]);
  });

  it('pins the same later authorities to the blue tier as rabbi-places', () => {
    const expected: Record<string, GenerationId> = {
      'rav-huna-gaon': 'geonim', 'rav-hanina-gaon': 'geonim', 'rav-sheshena-gaon': 'geonim',
      rashi: 'rishonim', rambam: 'rishonim', ramban: 'rishonim', rashbam: 'rishonim', tosafot: 'rishonim',
    };
    for (const [slug, gen] of Object.entries(expected)) {
      expect(nodes[slug]?.generation, slug).toBe(gen);
    }
  });
});

// enrichRabbi: model-first, registry-fallback-on-unknown. Locks the rule so the
// data overrides actually reach a live underline when the model abstains, while
// the model stays authoritative whenever it DID assign a generation.
describe('enrichRabbi generation resolution', () => {
  it('fills a model "unknown" from the resolved registry entry', () => {
    expect(enrichRabbi('Rashi', 'רש"י', 'unknown').generation).toBe('rishonim');
    expect(enrichRabbi('Rav Huna Gaon', '', 'unknown').generation).toBe('geonim');
  });

  it('keeps the model generation when it assigned one (homonym safety)', () => {
    // Even though the registry would resolve "Rashi" to rishonim, an explicit
    // model call wins — this is the homonym-disambiguation guarantee.
    expect(enrichRabbi('Rashi', 'רש"י', 'tanna-4').generation).toBe('tanna-4');
  });

  it('stays unknown when the name resolves to nothing', () => {
    expect(enrichRabbi('Zzqx Not A Rabbi', '', 'unknown').generation).toBe('unknown');
  });
});

// resolveGeneration is the shared unit used on the LIVE rabbi-mark path
// (postProcessRabbi) as well as enrichRabbi, so the registry fallback actually
// reaches underlines/cards — not only /api/rabbi/:slug.
describe('resolveGeneration (shared mark-path helper)', () => {
  it('upgrades an unknown to the registry generation', () => {
    expect(resolveGeneration('Rashi', 'רש"י', 'unknown')).toBe('rishonim');
    expect(resolveGeneration('Rav Sheshena Gaon', '', 'unknown')).toBe('geonim');
  });
  it('passes a known model generation through untouched', () => {
    expect(resolveGeneration('Rashi', 'רש"י', 'amora-bavel-2')).toBe('amora-bavel-2');
  });
  it('returns unknown when nothing resolves', () => {
    expect(resolveGeneration('Qqzz Nobody', '', 'unknown')).toBe('unknown');
  });
});
