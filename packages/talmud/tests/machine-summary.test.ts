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
const input = () => ({
  readings: rows.filter((r) => r.kind === 'checked_reading').map((r) => r.ref),
  people: rows
    .filter((r) => r.kind === 'checked_person' && kept(r))
    .map((r) => ({ id: r.subject_id, label: data(r).label, form: data(r).form })),
  connections: rows
    .filter((r) => r.kind === 'checked_connection' && kept(r))
    .map((r) => ({
      subject: r.subject_id,
      object: r.object_id,
      relation: data(r).predicate.value,
      broadType: data(r).broadType,
    })),
  held: [] as { reason: string; n: number }[],
});

describe('machine reading summary', () => {
  it('counts what the stored rows hold', () => {
    const rowsIn = input();
    const s = summarizeMachine([{ name: 'bavli', revision: 'rev', rows: rowsIn }]);
    expect(s.readings).toBe(4);
    expect(s.people.total).toBe(rowsIn.people.length);
    expect(s.connections.total).toBe(rowsIn.connections.length);
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
    const people = [
      { id: 'a/p1', label: 'ב', form: 'named' },
      { id: 'a/p2', label: 'א', form: 'named' },
    ];
    const s = summarizeMachine([
      {
        name: 'bavli',
        revision: null,
        rows: {
          readings: [],
          people,
          connections: [
            { subject: 'a/p1', object: 'a/p2', relation: 'sibling_of', broadType: 'family' },
            { subject: 'a/p2', object: 'a/p1', relation: 'sibling_of', broadType: 'family' },
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
