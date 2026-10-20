import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InitialOccurrence } from '../src/lib/sage-graph/initial-readings';
import type { SourcePerson } from '../src/lib/sage-graph/types';
import { sageGraph } from '../src/worker/sage-graph';
import saved from './fixtures/initial-source-readings.json';
import ownership from './fixtures/source-reading-coverage.json';

type InitialResponse = {
  status: string;
  occurrences: InitialOccurrence[];
  sources?: { ref: string; unitKey: string; readingPassageIds: string[] }[];
};
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE sage_graph_revisions(id TEXT,state TEXT,manifest_json TEXT,created_at TEXT); CREATE TABLE sage_graph_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,authority TEXT,decision TEXT,payload_json TEXT); CREATE VIEW sage_graph_all_records AS SELECT * FROM sage_graph_records;',
  );
  db.prepare(
    "INSERT INTO sage_graph_revisions VALUES('captured','verified','{}','2026-10-20')",
  ).run();
  for (const r of saved.records)
    db.prepare("INSERT INTO sage_graph_records VALUES('captured',?,?,?,?,?,?,?)").run(
      r.record_id,
      r.kind,
      r.passage_id,
      r.ref,
      r.authority,
      r.decision,
      JSON.stringify(r.data),
    );
});
afterEach(() => db.close());
function statement(sql: string, values: string[] = []) {
  return {
    bind: (...next: string[]) => statement(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
  };
}
const env = { SAGE_GRAPH_DB: { prepare: (sql: string) => statement(sql) } };
const request = (url: string) => sageGraph.request(url, {}, env);

describe('initial source readings from actual captures', () => {
  it('shows only primary occurrences on the requested page', async () => {
    const response = await request('/initial?ref=Shabbat%20153b');
    expect(response.status).toBe(200);
    const data = (await response.json()) as InitialResponse;
    expect(data.status).toBe('initial_proposal');
    expect(data.occurrences).toHaveLength(1);
    expect(data.occurrences[0].quote).toBe('רבא');
    expect(data.occurrences[0].ref).toBe('Shabbat 153b:13');
  });
  it('uses the same person card envelope without claiming an identity or era', async () => {
    const data = (await (
      await request('/initial?ref=Pesachim%2071b:10')
    ).json()) as InitialResponse;
    expect(data.occurrences).toHaveLength(2);
    const id = data.occurrences[0].people[0].id;
    const response = await request(`/person?id=${encodeURIComponent(id)}`);
    expect(response.status).toBe(200);
    const person = (await response.json()) as SourcePerson;
    expect(person).toMatchObject({ id, summary: '', summaryHe: '', generation: null, places: [] });
    expect(person.resolvedTo).toBeUndefined();
    expect(person.initialReading!.reason).toBeTruthy();
    expect(person.initialReading!.relationships.length).toBeGreaterThan(0);
    const relationships = person.initialReading!.relationships;
    expect(relationships.some((r) => r.subject?.id === id)).toBe(true);
    expect(relationships.some((r) => r.object?.id === id)).toBe(true);
    expect(relationships.every((r) => !!r.subject?.name && !!r.object?.name)).toBe(true);
    expect(person.quote).toBe(data.occurrences[0].quote);
  });
  it('does not expose a reading without its source envelope', async () => {
    const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
    const id = data.occurrences[0].people[0].id;
    db.prepare("DELETE FROM sage_graph_records WHERE kind='source_reading'").run();
    expect((await request(`/person?id=${encodeURIComponent(id)}`)).status).toBe(404);
  });
  it('does not reinterpret reviewed facts as initial readings', async () => {
    db.prepare("UPDATE sage_graph_records SET authority='source_review'").run();
    const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
    expect(data.occurrences).toEqual([]);
  });
  it('bounds queries and does not turn an unknown ID into a person', async () => {
    expect((await request('/initial')).status).toBe(400);
    expect((await request('/person?id=reading:unknown/p1')).status).toBe(404);
  });
});

function installOwnership() {
  for (const r of ownership.records)
    db.prepare("INSERT INTO sage_graph_records VALUES('captured',?,?,?,?,?,?,?)").run(
      r.record_id,
      r.kind,
      r.passage_id,
      r.ref,
      r.authority,
      r.decision,
      JSON.stringify(r.data),
    );
}

describe('explicit publication ownership of captured source segments', () => {
  it('shows context names only at their own exact source and preserves original roles', async () => {
    const before = (await (
      await request('/initial?ref=Shabbat%20153b:12')
    ).json()) as InitialResponse;
    expect(before.occurrences).toEqual([]);
    installOwnership();
    const response = await request('/initial?ref=Shabbat%20153b:12');
    expect(response.status).toBe(200);
    const result = (await response.json()) as InitialResponse;
    expect(result.occurrences.length).toBeGreaterThan(0);
    expect(result.occurrences.every((o) => o.ref === 'Shabbat 153b:12')).toBe(true);
    expect(result.occurrences.some((o) => o.quote === 'רמי בר חמא')).toBe(true);
    const card = (await (
      await request(`/person?id=${encodeURIComponent(result.occurrences[0].people[0].id)}`)
    ).json()) as SourcePerson;
    expect(card.generation).toBeNull();
    expect(card.resolvedTo).toBeUndefined();
    const evidence = card.initialReading!.relationships.flatMap((r) => r.evidence);
    expect(evidence.some((e) => e.published && !e.primary)).toBe(true);
    const focal = (await (
      await request('/initial?ref=Shabbat%20153b:13')
    ).json()) as InitialResponse;
    expect(focal.occurrences.every((o) => o.ref === 'Shabbat 153b:13')).toBe(true);
  });
  it('does not duplicate page occurrences when several owned units point to one reading', async () => {
    installOwnership();
    const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
    expect(new Set(data.occurrences.map((o) => o.key)).size).toBe(data.occurrences.length);
    expect(
      data.occurrences.every((o) => new Set(o.people.map((p) => p.id)).size === o.people.length),
    ).toBe(true);
  });
  it('does not fall back to focal publication when an indexed job owns no units', async () => {
    installOwnership();
    db.prepare("DELETE FROM sage_graph_records WHERE kind='source_reading_unit'").run();
    const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
    expect(data.occurrences).toEqual([]);
  });
  it('rejects mismatched source text and span eligibility without inventing placement', async () => {
    installOwnership();
    const rows = db
      .prepare("SELECT record_id,payload_json FROM sage_graph_records WHERE kind='person'")
      .all();
    for (const row of rows) {
      const data = JSON.parse(row.payload_json as string);
      for (const mention of data.mentions) mention.start += 1;
      db.prepare('UPDATE sage_graph_records SET payload_json=? WHERE record_id=?').run(
        JSON.stringify(data),
        row.record_id,
      );
    }
    const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
    expect(data.occurrences).toEqual([]);
  });
});

it('reports explicitly covered sources even when the saved reading has no name there', async () => {
  installOwnership();
  const data = (await (await request('/initial?ref=Shabbat%20153b:11')).json()) as InitialResponse;
  expect(data.occurrences).toEqual([]);
  expect(data.sources).toHaveLength(1);
  expect(data.sources![0].ref).toBe('Shabbat 153b:11');
});

it('does not accept invented absolute piece offsets', async () => {
  installOwnership();
  for (const row of db
    .prepare(
      "SELECT record_id,payload_json FROM sage_graph_records WHERE kind='source_reading_coverage'",
    )
    .all()) {
    const data = JSON.parse(row.payload_json as string);
    for (const unit of data.ownedUnits) {
      unit.rawStart += 100;
      unit.rawEnd += 100;
    }
    db.prepare('UPDATE sage_graph_records SET payload_json=? WHERE record_id=?').run(
      JSON.stringify(data),
      row.record_id,
    );
  }
  const data = (await (await request('/initial?ref=Shabbat%20153b')).json()) as InitialResponse;
  expect(data.occurrences).toEqual([]);
});
