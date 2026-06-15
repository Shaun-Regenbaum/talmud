import { describe, expect, it } from 'vitest';
import { instanceIdOf } from '../src/worker/cache-keys';
import {
  type AnchorPiece,
  type AnchorRef,
  anchorLabelOf,
  anchorRefOf,
  groupByAnchor,
} from '../src/worker/inspect-anchors';

describe('anchorLabelOf — human label per mark', () => {
  it('reads the identity field per mark, with a seg-N fallback', () => {
    expect(anchorLabelOf('pesukim', { fields: { verseRef: 'Deuteronomy 6:7' } })).toBe(
      'Deuteronomy 6:7',
    );
    expect(anchorLabelOf('argument', { fields: { title: 'The opening Mishnah' } })).toBe(
      'The opening Mishnah',
    );
    expect(anchorLabelOf('rabbi', { fields: { name: 'Abaye' } })).toBe('Abaye');
    expect(anchorLabelOf('yerushalmi', { fields: { yerushalmiRef: 'Berakhot 1:1' } })).toBe(
      'Berakhot 1:1',
    );
    // rishonim carries no label field -> fall back to the segment number
    expect(anchorLabelOf('rishonim', { segIdx: 5 })).toBe('seg 5');
    expect(anchorLabelOf('rishonim', { startSegIdx: 3, endSegIdx: 3 })).toBe('seg 3');
    // nothing usable -> the mark id
    expect(anchorLabelOf('whatever', {})).toBe('whatever');
  });
});

describe('anchorRefOf — id (the join key) + range + label', () => {
  it('id is instanceIdOf(inst); segRange + instanceJson pass through', async () => {
    const inst = { startSegIdx: 7, endSegIdx: 9, fields: { verseRef: 'Deuteronomy 6:7' } };
    const ref = await anchorRefOf('pesukim', inst);
    expect(ref.instanceId).toBe(await instanceIdOf(inst));
    expect(ref.label).toBe('Deuteronomy 6:7');
    expect(ref.segRange).toEqual([7, 9]);
    expect(ref.instanceJson).toBe(inst);
  });
  it('phrase marks (no seg range) -> segRange null', async () => {
    const ref = await anchorRefOf('rabbi', { fields: { name: 'Rava' } });
    expect(ref.segRange).toBeNull();
    expect(ref.label).toBe('Rava');
  });
});

describe('groupByAnchor — partition pieces into anchor groups + whole-daf', () => {
  const piece = (id: string): AnchorPiece => ({
    producerId: id,
    label: id,
    kind: 'llm',
    cached: true,
    cost: null,
    cold_ms: null,
    tokens: null,
  });
  const anchor = (markId: string, instanceId: string, seg: number): AnchorRef => ({
    markId,
    instanceId,
    label: instanceId,
    segRange: [seg, seg],
    instanceJson: {},
  });
  it('groups by (markId, instanceId); null anchor -> whole-daf; ordered by seg', () => {
    const a2 = anchor('pesukim', 'b', 9);
    const a1 = anchor('pesukim', 'a', 7);
    const { groups, wholeDaf } = groupByAnchor([
      { piece: piece('pesukim.why-here'), anchor: a2 },
      { piece: piece('pesukim.mechanism'), anchor: a2 },
      { piece: piece('daf-background'), anchor: null },
      { piece: piece('pesukim.why-here'), anchor: a1 },
    ]);
    expect(wholeDaf.map((p) => p.producerId)).toEqual(['daf-background']);
    // a1 (seg 7) before a2 (seg 9)
    expect(groups.map((g) => g.anchor.instanceId)).toEqual(['a', 'b']);
    expect(groups[1].pieces.map((p) => p.producerId)).toEqual([
      'pesukim.why-here',
      'pesukim.mechanism',
    ]);
  });
});

// The long-deferred argument gate: argumentDisplayInstance (no seg idx) and
// argumentSynthInstance (with seg idx) + the stored argument mark instance must
// share an instance id, else the argument leaves false-miss. They DO for an
// English title (it slugs to alphanumerics, so instanceIdOf returns slug(title)
// for all three). A Hebrew title falls to the structural hash, where the two
// shapes diverge — the documented HE-only edge.
describe('argument anchor join (the held-back dual display/synth shape)', () => {
  const title = 'Rava objects to Abaye';
  const display = { fields: { title, summary: 's', excerpt: 'e', rabbiNames: ['Rava'] } };
  const synth = {
    startSegIdx: 7,
    endSegIdx: 9,
    fields: { title, summary: 's', excerpt: 'e', rabbiNames: ['Rava'] },
  };
  const stored = { startSegIdx: 7, endSegIdx: 9, fields: { title, excerpt: 'e', summary: 's' } };
  it('English title: display, synth, and stored instance share one id (join works)', async () => {
    const id = await instanceIdOf(display);
    expect(await instanceIdOf(synth)).toBe(id);
    expect(await instanceIdOf(stored)).toBe(id);
  });
  it('Hebrew title: display and synth diverge (structural hash) — the HE edge', async () => {
    const he = 'פתיחה';
    const d = await instanceIdOf({ fields: { title: he, excerpt: 'e' } });
    const s = await instanceIdOf({
      startSegIdx: 7,
      endSegIdx: 9,
      fields: { title: he, excerpt: 'e' },
    });
    expect(d).not.toBe(s);
  });
});
