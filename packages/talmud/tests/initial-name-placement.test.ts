import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { initialPlacement, nameSpan } from '../src/lib/sage-graph/initial-placement';
import type { LegacyRow } from '../src/lib/sage-graph/legacy-readings';
import { sageGraph } from '../src/worker/sage-graph';
import saved from './fixtures/initial-name-placement.json';

const rows = () => structuredClone(saved.records) as LegacyRow[];
describe('exact initial name placement', () => {
  it('binds actual saved names to the pinned source edition without an era', async () => {
    const result = await initialPlacement(saved.occurrences, rows());
    expect(result.occurrences).toHaveLength(2);
    expect(result.sources.every((s) => s.edition && s.bindingSha256)).toBe(true);
    expect(result.occurrences[0].readingPersonId).toBe(saved.occurrences[0].people[0].id);
    expect(result.occurrences[0].people[0].id).toBe('local:b000-p0/A');
    expect(result.occurrences[0]).not.toHaveProperty('generation');
  });
  it('withholds unbound editions and changed whole-source text', async () => {
    expect(
      (
        await initialPlacement(
          saved.occurrences,
          rows().filter((r) => r.kind !== 'source_binding'),
        )
      ).occurrences,
    ).toEqual([]);
    const changed = rows();
    for (const row of changed.filter((r) => r.kind === 'passage')) {
      const data = JSON.parse(row.payload_json);
      data.source.passage += ' ';
      row.payload_json = JSON.stringify(data);
    }
    expect((await initialPlacement(saved.occurrences, changed)).occurrences).toEqual([]);
  });
  it('does not choose among competing people at the same words', async () => {
    const occurrences = structuredClone(saved.occurrences);
    occurrences[0].people.push(occurrences[1].people[0]);
    expect((await initialPlacement(occurrences, rows())).occurrences).toHaveLength(1);
  });
  it('rejects broad clauses and repeated names instead of shortening them', () => {
    const text = JSON.parse(saved.records.find((r) => r.kind === 'passage')!.payload_json).source
      .passage;
    expect(nameSpan(text, 'אפילו בדרב ושמואל', 'רב')).toBeNull();
    expect(nameSpan(`${text} רבינא`, 'רבינא', 'רבינא')).toBeNull();
  });
  it('uses code points when a supplementary character precedes an actual name', () => {
    // Deliberate Unicode mutation of captured text exercises offsets, not a new source.
    expect(nameSpan('𝄞 רבינא', 'רבינא', 'רבינא')).toEqual({ start: 2, end: 7 });
    expect(nameSpan('דרבינא', 'רבינא', 'רבינא')).toBeNull();
    expect(nameSpan('דרבינא', 'דרבינא', 'רבינא')).toEqual({ start: 0, end: 6 });
  });
});

it('rejects a changed edition or parent binding hash', async () => {
  for (const field of ['edition', 'passagePayloadSha256']) {
    const changed = rows();
    for (const row of changed.filter((r) => r.kind === 'source_binding')) {
      const data = JSON.parse(row.payload_json);
      data[field] += ' altered';
      row.payload_json = JSON.stringify(data);
    }
    expect((await initialPlacement(saved.occurrences, changed)).occurrences).toEqual([]);
  }
});

it('serves exact source placement and the existing local card through the API', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE sage_graph_revisions(id TEXT,state TEXT,manifest_json TEXT,created_at TEXT); CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT); INSERT INTO sage_graph_revisions VALUES('captured','verified','{}','2026-10-20');",
    );
    // A real local-node shape also permits a null passage index; lookup uses its exact ID.
    for (const r of rows().map((row) =>
      row.kind === 'graph_node' ? { ...row, passage_id: null } : row,
    ))
      db.prepare('INSERT INTO sage_graph_all_records VALUES(?,?,?,?,?,?,?,?,?)').run(
        'captured',
        r.record_id,
        r.kind,
        r.passage_id,
        r.ref,
        r.authority,
        r.decision,
        r.payload_sha256,
        r.payload_json,
      );
    interface Statement {
      bind: (...v: (string | number)[]) => Statement;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    }
    const statement = (sql: string, values: (string | number)[] = []): Statement => ({
      bind: (...v) => statement(sql, v),
      first: async () => db.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...values) }),
    });
    const env = { SAGE_GRAPH_DB: { prepare: (sql: string) => statement(sql) } };
    const response = await sageGraph.request(
      '/initial?ref=Sanhedrin%2033a&revision=captured&placement=v1',
      {},
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      placement: Awaited<ReturnType<typeof initialPlacement>>;
    };
    expect(body.placement.occurrences.some((o) => o.people[0].id === 'local:b000-p0/A')).toBe(true);
    const person = await sageGraph.request(
      '/person?id=proposal%3Ab000-p0%2FA&revision=captured',
      {},
      env,
    );
    expect(person.status).toBe(200);
  } finally {
    db.close();
  }
});
