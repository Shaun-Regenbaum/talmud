import { describe, expect, it } from 'vitest';
import hier from '../src/lib/data/rabbi-hierarchy.json';
import {
  generationOf,
  groundRabbiInstances,
  groundRabbiNames,
  lookupRelationships,
  lookupRelationshipsBySlug,
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

  it('VETOES a bare generation guess on a cross-generation homonym set (era-consistency)', () => {
    // The candidate Kahanas span generations and there is zero relational
    // evidence here — the LLM's per-daf generation guess alone must NOT pick
    // a winner (that guess is exactly the overclaim this path corrects).
    const r = resolveRabbiSlug('Rav Kahana', undefined, { generation: 'amora-bavel-3' });
    expect(r.basis).toBe('ambiguous');
    expect(r.slug).toBeNull();
  });

  it('accepts the generation pick when thin relational evidence CORROBORATES it', () => {
    // One shared edge is below the relational margin, but when the LLM's
    // generation guess singles out the SAME candidate the two weak signals
    // agree — that resolves (basis 'generation').
    const picked = pickDiscriminatingNeighbors('Rav Kahana', 1);
    if (picked) {
      const r = resolveRabbiSlug('Rav Kahana', undefined, {
        coRabbis: picked.neighborNames,
        generation: generationOf(picked.cand) ?? undefined,
      });
      expect(r.basis).toBe('generation');
      expect(r.slug).toBe(picked.cand);
    }
  });

  it('does NOT resolve relationally on a single shared edge (thin-evidence margin)', () => {
    // A 1-edge "win" is routinely incidental co-presence on a multi-sugya daf
    // (the Shabbat 21b Rav Kahana defect: Rav's co-presence handed the early
    // Kahana the win). Below the margin → ambiguous, generation unknown.
    const picked = pickDiscriminatingNeighbors('Rav Kahana', 1);
    if (picked) {
      const r = resolveRabbiSlug('Rav Kahana', undefined, { coRabbis: picked.neighborNames });
      expect(r.basis).toBe('ambiguous');
      expect(r.slug).toBeNull();
    }
  });

  it('disambiguates a homonym RELATIONALLY when the margin is met (2+ discriminating edges)', () => {
    const picked = pickDiscriminatingNeighbors('Rav Kahana', 2);
    // Only assert when the registry actually has discriminating edges (it does
    // for Kahana; guard keeps the test honest if the data changes).
    if (picked) {
      const r = resolveRabbiSlug('Rav Kahana', undefined, { coRabbis: picked.neighborNames });
      expect(r.basis).toBe('relational');
      expect(r.slug).toBe(picked.cand);
    }
  });
});

/** Pick a candidate of `name` plus `n` of its registry neighbors that are
 *  unique to it among the candidates (i.e. edges that discriminate). Returns
 *  null when the registry doesn't have enough discriminating edges. */
function pickDiscriminatingNeighbors(
  name: string,
  n: number,
): { cand: string; neighborNames: string[] } | null {
  const cands = rabbiCandidates(name);
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
  for (const cand of cands) {
    const others = cands.filter((c) => c !== cand);
    const neighborNames: string[] = [];
    for (const nb of edgesOf(cand)) {
      if (others.some((o) => edgesOf(o).has(nb))) continue; // must discriminate
      if (!nodes[nb]?.canonical) continue;
      neighborNames.push(nodes[nb].canonical);
      if (neighborNames.length === n) return { cand, neighborNames };
    }
  }
  return null;
}

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

  it('grounds a homonym RELATIONALLY from the daf cast (margin met)', () => {
    const picked = pickDiscriminatingNeighbors('Rav Kahana', 2);
    if (picked) {
      const p = mk([{ name: 'Rav Kahana' }, ...picked.neighborNames.map((name) => ({ name }))]);
      groundRabbiInstances(p);
      const f = fieldsAt(p, 0);
      expect(f.slug).toBe(picked.cand);
      expect(f.genSource).toBe('relational');
      expect(f.generation).toBe(generationOf(picked.cand));
    }
  });

  it('stamps the homonym candidate count on ambiguous instances', () => {
    const p = mk([{ name: 'Rav Kahana', generation: 'amora-bavel-2' }]);
    groundRabbiInstances(p);
    const f = fieldsAt(p, 0);
    expect(f.genSource).toBe('ambiguous');
    expect(typeof f.homonyms).toBe('number');
    expect(f.homonyms as number).toBeGreaterThanOrEqual(2);
  });

  it('does NOT stamp homonyms on a unique resolution', () => {
    const p = mk([{ name: 'Reish Lakish' }]);
    groundRabbiInstances(p);
    expect(fieldsAt(p, 0).homonyms).toBeUndefined();
  });
});

