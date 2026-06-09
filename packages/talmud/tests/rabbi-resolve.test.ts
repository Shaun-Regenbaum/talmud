import { describe, expect, it } from 'vitest';
import hier from '../src/lib/data/rabbi-hierarchy.json';
import {
  generationOf,
  groundRabbiInstances,
  groundRabbiNames,
  rabbiCandidates,
  resolveRabbiSlug,
} from '../src/worker/rabbi-graph';

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
    const nodes = (
      hier as {
        nodes: Record<
          string,
          { canonical: string; teachers?: string[]; students?: string[]; colleagues?: string[] }
        >;
      }
    ).nodes;
    const edgesOf = (slug: string) =>
      new Set([
        ...(nodes[slug]?.teachers ?? []),
        ...(nodes[slug]?.students ?? []),
        ...(nodes[slug]?.colleagues ?? []),
      ]);
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

describe('groundRabbiInstances — registry-grounded generation on rabbi mark instances', () => {
  const mk = (insts: { name: string; nameHe?: string; generation?: string }[]) => ({
    instances: insts.map((f) => ({ excerpt: f.nameHe ?? f.name, fields: { ...f } })),
  });
  const fieldsAt = (parsed: unknown, i: number) =>
    (parsed as { instances: { fields: Record<string, unknown> }[] }).instances[i].fields;

  it('grounds an unambiguous rabbi to the registry generation + slug', () => {
    const p = mk([{ name: 'Reish Lakish', generation: 'amora-ey-9' /* wrong guess */ }]);
    groundRabbiInstances(p);
    const f = fieldsAt(p, 0);
    expect(f.slug).toBe('rabbi-shimon-b-lakish');
    expect(f.genSource).toBe('unique');
    expect(f.generation).toBe(generationOf('rabbi-shimon-b-lakish'));
  });

  it('blanks the era of a homonym it cannot pin (Rav Kahana alone) → unknown, no slug', () => {
    const p = mk([{ name: 'Rav Kahana', generation: 'amora-bavel-2' }]);
    groundRabbiInstances(p);
    const f = fieldsAt(p, 0);
    expect(f.genSource).toBe('ambiguous');
    expect(f.generation).toBe('unknown'); // neutral, not the freeform guess
    expect(f.slug).toBeUndefined();
  });

  it('keeps the LLM generation for a name absent from the registry', () => {
    const p = mk([{ name: 'Xyzzy Not-A-Rabbi', generation: 'tanna-1' }]);
    groundRabbiInstances(p);
    const f = fieldsAt(p, 0);
    expect(f.genSource).toBe('none');
    expect(f.generation).toBe('tanna-1'); // unchanged — no registry opinion
    expect(f.slug).toBeUndefined();
  });

  it('grounds a homonym RELATIONALLY from the daf cast', () => {
    const cands = rabbiCandidates('Rav Kahana');
    const nodes = (
      hier as {
        nodes: Record<
          string,
          { canonical: string; teachers?: string[]; students?: string[]; colleagues?: string[] }
        >;
      }
    ).nodes;
    const edgesOf = (slug: string) =>
      new Set([
        ...(nodes[slug]?.teachers ?? []),
        ...(nodes[slug]?.students ?? []),
        ...(nodes[slug]?.colleagues ?? []),
      ]);
    let picked: { cand: string; neighborName: string } | null = null;
    for (const cand of cands) {
      const others = cands.filter((c) => c !== cand);
      for (const nb of edgesOf(cand)) {
        if (others.some((o) => edgesOf(o).has(nb)) || !nodes[nb]?.canonical) continue;
        picked = { cand, neighborName: nodes[nb].canonical };
        break;
      }
      if (picked) break;
    }
    if (picked) {
      const p = mk([{ name: 'Rav Kahana' }, { name: picked.neighborName }]);
      groundRabbiInstances(p);
      const f = fieldsAt(p, 0);
      expect(f.slug).toBe(picked.cand);
      expect(f.genSource).toBe('relational');
      expect(f.generation).toBe(generationOf(picked.cand));
    }
  });
});

describe('groundRabbiNames — the shared entry point for both attach paths', () => {
  it('resolves a batch against its own cast + extra context, uniform records', () => {
    // Rav Kahana + Rav in the batch → relational pin; an alias → unique; a
    // non-registry name → none. One call, the contract both paths rely on.
    const out = groundRabbiNames(
      [{ name: 'Rav Kahana' }, { name: 'Reish Lakish' }, { name: 'Totally Made Up' }],
      ['Rav'], // extra co-occurring context (e.g. the daf's rabbi-mark cast)
    );
    const byName = Object.fromEntries(out.map((g) => [g.name, g]));
    expect(byName['Reish Lakish'].slug).toBe('rabbi-shimon-b-lakish');
    expect(byName['Reish Lakish'].genSource).toBe('unique');
    expect(byName['Totally Made Up'].slug).toBeNull();
    expect(byName['Totally Made Up'].genSource).toBe('none');
    // Rav Kahana resolves relationally off "Rav" in the context (his registry edge).
    expect(byName['Rav Kahana'].genSource).toBe('relational');
    expect(byName['Rav Kahana'].slug).toContain('kahana');
    expect(byName['Rav Kahana'].generation).toBe(generationOf(byName['Rav Kahana'].slug!));
  });
});
