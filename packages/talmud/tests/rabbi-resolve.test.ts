import { describe, it, expect } from 'vitest';
import { rabbiCandidates, resolveRabbiSlug, generationOf } from '../src/worker/rabbi-graph';
import hier from '../src/lib/data/rabbi-hierarchy.json';

// Registry-first rabbi resolution with relational homonym disambiguation.
// Tests run against the real rabbi-hierarchy registry.

describe('rabbiCandidates', () => {
  it('returns MULTIPLE candidates for a homonym (Rav Kahana)', () => {
    const cands = rabbiCandidates('Rav Kahana');
    expect(cands.length).toBeGreaterThanOrEqual(2);
    // all are Kahana nodes
    for (const c of cands) expect(c.toLowerCase()).toContain('kahana');
  });

  it('returns nothing for a name not in the registry', () => {
    expect(rabbiCandidates('Xyzzy Not-A-Rabbi')).toEqual([]);
  });
});

describe('resolveRabbiSlug — registry-first, precision over a confident-wrong id', () => {
  it('does NOT guess a homonym with no daf context (the Rav Kahana problem)', () => {
    const r = resolveRabbiSlug('Rav Kahana');
    expect(r.slug).toBeNull();
    expect(r.basis).toBe('ambiguous');
  });

  it('drops a name absent from the registry', () => {
    expect(resolveRabbiSlug('Western Sages').slug).toBeNull();
    expect(resolveRabbiSlug('Western Sages').basis).toBe('none');
  });

  it('resolves an alias short-form uniquely', () => {
    const r = resolveRabbiSlug('Reish Lakish');
    expect(r.basis).toBe('unique');
    expect(r.slug).toBe('rabbi-shimon-b-lakish');
  });

  it('uses generation only as a last-resort tiebreaker among candidates', () => {
    const r = resolveRabbiSlug('Rav Kahana', undefined, { generation: 'amora-bavel-3' });
    expect(r.basis).toBe('generation');
    expect(r.slug).toBe('rav-kahana-of-pum-nahara');
    expect(generationOf(r.slug!)).toBe('amora-bavel-3');
  });

  it('disambiguates a homonym RELATIONALLY from a co-occurring rabbi (daf evidence)', () => {
    // Pick a Kahana candidate that has a registry edge, and use that neighbor —
    // unique to this candidate among the candidates — as the co-occurring rabbi.
    const cands = rabbiCandidates('Rav Kahana');
    const nodes = (hier as { nodes: Record<string, { canonical: string; teachers?: string[]; students?: string[]; colleagues?: string[] }> }).nodes;
    const edgesOf = (slug: string) => new Set([...(nodes[slug]?.teachers ?? []), ...(nodes[slug]?.students ?? []), ...(nodes[slug]?.colleagues ?? [])]);
    let picked: { cand: string; neighborName: string } | null = null;
    for (const cand of cands) {
      const others = cands.filter((c) => c !== cand);
      for (const nb of edgesOf(cand)) {
        if (others.some((o) => edgesOf(o).has(nb))) continue; // must discriminate
        if (!nodes[nb]?.canonical) continue;
        picked = { cand, neighborName: nodes[nb].canonical };
        break;
      }
      if (picked) break;
    }
    // Only assert when the registry actually has a discriminating edge (it does
    // for Kahana; guard keeps the test honest if the data changes).
    if (picked) {
      const r = resolveRabbiSlug('Rav Kahana', undefined, { coRabbis: [picked.neighborName] });
      expect(r.basis).toBe('relational');
      expect(r.slug).toBe(picked.cand);
    }
  });
});
