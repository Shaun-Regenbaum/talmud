import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { identityCards, textHash } from '../src/lib/sage-graph/identity-readings';
import type { LegacyRow } from '../src/lib/sage-graph/legacy-readings';
import { sageGraph } from '../src/worker/sage-graph';
import saved from './fixtures/identity-reading-basis.json';

const records = () => structuredClone(saved.records) as LegacyRow[];
describe('existing identity reasoning', () => {
  it('keeps unresolved names and their saved reasons without inventing an identity or era', async () => {
    const result = await identityCards('captured', records());
    const person = result.cards.find((p) => p.id === 'proposal:b312-p0/I')!;
    expect(person).toBeDefined();
    expect(person.initialReading!.proposals![0].reason).toContain('Yair');
    expect(person.initialReading!.proposals![0].candidate).toBeUndefined();
    expect(person.generation).toBeNull();
    expect(person.resolvedTo).toBeUndefined();
  });
  it('keeps the assessment reason alongside the original proposal', async () => {
    const result = await identityCards('captured', records());
    const card = result.cards.find((p) => p.id === 'proposal:b000-p0/A')!;
    expect(card.initialReading!.proposals!.some((p) => p.reviewDecision === 'held')).toBe(true);
    expect(card.initialReading!.proposals!.some((p) => p.id.startsWith('identity_proposal:'))).toBe(
      true,
    );
  });
  it('preserves an exact-key accepted identity link without accepting a candidate elsewhere', async () => {
    const result = await identityCards('captured', records());
    const accepted = result.cards.find((p) => p.id === 'proposal:b267-p9/A')!;
    expect(
      accepted.initialReading!.reviewedPeople!.some((p) => p.id === 'rav-hiyya-bar-avin'),
    ).toBe(true);
    expect(
      result.cards.find((p) => p.id === 'proposal:b312-p0/I')!.initialReading!.reviewedPeople,
    ).toEqual([]);
  });
  it('replays a canonical correction from its exact predecessor before checking the frozen case hash', async () => {
    const result = await identityCards(
      'captured',
      structuredClone(saved.corrected) as LegacyRow[],
      structuredClone(saved.predecessors) as LegacyRow[],
    );
    expect(result.cards.length).toBeGreaterThan(0);
    expect(
      result.cards.every((c) => c.ref === saved.corrected.find((r) => r.kind === 'passage')!.ref),
    ).toBe(true);
    expect(
      (await identityCards('captured', structuredClone(saved.corrected) as LegacyRow[], [])).cards,
    ).toEqual([]);
  });
  it('rejects a changed source or original case binding', async () => {
    const rows = records();
    const row = rows.find((r) => r.record_id === 'passage:b312-p0')!;
    const d = JSON.parse(row.payload_json);
    d.source.passage += ' ';
    row.payload_json = JSON.stringify(d);
    expect(
      (await identityCards('captured', rows)).cards.some((c) => c.id === 'proposal:b312-p0/I'),
    ).toBe(false);
  });
});
it('preserves the second reading and the held audit finding', async () => {
  const result = await identityCards('captured', records());
  const audited = result.cards.find((c) =>
    c.initialReading!.proposals!.some((p) => p.reviewDecision === 'disagreement'),
  )!;
  expect(audited).toBeDefined();
  expect(
    audited.initialReading!.proposals!.some(
      (p) => p.reviewDecision === 'held' && p.reason.includes('Bibi'),
    ),
  ).toBe(true);
});

// Fault mutations below start from the captured records; no invented source text.
it('rejects a correction that changes reasoning even when its outer hash is recomputed', async () => {
  const rows = structuredClone(saved.corrected) as LegacyRow[];
  for (const row of rows.filter((r) => r.kind === 'identity_proposal')) {
    const data = JSON.parse(row.payload_json);
    if (data.answer) data.answer.reason += ' altered';
    row.payload_json = JSON.stringify(data);
    row.payload_sha256 = await textHash(row.payload_json);
  }
  expect((await identityCards('captured', rows, saved.predecessors as LegacyRow[])).cards).toEqual(
    [],
  );
});
it('rejects corrupted correction predecessors', async () => {
  const before = structuredClone(saved.predecessors) as LegacyRow[];
  for (const row of before) row.payload_json += ' ';
  expect((await identityCards('captured', saved.corrected as LegacyRow[], before)).cards).toEqual(
    [],
  );
});
it('does not partially retain a proposal with an altered audit', async () => {
  const rows = records();
  const auditedKeys = new Set<string>();
  for (const row of rows.filter((r) => r.kind === 'identity_proposal')) {
    const data = JSON.parse(row.payload_json);
    if (!data.audit) continue;
    auditedKeys.add(`proposal:${data.case.personKey}`);
    data.audit.review.finding += ' altered';
    row.payload_json = JSON.stringify(data);
    row.payload_sha256 = await textHash(row.payload_json);
  }
  expect(auditedKeys.size).toBeGreaterThan(0);
  const result = await identityCards('captured', rows);
  expect(result.cards.some((c) => auditedKeys.has(c.id))).toBe(false);
});

