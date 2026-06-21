import { describe, expect, it } from 'vitest';
import { enrichRunDefOf, markRunDefOf, TANACH_PRODUCERS } from '../src/worker/producers/defs';
import { tanachSpines } from '../src/worker/spines';

describe('tanach spine registry', () => {
  it('declares the tanach text spine with book/chapter/verse levels', () => {
    const spine = tanachSpines.get('tanach');
    expect(spine?.kind).toBe('text');
    expect(spine?.levels).toEqual(['book', 'chapter', 'verse']);
  });

  it('accepts truncated paths (division refs) down to verse depth', () => {
    expect(tanachSpines.ref('tanach', ['Genesis'])).toEqual(['Genesis']);
    expect(tanachSpines.ref('tanach', ['Genesis', 1])).toEqual(['Genesis', 1]);
    expect(tanachSpines.ref('tanach', ['I Samuel', 3, 4])).toEqual(['I Samuel', 3, 4]);
  });

  it('rejects bad depth and validates the book against the BOOKS registry', () => {
    expect(() => tanachSpines.ref('tanach', [])).toThrow(/depth/);
    expect(() => tanachSpines.ref('tanach', ['Genesis', 1, 1, 1])).toThrow(/depth/);
    expect(() => tanachSpines.ref('tanach', ['Bereshit', 1])).toThrow(/unknown Tanach book/);
  });
});

describe('the six producers as core Producer objects', () => {
  it('declares all six with their model shapes', () => {
    expect(Object.keys(TANACH_PRODUCERS).sort()).toEqual([
      'events',
      'midrash-synthesis',
      'note',
      'overview',
      'synthesis',
      'translate',
    ]);

    const events = TANACH_PRODUCERS.events;
    expect(events.kind).toBe('mark-instance');
    expect(events.anchoring).toEqual({
      behavior: 'discovers',
      precision: 'segment',
      spine: 'tanach',
    });
    expect(events.cardinality).toBe('many');
    expect(events.key_shape).toBe('mark');
    expect(events.cacheVersion).toBe('2'); // events:v2:*

    const note = TANACH_PRODUCERS.note;
    expect(note.anchoring.behavior).toBe('inherits');
    expect(note.anchoring.target).toBe('events');
    expect(note.cardinality).toBe('per-input');

    for (const id of ['synthesis', 'midrash-synthesis'] as const) {
      expect(TANACH_PRODUCERS[id].anchoring).toEqual({
        behavior: 'inherits',
        precision: 'segment',
        spine: 'tanach',
      });
      expect(TANACH_PRODUCERS[id].scope).toBe('local');
    }

    const overview = TANACH_PRODUCERS.overview;
    expect(overview.kind).toBe('enrichment');
    expect(overview.anchoring).toEqual({
      behavior: 'inherits',
      precision: 'unit', // whole-chapter scoped
      spine: 'tanach',
    });
    expect(overview.cardinality).toBe('one');
    expect(overview.scope).toBe('local');
    expect(overview.cacheVersion).toBe('1'); // overview:v1:*

    const translate = TANACH_PRODUCERS.translate;
    expect(translate.anchoring.behavior).toBe('inherits');
    expect(translate.scope).toBe('global');
  });

  it('every recipe carries real prompts, a strict schema, and the legacy call knobs', () => {
    const knobs: Record<string, { max_tokens: number; temperature: number; tag: string }> = {
      events: { max_tokens: 900, temperature: 0.2, tag: 'tanach:events' },
      note: { max_tokens: 700, temperature: 0.3, tag: 'tanach:note' },
      overview: { max_tokens: 1400, temperature: 0.3, tag: 'tanach:overview' },
      synthesis: { max_tokens: 800, temperature: 0.3, tag: 'tanach:synthesis' },
      'midrash-synthesis': { max_tokens: 800, temperature: 0.35, tag: 'tanach:midrash-synthesis' },
      translate: { max_tokens: 120, temperature: 0.2, tag: 'tanach:translate' },
    };
    for (const [id, p] of Object.entries(TANACH_PRODUCERS)) {
      const ext = p.recipe.extractor as {
        kind: string;
        system_prompt: string;
        user_prompt_template: string;
        output_schema: { strict?: boolean };
        max_tokens: number;
        temperature: number;
        tag: string;
      };
      expect(ext.kind).toBe('llm');
      expect(ext.system_prompt.length).toBeGreaterThan(50);
      expect(ext.user_prompt_template).toContain('{{');
      expect(ext.output_schema.strict).toBe(true);
      expect({ max_tokens: ext.max_tokens, temperature: ext.temperature, tag: ext.tag }).toEqual(
        knobs[id],
      );
    }
  });

  it('projects run defs runProducer consumes', () => {
    const events = markRunDefOf('events');
    expect(events.id).toBe('events');
    expect(events.cache_version).toBe('2');
    expect(events.dependencies).toEqual(['chapter-verses']);
    expect(events.extractor.kind).toBe('llm');

    const note = enrichRunDefOf('note');
    expect(note.mark).toBe('events');
    expect(note.dependencies).toEqual(['section-verses']);
    expect(note.system_prompt.length).toBeGreaterThan(50);

    const overview = enrichRunDefOf('overview');
    expect(overview.dependencies).toEqual(['chapter-verses']);
    expect(overview.system_prompt.length).toBeGreaterThan(50);

    const synth = enrichRunDefOf('synthesis');
    expect(synth.dependencies).toEqual(['verse-text', 'commentaries']);
    const midrash = enrichRunDefOf('midrash-synthesis');
    expect(midrash.dependencies).toEqual(['verse-text', 'midrash-passages']);
  });
});
