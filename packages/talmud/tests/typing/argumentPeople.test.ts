/**
 * buildArgumentPeople (src/lib/typing/argumentPeople.ts) — folds a daf's
 * statement spines into the deduped, prominence-ordered "who speaks" list the
 * #argument page renders. People come from each statement's rabbiNames (the
 * RESOLVED names — speaker labels are descriptive, "Gemara's question"), one
 * entry per distinct name, counting statements, carrying section indices,
 * classified (generation / collective) once per name.
 */
import { describe, expect, it } from 'vitest';
import { buildArgumentPeople } from '../../src/lib/typing/argumentPeople';
import type { VoiceClass } from '../../src/lib/typing/dafVoices';

const GENS: Record<string, string> = {
  'Rabbi Yochanan': 'amora-ey-2',
  'Reish Lakish': 'amora-ey-2',
};
const classify = (name: string): VoiceClass => ({
  collective: name === 'Sages',
  generation: GENS[name],
});

describe('buildArgumentPeople', () => {
  it('dedupes names across sections, counting statements and sections', () => {
    const people = buildArgumentPeople(
      [
        {
          index: 0,
          nodes: [
            { rabbiNames: ['Rabbi Yochanan'] },
            { rabbiNames: ['Reish Lakish'] },
            { rabbiNames: ['Rabbi Yochanan'] },
          ],
        },
        { index: 2, nodes: [{ rabbiNames: ['Rabbi Yochanan'] }] },
      ],
      classify,
    );
    expect(people).toHaveLength(2);
    const [yochanan, lakish] = people;
    expect(yochanan).toMatchObject({
      name: 'Rabbi Yochanan',
      statementCount: 3,
      sections: [0, 2],
      generation: 'amora-ey-2',
      collective: false,
    });
    expect(lakish).toMatchObject({ name: 'Reish Lakish', statementCount: 1, sections: [0] });
  });

  it('credits every name on a multi-voice statement', () => {
    const people = buildArgumentPeople(
      [{ index: 0, nodes: [{ rabbiNames: ['Rabbi Yochanan', 'Reish Lakish'] }] }],
      classify,
    );
    expect(people.map((p) => p.name)).toEqual(['Rabbi Yochanan', 'Reish Lakish']);
    expect(people.every((p) => p.statementCount === 1)).toBe(true);
  });

  it('orders by statement count, first appearance breaking ties', () => {
    const people = buildArgumentPeople(
      [
        { index: 0, nodes: [{ rabbiNames: ['Sages'] }, { rabbiNames: ['Rabbi Yochanan'] }] },
        { index: 1, nodes: [{ rabbiNames: ['Reish Lakish'] }, { rabbiNames: ['Reish Lakish'] }] },
      ],
      classify,
    );
    expect(people.map((p) => p.name)).toEqual(['Reish Lakish', 'Sages', 'Rabbi Yochanan']);
  });

  it('contributes nobody for anonymous statements, trims names, flags collectives', () => {
    const people = buildArgumentPeople(
      [
        {
          index: 0,
          nodes: [{ rabbiNames: [] }, {}, { rabbiNames: ['', '  ', ' Sages '] }],
        },
      ],
      classify,
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: 'Sages', collective: true, statementCount: 1 });
  });
});