it('shows the actual accepted-local Aha reason without requiring a model answer', async () => {
  const result = await identityCards('captured', saved.localIdentity as LegacyRow[]);
  const card = result.cards.find((c) => c.id === 'proposal:b431-p9/E')!;
  expect(
    card.initialReading!.proposals!.some(
      (p) => p.reason === 'Aha is Abba’s brother. One version praises him for repentance.',
    ),
  ).toBe(true);
  expect(card.generation).toBeNull();
  expect(result.occurrences.find((o) => o.people.some((p) => p.id === card.id))!.passageOnly).toBe(
    true,
  );
});

it('labels the earlier candidate after an exact rejected review, including human overrides', async () => {
  for (const authority of ['source_review', 'user_correction']) {
    const rows = records();
    const row = rows.find(
      (r) =>
        r.kind === 'identity_assessment' && JSON.parse(r.payload_json).personKey === 'b000-p0/A',
    )!;
    const data = JSON.parse(row.payload_json);
    data.outcome = 'rejected';
    row.authority = authority;
    row.payload_json = JSON.stringify(data);
    row.payload_sha256 = await textHash(row.payload_json);
    const card = (await identityCards('captured', rows)).cards.find(
      (c) => c.id === 'proposal:b000-p0/A',
    )!;
    expect(
      card.initialReading!.proposals!.find((p) => p.id === data.proposalId)!.reviewDecision,
    ).toBe('rejected');
  }
});

it('serves source-identity-only reasons through page discovery and preserves the local card route', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE sage_graph_revisions(id TEXT,state TEXT,manifest_json TEXT,created_at TEXT); CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT); CREATE TABLE sage_graph_record_versions AS SELECT * FROM sage_graph_all_records; INSERT INTO sage_graph_revisions VALUES('captured','verified','{}','2026-10-20');",
    );
    for (const r of [...records(), ...saved.localIdentity])
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
    const response = await sageGraph.request('/initial?ref=Shabbat%2056b:18', {}, env);
    expect(response.status).toBe(200);
    const result = (await response.json()) as { occurrences: { people: { id: string }[] }[] };
    expect(
      result.occurrences.some((o) => o.people.some((p) => p.id === 'proposal:b431-p9/E')),
    ).toBe(true);
    const local = await sageGraph.request('/person?id=local%3Ab000-p0%2FA', {}, env);
    expect(local.status).toBe(200);
    const card = (await local.json()) as {
      initialReading?: unknown;
      readingBasis?: unknown;
      id: string;
    };
    expect(card.id).toBe('local:b000-p0/A');
    expect(card.initialReading).toBeUndefined();
    expect(card.readingBasis).toBeDefined();
  } finally {
    db.close();
  }
});
it('lets a current human accepted identity outrank an older rejected assessment', async () => {
  const rows = records();
  const assessment = rows.find(
    (r) => r.kind === 'identity_assessment' && JSON.parse(r.payload_json).personKey === 'b267-p9/A',
  )!;
  const data = JSON.parse(assessment.payload_json);
  data.outcome = 'rejected';
  assessment.payload_json = JSON.stringify(data);
  assessment.payload_sha256 = await textHash(assessment.payload_json);
  const accepted = rows.find(
    (r) => r.kind === 'source_identity' && JSON.parse(r.payload_json).personKey === 'b267-p9/A',
  )!;
  accepted.authority = 'user_correction';
  const card = (await identityCards('captured', rows)).cards.find(
    (c) => c.id === 'proposal:b267-p9/A',
  )!;
  expect(
    card.initialReading!.proposals!.find((p) => p.id === data.proposalId)!.reviewDecision,
  ).toBe('current');
  expect(
    card.initialReading!.proposals!.find((p) => p.id === assessment.record_id)!.reviewDecision,
  ).toBe('rejected');
});
