import { describe, expect, it } from 'vitest';
import { MAX_MAYBE, summarizeSageMaybe } from '../src/lib/sage-graph/sage-maybe';
import fixture from './fixtures/sage-maybe-eliezer-real.json';

// Real rows from the staging Bavli store: every named placement that lists R. Eliezer ben Hyrcanus as an option.
const rows = fixture.rows;
const slug = 'rabbi-eliezer-b-hyrcanus';

describe('summarizeSageMaybe', () => {
  const maybe = summarizeSageMaybe(slug, rows);

  it('lists each name once, never one placed on this sage', () => {
    expect(maybe.length).toBeGreaterThan(0);
    expect(maybe.length).toBeLessThanOrEqual(MAX_MAYBE);
    expect(maybe.every((m) => m.placedAs !== slug)).toBe(true);
    expect(maybe.every((m) => !m.alsoPossible.includes(slug))).toBe(true);
  });

  it('puts names two models disagreed on first', () => {
    const states = maybe.map((m) => m.state);
    const order = ['which_one', 'one_model', 'ruled_out'];
    expect(states.map((s) => order.indexOf(s))).toEqual(
      [...states.map((s) => order.indexOf(s))].sort((a, b) => a - b),
    );
    expect(maybe[0]?.state).toBe('which_one');
  });

  it('never offers a name that is not placed, not a which-one, or a father', () => {
    const rest = summarizeSageMaybe(slug, [
      {
        ref: 'X 1a:1',
        label: 'x',
        status: 'unplaced',
        placed: null,
        agreement: 'none',
        why: null,
        options: [slug, 'a'],
      },
      {
        ref: 'X 1a:2',
        label: 'y',
        status: 'not_on_list',
        placed: null,
        agreement: 'none',
        why: null,
        options: [slug],
      },
    ]);
    expect(rest).toEqual([]);
  });
});
