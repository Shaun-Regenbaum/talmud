/**
 * deriveVoiceEdges (src/lib/typing/voices.ts) — deterministic repair of the
 * argument.voices edge graph: flip inverted directions (the actor must appear
 * after the voice it reacts to), drop phantom-voice edges and self-loops.
 */
import { describe, expect, it } from 'vitest';
import { deriveVoiceEdges } from '../../src/lib/typing/voices';

// Voices in appearance order: Rava(0), Abaye(1), Rav Ashi(2).
const voices = [{ name: 'Rava' }, { name: 'Abaye' }, { name: 'Rav Ashi' }];
const run = (edges: unknown[]) =>
  (deriveVoiceEdges({ voices, edges }) as { edges: { from: string; to: string; kind: string }[] })
    .edges;

describe('deriveVoiceEdges', () => {
  it('keeps a correctly-directed edge (actor after target)', () => {
    expect(run([{ from: 'Abaye', to: 'Rava', kind: 'responds-to' }])).toEqual([
      { from: 'Abaye', to: 'Rava', kind: 'responds-to' },
    ]);
  });

  it('flips an inverted edge (actor before target)', () => {
    // LLM emitted Rava(0) responds-to Abaye(1) — but Rava came first, so flip.
    expect(run([{ from: 'Rava', to: 'Abaye', kind: 'responds-to' }])).toEqual([
      { from: 'Abaye', to: 'Rava', kind: 'responds-to' },
    ]);
  });

  it('flips across all reactive kinds, preserving kind + note', () => {
    const out = run([{ from: 'Rava', to: 'Rav Ashi', kind: 'opposes', note: 'n' }]);
    expect(out).toEqual([{ from: 'Rav Ashi', to: 'Rava', kind: 'opposes', note: 'n' }]);
  });

  it('drops edges referencing a non-existent voice', () => {
    expect(
      run([
        { from: 'Rava', to: 'Ghost', kind: 'cites' },
        { from: 'Nobody', to: 'Abaye', kind: 'supports' },
      ]),
    ).toEqual([]);
  });

  it('drops self-loops', () => {
    expect(run([{ from: 'Rava', to: 'Rava', kind: 'responds-to' }])).toEqual([]);
  });

  it('passes non-graph input and missing edges through untouched', () => {
    expect(deriveVoiceEdges({ voices })).toEqual({ voices });
    expect(deriveVoiceEdges(null)).toBeNull();
  });
});
