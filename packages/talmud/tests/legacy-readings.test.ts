import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { type LegacyRow, legacyCards, wholeName } from '../src/lib/sage-graph/legacy-readings';
import { sageGraph } from '../src/worker/sage-graph';
import corrected from './fixtures/corrected-name-readings.json';
import descent from './fixtures/descent-name-readings.json';
import saved from './fixtures/legacy-name-readings.json';

const records = () => structuredClone(saved.records) as LegacyRow[];
const project = (rows: LegacyRow[]) =>
  legacyCards(
    'captured',
    rows,
    rows.filter((r) => r.kind === 'registry_person'),
  );
// Fault cases mutate actual saved rows; no invented source passages or people.
function edit(rows: LegacyRow[], id: string, change: (data: Record<string, unknown>) => void) {
  const row = rows.find((r) => r.record_id === id)!;
  const data = JSON.parse(row.payload_json);
  change(data);
  row.payload_json = JSON.stringify(data);
}
describe('older first readings in the shared card', () => {
  it('keeps the local person and possible identity separate, with the saved reason', async () => {
    const result = await project(records());
    const card = result.cards.find((c) => c.id === 'proposal:b286-p3/A')!;
    expect(card).toBeDefined();
    expect(card.resolvedTo).toBeUndefined();
    expect(card.generation).toBeNull();
    expect(card.places).toEqual([]);
    expect(card.initialReading?.proposals?.[0].candidate).toBeDefined();
    expect(card.initialReading?.proposals?.[0].reason).toBe(
      JSON.parse(
        saved.records.find(
          (r) => r.kind === 'name_reading' && JSON.parse(r.payload_json).personKey === 'b286-p3/A',
        )!.payload_json,
      ).reading.reason,
    );
    expect(card.initialReading?.relationships.length).toBeGreaterThan(0);
  });
  it('does not place a context-only person on the focal page', async () => {
    const result = await project(records());
    expect(result.cards.some((c) => c.id === 'proposal:b323-p7/A')).toBe(true);
    expect(
      result.occurrences.some((o) => o.people.some((p) => p.id === 'proposal:b323-p7/A')),
    ).toBe(false);
  });
  it('keeps competing saved readings instead of choosing one by record order', async () => {
    const rows = records(),
      original = rows.find(
        (r) => r.kind === 'name_reading' && JSON.parse(r.payload_json).personKey === 'b286-p3/A',
      )!;
    rows.push({ ...original, record_id: `${original.record_id}-competing` });
    const card = (await project(rows)).cards.find((c) => c.id === 'proposal:b286-p3/A')!;
    expect(card.initialReading?.proposals).toHaveLength(2);
  });
  it('fails closed if the source or person binding changes', async () => {
    for (const id of ['passage:b286-p3', 'person:b286-p3/A']) {
      const rows = records();
      rows.find((r) => r.record_id === id)!.payload_sha256 = '0'.repeat(64);
      expect((await project(rows)).cards.some((c) => c.id === 'proposal:b286-p3/A')).toBe(false);
    }
  });
  it('does not give a candidate its registry label after the bound registry changes', async () => {
    const rows = records();
    for (const r of rows.filter((r) => r.kind === 'registry_person'))
      r.payload_sha256 = '0'.repeat(64);
    expect(
      (await project(rows)).cards.find((c) => c.id === 'proposal:b286-p3/A')!.initialReading!
        .proposals![0].candidate,
    ).toBeUndefined();
  });
  it('retains a source warning and excludes the name from page discovery', async () => {
    const rows = records(),
      r = rows.find(
        (r) => r.kind === 'name_reading' && JSON.parse(r.payload_json).personKey === 'b286-p3/A',
      )!;
    edit(rows, r.record_id, (d) => {
      d.sourceQuality = { sourceReferenceVerified: false, ref: r.ref };
    });
    const result = await project(rows);
    expect(
      result.cards.find((c) => c.id === 'proposal:b286-p3/A')!.initialReading!.proposals![0]
        .sourceWarning,
    ).toBe(true);
    expect(
      result.occurrences.some((o) => o.people.some((p) => p.id === 'proposal:b286-p3/A')),
    ).toBe(false);
  });
  it('keeps endpoints and family direction, without manufacturing unknown partners', async () => {
    const result = await project(records());
    for (const card of result.cards)
      for (const relation of card.initialReading!.relationships) {
        if (relation.subject) expect(relation.subject.id).toMatch(/^proposal:b[0-9]+-p[0-9]+\//);
        if (relation.object) expect(relation.object.id).toMatch(/^proposal:b[0-9]+-p[0-9]+\//);
        expect(relation.evidence.length).toBeGreaterThan(0);
      }
  });
});
describe('verified reference corrections', () => {
  it('uses the corrected reference while keeping the saved reading unchanged', async () => {
    const rows = structuredClone(corrected.records) as LegacyRow[];
    const result = await project(rows),
      card = result.cards.find((c) => c.id === 'proposal:b386-p0/AA');
    expect(card).toBeDefined();
    expect(card!.initialReading!.proposals![0].sourceWarning).toBe(false);
    expect(card!.ref).toBe(rows.find((r) => r.kind === 'passage')!.ref);
  });
  it('does not resolve a warning with a correction from another passage or reference', async () => {
    for (const field of ['passageId', 'legacyRef', 'canonicalRef']) {
      const rows = structuredClone(corrected.records) as LegacyRow[];
      const reading = rows.find(
        (r) => r.kind === 'name_reading' && JSON.parse(r.payload_json).personKey === 'b386-p0/AA',
      )!;
      edit(rows, reading.record_id, (d) => {
        (d.referenceCorrection as Record<string, unknown>)[field] = 'mismatch';
      });
      expect((await project(rows)).cards.some((c) => c.id === 'proposal:b386-p0/AA')).toBe(false);
    }
  });
});
it('serves captured old readings through the existing page search and person card routes', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE sage_graph_revisions(id TEXT,state TEXT,manifest_json TEXT,created_at TEXT); CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT); INSERT INTO sage_graph_revisions VALUES('captured','verified','{}','2026-10-20');",
    );
    for (const r of records())
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
      bind: (...values: (string | number)[]) => Statement;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    }
    const statement = (sql: string, values: (string | number)[] = []): Statement => ({
      bind: (...next) => statement(sql, next),
      first: async () => db.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...values) }),
    });
    const env = { SAGE_GRAPH_DB: { prepare: (sql: string) => statement(sql) } };
    const response = await sageGraph.request(
      '/initial?ref=Jerusalem%20Talmud%20Beitzah%204:1:5',
      {},
      env,
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as { occurrences: { people: { id: string }[] }[] };
    expect(
      result.occurrences.some((o) => o.people.some((p) => p.id === 'proposal:b286-p3/A')),
    ).toBe(true);
    const card = await sageGraph.request('/person?id=proposal%3Ab286-p3%2FA', {}, env);
    expect(card.status).toBe(200);
    expect(
      ((await card.json()) as { initialReading: { proposals: unknown[] } }).initialReading.proposals
        .length,
    ).toBeGreaterThan(0);
    expect((await sageGraph.request('/person?id=proposal%3ARav%20Huna', {}, env)).status).toBe(404);
  } finally {
    db.close();
  }
});
it('combines verified duplicate copies without dropping their distinct local guesses', async () => {
  const result = await project(structuredClone(corrected.records) as LegacyRow[]);
  const name = result.occurrences.find((o) => o.quote === 'רחבעם')!;
  expect(name.people.map((p) => p.id)).toEqual(['proposal:b386-p0/AA', 'proposal:b453-p5/AB']);
  expect(result.occurrences.filter((o) => o.quote === 'רחבעם')).toHaveLength(1);
});
it('keeps a reading but removes a not-a-person result from the name list', async () => {
  const rows = records(),
    row = rows.find(
      (r) => r.kind === 'name_reading' && JSON.parse(r.payload_json).personKey === 'b286-p3/A',
    )!;
  edit(rows, row.record_id, (d) => {
    (d.reading as Record<string, unknown>).entityKind = 'not_a_person';
  });
  const result = await project(rows);
  expect(result.cards.some((c) => c.id === 'proposal:b286-p3/A')).toBe(true);
  expect(result.occurrences.some((o) => o.people.some((p) => p.id === 'proposal:b286-p3/A'))).toBe(
    false,
  );
});
it('counts supported teaching readings without calling transmission a response', async () => {
  const result = await project(records());
  const transmission = result.cards
    .flatMap((c) => c.initialReading!.relationships)
    .filter((r) => r.reading.verb === 'quoted_teaching');
  expect(transmission.length).toBeGreaterThan(0);
  expect(transmission.every((r) => r.reading.modality !== 'response_to_teaching')).toBe(true);
  expect(transmission.some((r) => r.countable)).toBe(true);
});
it('shows supported descent as family while keeping the rejected immediate-parent claim separate', async () => {
  const result = await project(structuredClone(descent.records) as LegacyRow[]);
  const relations = result.cards.flatMap((c) => c.initialReading!.relationships);
  const descendants = relations.filter((r) => r.reading.relation === 'group_descent');
  expect(descendants.length).toBeGreaterThan(0);
  expect(descendants.some((r) => r.countable && r.reading.category === 'family')).toBe(true);
  expect(relations.filter((r) => r.reviewStatus === 'rejected').every((r) => !r.countable)).toBe(
    true,
  );
});
it('rejects a shorter substring inside a real captured Hebrew name', () => {
  const passage = corrected.records.find((r) => r.record_id === 'passage:b386-p0')!;
  const text = JSON.parse(passage.payload_json).source.passage;
  expect(text.includes('רחבעם')).toBe(true);
  expect(wholeName(text, 'חבעם')).toBe(false);
});
it('labels a captured attempt without saying the action was completed', async () => {
  const result = await project(records());
  const attempts = result.cards
    .flatMap((c) => c.initialReading!.relationships)
    .filter((r) => r.reviewStatus === 'attempted');
  expect(attempts.length).toBeGreaterThan(0);
  expect(attempts.every((r) => r.reading.scene_status === 'actual_report')).toBe(true);
});