describe('groundRabbiNames — the shared entry point for both attach paths', () => {
  it('resolves a batch against its own cast + extra context, uniform records', () => {
    // An alias → unique; a non-registry name → none; Rav Kahana with only
    // Rav's incidental co-presence (ONE shared edge, below the relational
    // margin) → honest 'ambiguous', generation unknown — the Shabbat 21b
    // defect: that single edge used to hand the win to the early Kahana.
    const out = groundRabbiNames(
      [{ name: 'Rav Kahana' }, { name: 'Reish Lakish' }, { name: 'Totally Made Up' }],
      ['Rav'], // extra co-occurring context (e.g. the daf's rabbi-mark cast)
    );
    const byName = Object.fromEntries(out.map((g) => [g.name, g]));
    expect(byName['Reish Lakish'].slug).toBe('rabbi-shimon-b-lakish');
    expect(byName['Reish Lakish'].genSource).toBe('unique');
    expect(byName['Totally Made Up'].slug).toBeNull();
    expect(byName['Totally Made Up'].genSource).toBe('none');
    expect(byName['Rav Kahana'].genSource).toBe('ambiguous');
    expect(byName['Rav Kahana'].slug).toBeNull();
    expect(byName['Rav Kahana'].generation).toBe('unknown');
    expect(byName['Rav Kahana'].homonyms).toBeGreaterThanOrEqual(2);
  });

  it('the Shabbat 21b reproduction: Rav Kahana with the daf cast stays unresolved, not amora-ey-1', () => {
    // The actual Shabbat 21b cast (where Rav Kahana quotes Rav Natan bar
    // Minyomi, amora-bavel-5 — generationally impossible for the early
    // Kahana). The HEBREW form רב כהנא must also not pin via the stripped
    // "רב כהנא (2)" disambiguator key.
    // Generations are the LLM's actual guesses from the prod run. The cast's
    // famous names (Rav, Rava, R. Yochanan) all sit in the conflated
    // rav-kahana-(ii) node's edge list, so the relational score alone picks
    // it — the era-consistency veto (winner ey-1 vs the model's bavel-2 read
    // on a cross-generation candidate set) is what keeps this honest.
    const cast = [
      { name: 'Rav Kahana', nameHe: 'רב כהנא', generation: 'amora-bavel-2' },
      { name: 'Rav', nameHe: 'רב', generation: 'amora-bavel-1' },
      { name: 'Rav Natan bar Minyomi', nameHe: 'רב נתן בר מניומי', generation: 'amora-bavel-5' },
      { name: 'Rava', nameHe: 'רבא', generation: 'amora-bavel-4' },
      { name: 'Abaye', nameHe: 'אביי', generation: 'amora-bavel-4' },
      { name: 'Rabbi Yochanan', nameHe: "ר' יוחנן", generation: 'amora-ey-1' },
    ];
    const out = groundRabbiNames(cast);
    const kahana = out.find((g) => g.name === 'Rav Kahana');
    expect(kahana).toBeDefined();
    expect(kahana?.generation).not.toBe('amora-ey-1');
    // Either a margin-clearing relational pin or the honest unknown — never
    // the incidental-co-presence overclaim.
    if (kahana?.slug == null) {
      expect(kahana?.genSource).toBe('ambiguous');
      expect(kahana?.generation).toBe('unknown');
    }
  });

  it('the geresh Hebrew form pins the same slug as the full form (list dedup upstream)', () => {
    // "ר' ירמיה" and "רבי ירמיה" are the same daf rabbi in two spellings; the
    // grounded slug is what the client dedups on.
    const out = groundRabbiNames([
      { name: 'Rabbi Yirmiyah', nameHe: "ר' ירמיה" },
      { name: 'Rabbi Yirmeyah', nameHe: 'רבי ירמיה' },
    ]);
    expect(out[0].slug).not.toBeNull();
    expect(out[0].slug).toBe(out[1].slug);
  });
});

describe('lookupRelationshipsBySlug — slug-direct graph lookup (grounded instances)', () => {
  it('two same-name homonym slugs return DIFFERENT relationship data', () => {
    // The whole point of the slug path: a name lookup is first-wins and
    // would hand both Kahanas the same node.
    const a = lookupRelationshipsBySlug('rav-kahana-(ii)');
    const b = lookupRelationshipsBySlug('rav-kahana-of-pum-nahara');
    // Only assert when both nodes have edges in the registry data.
    if (a && b) {
      expect(a.slug).not.toBe(b.slug);
      const names = (r: typeof a) => r.data.teachers.map((t) => t.name).join('|');
      expect(names(a)).not.toBe(names(b));
    }
  });

  it('agrees with the name path for an unambiguous rabbi', () => {
    const byName = lookupRelationships('Reish Lakish');
    expect(byName).not.toBeNull();
    const bySlug = lookupRelationshipsBySlug(byName!.slug, 'Reish Lakish');
    expect(bySlug?.slug).toBe(byName!.slug);
    expect(bySlug?.data).toEqual(byName!.data);
  });

  it('returns null for an unknown slug', () => {
    expect(lookupRelationshipsBySlug('not-a-real-slug')).toBeNull();
  });
});
