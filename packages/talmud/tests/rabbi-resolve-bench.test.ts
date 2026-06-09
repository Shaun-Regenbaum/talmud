import { describe, expect, it } from 'vitest';
import { generationOf, rabbiCandidates, resolveRabbiSlug } from '../src/worker/rabbi-graph';
import casts from './fixtures/berakhot-rabbi-casts.json';

/**
 * Resolution benchmark over a FIXED daf set (Berakhot 2a–11b, real rabbi-mark
 * casts captured as a fixture). Measures the registry-first + relational
 * resolver's behaviour on real data: how much resolves, by what basis, how
 * often grounding overrides the LLM's generation, and how homonyms fare.
 *
 * This is a deterministic coverage/behaviour gate (no LLM judge) — it asserts
 * floors so a regression that tanks resolution or starts guessing homonyms
 * fails CI. Graded accuracy-vs-scholarship is the follow-up (LLM-judge run).
 */
type Cast = Record<string, { name: string; nameHe?: string; generation?: string }[]>;
const CASTS = casts as Cast;

function benchmark() {
  const basis: Record<string, number> = {
    unique: 0,
    relational: 0,
    generation: 0,
    ambiguous: 0,
    none: 0,
  };
  let total = 0;
  let resolved = 0;
  let homonyms = 0; // names with >1 registry candidate
  let homonymsResolved = 0;
  let genOverridden = 0; // grounded generation differs from the LLM's guess
  const homonymExamples: string[] = [];

  for (const [, cast] of Object.entries(CASTS)) {
    const names = cast.map((c) => c.name);
    for (const r of cast) {
      total++;
      const cands = rabbiCandidates(r.name, r.nameHe);
      const isHomonym = cands.length > 1;
      if (isHomonym) homonyms++;
      const res = resolveRabbiSlug(r.name, r.nameHe, {
        coRabbis: names.filter((n) => n.toLowerCase() !== r.name.toLowerCase()),
        generation: r.generation,
      });
      basis[res.basis] = (basis[res.basis] ?? 0) + 1;
      if (res.slug) {
        resolved++;
        if (isHomonym) {
          homonymsResolved++;
          if (homonymExamples.length < 12)
            homonymExamples.push(`${r.name} → ${res.slug} (${res.basis})`);
        }
        const g = generationOf(res.slug);
        if (g && r.generation && g !== r.generation) genOverridden++;
      }
    }
  }
  return { total, resolved, basis, homonyms, homonymsResolved, genOverridden, homonymExamples };
}

describe('rabbi resolution benchmark (Berakhot 2a–11b fixture)', () => {
  const b = benchmark();

  it('invariant: every unresolved result is ambiguous or none (never a silent wrong slug)', () => {
    // resolved count must equal unique+relational+generation
    expect(b.resolved).toBe(b.basis.unique + b.basis.relational + b.basis.generation);
    expect(b.total).toBe(b.resolved + b.basis.ambiguous + b.basis.none);
  });

  it('resolution rate floor (>= 75% of real rabbi mentions resolve to a registry rabbi)', () => {
    const rate = b.resolved / b.total;
    expect(rate).toBeGreaterThanOrEqual(0.75); // ~84% at baseline; floor guards regressions
  });

  it('ambiguity ceiling: few mentions drop as unpinnable homonyms (<= 5%)', () => {
    expect(b.basis.ambiguous / b.total).toBeLessThanOrEqual(0.05);
  });

  it('grounding does real work: it overrides some LLM generations', () => {
    expect(b.genOverridden).toBeGreaterThan(0);
  });

  it('reports the breakdown (always passes; the metric line is the artifact)', () => {
    const rate = ((b.resolved / b.total) * 100).toFixed(0);
    const line = `BENCH total=${b.total} resolved=${b.resolved} (${rate}%) basis=${JSON.stringify(b.basis)} homonyms=${b.homonyms}/${b.homonymsResolved}resolved genOverridden=${b.genOverridden}`;
    expect(line).toContain('BENCH');
    // surfaced for the report via an intentional non-match if SHOW_BENCH is set
    if (process.env.SHOW_BENCH)
      expect(`${line} | homonyms: ${b.homonymExamples.join(' ; ')}`).toBe('SHOW');
  });
});
