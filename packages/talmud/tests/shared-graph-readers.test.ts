import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadReviewedCoverage } from '../src/worker/reviewed-coverage';
import {
  loadRabbiEntry,
  type RegistryDatabase,
  type RegistryStatement,
} from '../src/worker/reviewed-rabbi';
import { sageGraph } from '../src/worker/sage-graph';
import cards from './fixtures/local-person-cards.json';
import coverage from './fixtures/reviewed-coverage.json';
import rabbi from './fixtures/reviewed-elazar.json';

let sqlite: DatabaseSync;
let db: RegistryDatabase;
function statement(sql: string, values: (string | number)[] = []): RegistryStatement {
  return {
    bind: (...next) => statement(sql, next),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  };
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function record(
  id: string,
  kind: string,
  payload: string,
  ref: string | null = null,
  subject: string | null = null,
  authority = 'source_review',
  decision: string | null = null,
) {
  const row = [id, kind, null, ref, subject, null, authority, decision, hash(payload), payload];
  const result = sqlite
    .prepare(`INSERT INTO sage_graph_record_versions
    (version_sha256,record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(hash(JSON.stringify(row)), ...row);
  sqlite
    .prepare("INSERT INTO sage_graph_revision_members VALUES('shared',?,?)")
    .run(id, result.lastInsertRowid);
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_graph.sql', '0002_protect_destination.sql', '0003_shared_records.sql'])
    sqlite.exec(readFileSync(new URL(`../migrations-sage-graph/${name}`, import.meta.url), 'utf8'));
  sqlite
    .prepare('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES(?,?,?)')
    .run('shared', '{"storageFormat":"shared-v1"}', 'loading');
  for (const row of cards.records) record(row.record_id, row.kind, JSON.stringify(row.data));
  for (const row of coverage.records)
    record(
      row.record_id,
      row.kind,
      row.payload_json,
      row.ref,
      row.subject_id,
      row.authority,
      row.decision,
    );
  record(
    `registry_person:${rabbi.slug}`,
    'registry_person',
    JSON.stringify(rabbi.entry),
    rabbi.sourcePassage,
    rabbi.slug,
    'source_review',
    'supported',
  );
  sqlite.exec("UPDATE sage_graph_revisions SET state='verified' WHERE id='shared'");
  db = { prepare: (sql) => statement(sql) };
});
afterEach(() => sqlite.close());

describe('reader APIs using shared graph records', () => {
  it('opens a passage-local card with the same source quote', async () => {
    const response = await sageGraph.request(
      '/person?id=local%3Ab581-p9%2FB',
      {},
      { SAGE_GRAPH_DB: db },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'local:b581-p9/B',
      quote: 'בר רב קטינא',
      revision: 'shared',
    });
  });
  it('returns the reviewed registry person and coverage', async () => {
    expect(await loadRabbiEntry(db, rabbi.slug)).toMatchObject({
      canonical: rabbi.entry.canonical,
      canonicalHe: rabbi.entry.canonicalHe,
      bio: rabbi.entry.bio,
      sources: rabbi.entry.sources,
    });
    expect(await loadReviewedCoverage(db, 'rav-huna-bar-hiyyon')).toMatchObject({
      revision: 'shared',
      pages: ['Shabbat 139b'],
    });
  });
  it('paginates records without hiding or repeating a shared source', async () => {
    const found: string[] = [];
    let cursor = '';
    do {
      const response = await sageGraph.request(
        `/records?kind=passage&limit=1&after=${encodeURIComponent(cursor)}`,
        {},
        { SAGE_GRAPH_DB: db },
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        records: { record_id: string }[];
        nextCursor: string | null;
      };
      found.push(...result.records.map((row) => row.record_id));
      cursor = result.nextCursor ?? '';
      expect(found.length).toBeLessThanOrEqual(cards.records.length);
    } while (cursor);
    expect(found).toEqual(
      cards.records
        .filter((row) => row.kind === 'passage')
        .map((row) => row.record_id)
        .sort(),
    );
  });
});
