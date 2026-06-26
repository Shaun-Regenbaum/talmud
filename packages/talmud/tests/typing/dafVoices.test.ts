/**
 * buildDafVoiceGraph (src/lib/typing/dafVoices.ts) — stitches the per-section
 * argument.voices graphs of a daf into one daf-wide voice network: voices dedupe
 * by name across sections (carrying every section + role), relations dedupe by
 * (from, to, kind) (carrying every section), and edge directions are repaired
 * per-section via deriveVoiceEdges before the merge.
 */
import { describe, expect, it } from 'vitest';
import { buildDafVoiceGraph, type VoiceClass } from '../../src/lib/typing/dafVoices';
import type { ArgumentVoicesData } from '../../src/lib/typing/voices';

// Classifier fake: Stam is collective, named rabbis carry a generation.
const GENS: Record<string, string> = {
  'Rabbi Yochanan': 'amora-ey-2',
  'Reish Lakish': 'amora-ey-2',
  Rava: 'amora-bavel-4',
};
const classify = (name: string): VoiceClass =>
  name === 'Stam' ? { collective: true } : { collective: false, generation: GENS[name] };

const sectionA: ArgumentVoicesData = {
  voices: [
    { name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן', role: 'originator', side: 'A', stance: '' },
    { name: 'Reish Lakish', nameHe: 'ריש לקיש', role: 'objector', side: 'B', stance: '' },
  ],
  edges: [{ from: 'Reish Lakish', to: 'Rabbi Yochanan', kind: 'opposes' }],
};
const sectionB: ArgumentVoicesData = {
  voices: [
    { name: 'Rabbi Yochanan', nameHe: 'רבי יוחנן', role: 'respondent', side: 'A', stance: '' },
    { name: 'Rava', nameHe: 'רבא', role: 'questioner', side: 'B', stance: '' },
  ],
  // Same opposition AND a fresh cites edge; the opposition recurs in section B too.
  edges: [{ from: 'Rava', to: 'Rabbi Yochanan', kind: 'cites', note: 'cites the dispute' }],
};

describe('buildDafVoiceGraph', () => {
  it('dedupes a voice across sections, accumulating its sections + roles', () => {
    const g = buildDafVoiceGraph(
      [
        { title: 'First sugya', voices: sectionA },
        { title: 'Second sugya', voices: sectionB },
      ],
      classify,
    );
    const yochanan = g.nodes.find((n) => n.name === 'Rabbi Yochanan');
    expect(yochanan).toBeTruthy();
    expect(yochanan?.sections).toEqual(['First sugya', 'Second sugya']);
    expect(yochanan?.roles).toEqual(['originator', 'respondent']);
    expect(yochanan?.generation).toBe('amora-ey-2');
    expect(yochanan?.nameHe).toBe('רבי יוחנן');
    // One node per distinct name (Yochanan, Reish Lakish, Rava).
    expect(g.nodes.map((n) => n.name)).toEqual(['Rabbi Yochanan', 'Reish Lakish', 'Rava']);
  });

  it('marks collective voices and leaves them generation-less', () => {
    const g = buildDafVoiceGraph(
      [
        {
          title: 'S',
          voices: {
            voices: [{ name: 'Stam', role: 'questioner', side: 'stam', stance: '' }],
            edges: [],
          },
        },
      ],
      classify,
    );
    expect(g.nodes[0]).toMatchObject({ name: 'Stam', collective: true });
    expect(g.nodes[0].generation).toBeUndefined();
  });

  it('keeps distinct relation kinds between the same pair as separate edges', () => {
    const g = buildDafVoiceGraph(
      [
        { title: 'First sugya', voices: sectionA },
        { title: 'Second sugya', voices: sectionB },
      ],
      classify,
    );
    const opp = g.edges.find((e) => e.kind === 'opposes');
    const cites = g.edges.find((e) => e.kind === 'cites');
    expect(opp).toMatchObject({
      from: 'Reish Lakish',
      to: 'Rabbi Yochanan',
      sections: ['First sugya'],
    });
    expect(cites).toMatchObject({ from: 'Rava', to: 'Rabbi Yochanan', note: 'cites the dispute' });
  });

  it('accumulates an edge seen in multiple sections', () => {
    const g = buildDafVoiceGraph(
      [
        { title: 'First sugya', voices: sectionA },
        // The same opposition recurs verbatim in a later section.
        { title: 'Third sugya', voices: sectionA },
      ],
      classify,
    );
    const opp = g.edges.filter((e) => e.kind === 'opposes');
    expect(opp).toHaveLength(1);
    expect(opp[0].sections).toEqual(['First sugya', 'Third sugya']);
  });

  it('drops an edge whose endpoint never appears as a voice node', () => {
    const g = buildDafVoiceGraph(
      [
        {
          title: 'S',
          voices: {
            voices: [{ name: 'Rava', role: 'originator', side: 'A', stance: '' }],
            edges: [{ from: 'Rava', to: 'Ghost', kind: 'opposes' }],
          },
        },
      ],
      classify,
    );
    expect(g.edges).toHaveLength(0);
  });

  it('ignores sections with no voices data', () => {
    const g = buildDafVoiceGraph(
      [
        { title: 'cold', voices: null },
        { title: 'warm', voices: sectionA },
      ],
      classify,
    );
    expect(g.sections.map((s) => s.title)).toEqual(['warm']);
    expect(g.nodes).toHaveLength(2);
  });
});
