import { describe, expect, it } from 'vitest';
import { summarizeMachine, workOf } from '../src/lib/sage-graph/machine-summary';
import fixture from './fixtures/machine-source-store.json';

// Stored rows of real, unreviewed machine readings of four real jobs.
const rows = fixture.rows as {
  kind: string;
  ref: string;
  subject_id: string;
  object_id: string;
  payload_json: string;
}[];
const data = (r: { payload_json: string }) => JSON.parse(r.payload_json);
const kept = (r: { payload_json: string }) => data(r).decision?.action === 'accept_unreviewed';
/** The same grouping the worker does in SQL, done here on the real stored rows. */
const input = () => {
  const people = rows.filter((r) => r.kind === 'checked_person' && kept(r));
  const label = new Map(people.map((r) => [r.subject_id, data(r).label as string]));
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m];
  };
  const connections = rows.filter((r) => r.kind === 'checked_connection' && kept(r));
  return {
    readings: rows.filter((r) => r.kind === 'checked_reading').map((r) => r.ref),
    peopleByForm: count(people.map((r) => data(r).form)).map(([form, n]) => ({ form, n })),
    connectionsByKind: count(
      connections.map((r) => JSON.stringify([data(r).predicate.value, data(r).broadType])),
    ).map(([k, n]) => {
      const [relation, broadType] = JSON.parse(k);
      return { relation, broadType, n };
    }),
    pairs: count(
      connections
        .filter((r) => label.has(r.subject_id) && label.has(r.object_id))
        .map((r) =>
          JSON.stringify([
            label.get(r.subject_id),
            label.get(r.object_id),
            data(r).predicate.value,
          ]),
        ),
    ).map(([k, n]) => {
      const [a, b, relation] = JSON.parse(k);
      return { a, b, relation, n };
    }),
    held: [] as { reason: string; n: number }[],
  };
};

describe('machine reading summary', () => {
  it('counts what the stored rows hold', () => {
    const rowsIn = input();
    const s = summarizeMachine([{ name: 'bavli', revision: 'rev', rows: rowsIn }]);
    expect(s.readings).toBe(4);
    expect(s.people.total).toBe(rowsIn.peopleByForm.reduce((n, p) => n + p.n, 0));
    expect(s.connections.total).toBe(rowsIn.connectionsByKind.reduce((n, c) => n + c.n, 0));
    expect(s.connections.byRelation.reduce((n, r) => n + r.n, 0)).toBe(s.connections.total);
    expect(Object.values(s.people.byForm).reduce((n, v) => n + v, 0)).toBe(s.people.total);
    expect(s.revisions).toEqual({ bavli: 'rev' });
  });
  it('counts a name pair once per passage and keeps the biggest first', () => {
    const s = summarizeMachine([{ name: 'bavli', revision: 'rev', rows: input() }], 5);
    expect(s.pairs.length).toBeGreaterThan(0);
    expect(s.pairs.length).toBeLessThanOrEqual(5);
    expect(s.pairs.map((p) => p.n)).toEqual([...s.pairs.map((p) => p.n)].sort((a, b) => b - a));
  });
  it('treats a symmetric pair the same in either order', () => {
    const s = summarizeMachine([
      {
        name: 'bavli',
        revision: null,
        rows: {
          readings: [],
          peopleByForm: [],
          connectionsByKind: [],
          pairs: [
            { a: 'ב', b: 'א', relation: 'sibling_of', n: 1 },
            { a: 'א', b: 'ב', relation: 'sibling_of', n: 1 },
          ],
          held: [],
        },
      },
    ]);
    expect(s.pairs).toEqual([{ a: 'א', b: 'ב', relation: 'sibling_of', n: 2, symmetric: true }]);
  });
  it('names the work of a ref', () => {
    expect(workOf('Arakhin 2a:11')).toBe('Arakhin');
    expect(workOf('Bava Metzia 42b:3')).toBe('Bava Metzia');
  });
});
