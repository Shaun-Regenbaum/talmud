import { describe, expect, it } from 'vitest';
import {
  buildDafPreamble,
  DAF_TEXT_POINTER,
  pointerizeDafVars,
  prependPreamble,
} from '../src/run/daf-preamble';

const dafVars = (extra: Record<string, unknown> = {}) => ({
  tractate: 'Chullin',
  page: '79a',
  hebrew: 'HE-FULL',
  english: 'EN-FULL',
  gemara: 'HE-FULL\n\n---\n\nEN-FULL',
  gemara_he: 'HE-FULL',
  gemara_en: 'EN-FULL',
  segments_he: ['aleph', 'bet'],
  segments_en: ['first', 'second'],
  ...extra,
});

describe('buildDafPreamble', () => {
  it('is byte-identical regardless of producer-specific vars or language', () => {
    const a = buildDafPreamble(dafVars({ mark_input: { move: 1 }, context: 'X' }));
    const b = buildDafPreamble(dafVars({ commentaries: 'Rashi...', depends: { flow: {} } }));
    expect(a).toBe(b === null ? a : b);
    expect(a).not.toBeNull();
  });

  it('numbers segments [0]-based, matching the renderers', () => {
    const p = buildDafPreamble(dafVars());
    expect(p).toContain('=== DAF CONTEXT: Chullin 79a ===');
    expect(p).toContain('[0] aleph\n[1] bet');
    expect(p).toContain('[0] first\n[1] second');
  });

  it('returns null for daf-agnostic vars (no segment arrays)', () => {
    expect(buildDafPreamble({ tractate: 'Chullin', page: '79a', name: 'Rava' })).toBeNull();
    expect(buildDafPreamble(dafVars({ segments_he: [] }))).toBeNull();
  });

  it('tolerates missing English segments', () => {
    const p = buildDafPreamble(dafVars({ segments_en: undefined }));
    expect(p).toContain('[0] aleph');
    expect(p).not.toContain('ENGLISH SEGMENTS');
  });
});

describe('pointerizeDafVars', () => {
  it('replaces every daf-text var, leaves the rest, does not mutate', () => {
    const vars = dafVars({ mark_input: { x: 1 }, context: 'keep' });
    const out = pointerizeDafVars(vars);
    for (const k of ['gemara', 'hebrew', 'english', 'segments_he', 'segments_en']) {
      expect(out[k]).toBe(DAF_TEXT_POINTER);
    }
    expect(out.mark_input).toEqual({ x: 1 });
    expect(out.context).toBe('keep');
    expect(vars.segments_he).toEqual(['aleph', 'bet']);
  });

  it('honors keepInline exemptions', () => {
    const out = pointerizeDafVars(dafVars(), ['segments_he']);
    expect(out.segments_he).toEqual(['aleph', 'bet']);
    expect(out.gemara).toBe(DAF_TEXT_POINTER);
  });
});

describe('prependPreamble', () => {
  it('adds the preamble as its own leading system message', () => {
    const base = [
      { role: 'system', content: 'INSTRUCTIONS' },
      { role: 'user', content: 'TASK' },
    ];
    const out = prependPreamble('PREAMBLE', base);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ role: 'system', content: 'PREAMBLE' });
    expect(out[1].content).toBe('INSTRUCTIONS');
    expect(base).toHaveLength(2);
  });

  it('passes messages through untouched with no preamble', () => {
    const base = [{ role: 'user', content: 'TASK' }];
    expect(prependPreamble(null, base)).toBe(base);
    expect(prependPreamble(undefined, base)).toBe(base);
  });
});
