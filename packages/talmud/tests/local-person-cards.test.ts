import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sageGraph } from '../src/worker/sage-graph';
import saved from './fixtures/local-person-cards.json';

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE sage_graph_revisions(id TEXT,state TEXT,manifest_json TEXT,created_at TEXT); CREATE TABLE sage_graph_records(revision_id TEXT,record_id TEXT,kind TEXT,payload_json TEXT);',
  );
  db.prepare(
    "INSERT INTO sage_graph_revisions VALUES('reviewed','verified','{}','2026-10-09')",
  ).run();
  for (const r of saved.records)
    db.prepare("INSERT INTO sage_graph_records VALUES('reviewed',?,?,?)").run(
      r.record_id,
      r.kind,
      JSON.stringify(r.data),
    );
});
afterEach(() => db.close());
function statement(sql: string, values: string[] = []) {
  return {
    bind: (...next: string[]) => statement(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
  };
}
const env = { SAGE_GRAPH_DB: { prepare: (sql: string) => statement(sql) } };
describe('cards for people identified within a passage', () => {
  it.each(['local:b581-p9/B', 'local:b257-p4/E'])(
    'opens %s without inventing a wider identity',
    async (id) => {
      const response = await sageGraph.request(`/person?id=${encodeURIComponent(id)}`, {}, env);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id,
        revision: 'reviewed',
        summary: '',
        summaryHe: '',
        places: [],
      });
    },
  );
  it('preserves an existing reviewed profile and its resolved identity', async () => {
    const response = await sageGraph.request('/person?id=local%3Ab001-p2%2FB', {}, env);
    expect(response.status).toBe(200);
    const record = saved.records.find((r) => r.record_id === 'graph_node:local:b001-p2/B')!;
    const profile = record.data.sourceProfile!;
    expect(await response.json()).toMatchObject({
      name: profile.name,
      nameHe: profile.nameHe,
      summary: profile.summary,
      summaryHe: profile.summaryHe,
      resolvedTo: profile.resolvedTo,
      generation: profile.generation,
    });
  });
  it('does not turn an unrecorded person into a card', async () => {
    db.prepare("DELETE FROM sage_graph_records WHERE kind='graph_node'").run();
    expect((await sageGraph.request('/person?id=local%3Ab581-p9%2FB', {}, env)).status).toBe(404);
  });
  it('rejects a name quote that no longer matches its saved source', async () => {
    const row = saved.records.find((r) => r.record_id === 'passage:b581-p9')!;
    const passage = JSON.parse(JSON.stringify(row.data));
    passage.source.passage = '';
    db.prepare('UPDATE sage_graph_records SET payload_json=? WHERE record_id=?').run(
      JSON.stringify(passage),
      row.record_id,
    );
    expect((await sageGraph.request('/person?id=local%3Ab581-p9%2FB', {}, env)).status).toBe(503);
  });
});
