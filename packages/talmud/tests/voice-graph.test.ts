import { describe, expect, it } from 'vitest';
import { curatedEdgeCount } from '../src/worker/rabbi-graph';
import {
  egoSlice,
  emptyVoiceGraphStaging,
  finalizeVoiceGraph,
  foldSection,
  groundVoices,
} from '../src/worker/voice-graph';

// Real registry names with unambiguous canonical forms: Rava and Abaye resolve
// 'unique'; "Rav Kahana" is the classic homonym (multiple registry bearers).
const SECTION = {
  voices: [
    { name: 'Rava', nameHe: 'רבא', role: 'originator', side: 'A', stance: '' },
    { name: 'Abaye', nameHe: 'אביי', role: 'objector', side: 'B', stance: '' },
    { name: 'Stam', nameHe: '', role: 'transmitter', side: 'stam', stance: '' },
  ],
  edges: [
    { from: 'Abaye', to: 'Rava', kind: 'opposes' },
    { from: 'Stam', to: 'Rava', kind: 'cites' },
  ],
};

function groundedFor(section: typeof SECTION) {
  return groundVoices(section.voices, [
    { name: 'Rava', nameHe: 'רבא', generation: 'amora-bavel-4' },
    { name: 'Abaye', nameHe: 'אביי', generation: 'amora-bavel-4' },
  ]);
}

describe('groundVoices', () => {
  it('grounds real names, skips collectives', () => {
    const g = groundedFor(SECTION);
    expect(g.get('Rava')?.slug).toBe('rava');
    expect(g.get('Rava')?.genSource).toBe('unique');
    expect(g.get('Abaye')?.slug).toBeTruthy();
    expect(g.has('Stam')).toBe(false); // collective — never a person node
  });
});

describe('foldSection', () => {
  it('accumulates nodes + edges, drops collective endpoints, counts strict tier', () => {
    const st = emptyVoiceGraphStaging(1000);
    foldSection(st, SECTION, groundedFor(SECTION), 'Berakhot 2a');
    expect(st.sections).toBe(1);
    expect(Object.keys(st.nodes)).toContain('rava');
    expect(st.nodes.rava.sections).toBe(1);
    expect(st.nodes.rava.dafs).toEqual(['Berakhot 2a']);
    // Stam→Rava edge dropped (collective endpoint); Abaye→Rava kept.
    expect(st.edgesSeen).toBe(2);
    expect(st.edgesKept).toBe(1);
    const kept = Object.values(st.edges);
    expect(kept).toHaveLength(1);
    expect(kept[0].to).toBe('rava');
    expect(kept[0].kind).toBe('opposes');
    expect(kept[0].weight).toBe(1);
    expect(kept[0].strict).toBe(1); // both endpoints resolved 'unique'
  });

  it('is additive across sections and dedupes daf samples', () => {
    const st = emptyVoiceGraphStaging(1000);
    foldSection(st, SECTION, groundedFor(SECTION), 'Berakhot 2a');
    foldSection(st, SECTION, groundedFor(SECTION), 'Berakhot 2a');
    foldSection(st, SECTION, groundedFor(SECTION), 'Shabbat 21b');
    const edge = Object.values(st.edges)[0];
    expect(edge.weight).toBe(3);
    expect(edge.dafs).toEqual(['Berakhot 2a', 'Shabbat 21b']);
    expect(st.nodes.rava.sections).toBe(3);
    expect(Object.keys(st.dafsSeen)).toHaveLength(2);
  });

  it('never emits an edge for an unresolved (homonym) endpoint', () => {
    const st = emptyVoiceGraphStaging(1000);
    const section = {
      voices: [
        { name: 'Rava', nameHe: 'רבא' },
        { name: 'Rav Kahana', nameHe: 'רב כהנא' },
      ],
      edges: [{ from: 'Rav Kahana', to: 'Rava', kind: 'cites' }],
    };
    const grounded = groundVoices(section.voices, []);
    // The bare homonym must not have resolved to a slug with no evidence.
    expect(grounded.get('Rav Kahana')?.slug ?? null).toBeNull();
    foldSection(st, section, grounded, 'Bava Batra 3a');
    expect(st.edgesKept).toBe(0);
    expect(Object.keys(st.edges)).toHaveLength(0);
  });
});

describe('finalizeVoiceGraph + egoSlice', () => {
  it('stamps curated edge counts, counts newly connected, slices egos', () => {
    const st = emptyVoiceGraphStaging(1000);
    foldSection(st, SECTION, groundedFor(SECTION), 'Berakhot 2a');
    const blob = finalizeVoiceGraph(st, 2000);
    expect(blob.builtAt).toBe(2000);
    expect(blob.dapim).toBe(1);
    expect(blob.nodes.rava.curatedEdges).toBe(curatedEdgeCount('rava'));
    // Rava has curated edges in the registry, so he is not "newly connected".
    expect(curatedEdgeCount('rava')).toBeGreaterThan(0);

    const ego = egoSlice(blob, 'rava');
    expect(ego).not.toBeNull();
    expect(ego?.edges).toHaveLength(1);
    expect(ego?.edges[0].direction).toBe('in');
    expect(ego?.edges[0].other.slug).toBeTruthy();
    expect(egoSlice(blob, 'no-such-rabbi')).toBeNull();
  });
});
