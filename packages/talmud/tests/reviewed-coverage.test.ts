import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countCoverage, loadReviewedCoverage } from '../src/worker/reviewed-coverage';
import type { RegistryDatabase, RegistryStatement } from '../src/worker/reviewed-rabbi';
import { registerObservationRoutes } from '../src/worker/routes/observations';
import type { Bindings } from '../src/worker/types';
import saved from './fixtures/reviewed-coverage.json';
import aliasObservation from './fixtures/reviewed-coverage-alias.json';
import observation from './fixtures/reviewed-coverage-observation.json';

// These identity rows and the annotation slice were captured from production.
// Tests change storage states and correction decisions, not names or passages.
let sqlite: DatabaseSync;
let db: RegistryDatabase;
function statement(sql: string, values: (string | number)[] = []): RegistryStatement {
  return {
    bind: (...next) => statement(sql, next),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  };
}
function publish(id = 'reviewed') {
  sqlite.prepare("UPDATE sage_graph_revisions SET state='verified' WHERE id=?").run(id);
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(new URL('../migrations-sage-graph/0001_graph.sql', import.meta.url), 'utf8'),
  );
  sqlite
    .prepare(
      "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES('reviewed','{}','loading','2026-10-09')",
    )
    .run();
  for (const r of saved.records) {
    sqlite
      .prepare(`INSERT INTO sage_graph_records
      (revision_id,record_id,kind,ref,subject_id,authority,decision,payload_sha256,payload_json)
      VALUES('reviewed',?,?,?,?,?,?,'not-used-by-reader',?)`)
      .run(r.record_id, r.kind, r.ref, r.subject_id, r.authority, r.decision, r.payload_json);
  }
  db = { prepare: (sql) => statement(sql) };
});
afterEach(() => sqlite.close());

describe('reviewed appearance counts', () => {
  it('includes a new person absent from the old annotations', async () => {
    publish();
    const data = await loadReviewedCoverage(db, 'rav-huna-bar-hiyyon');
    expect(data.pages).toEqual(['Shabbat 139b']);
    expect(countCoverage(data.pages)).toEqual({ dafCount: 1, byTractate: { Shabbat: 1 } });
  });

  it('deduplicates repeated identities and keeps other collections outside Shas', async () => {
    publish();
    const data = await loadReviewedCoverage(db, 'rabbi-shimon-b-abba');
    expect(data.pages).toEqual([]);
    expect(data.otherPassageCount).toBe(1);
    const chronicle = await loadReviewedCoverage(db, 'rav-yehudah-b-yechezkel');
    expect(chronicle.pages).toEqual([]);
    expect(chronicle.otherPassageCount).toBe(1);
  });

  it('does not read an unfinished revision and sees a later verified removal', async () => {
    await expect(loadReviewedCoverage(db, 'rav-huna-bar-hiyyon')).rejects.toThrow();
    publish();
    sqlite
      .prepare(
        "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES('next','{}','loading','2026-10-10')",
      )
      .run();
    expect((await loadReviewedCoverage(db, 'rav-huna-bar-hiyyon')).pages).toHaveLength(1);
    publish('next');
    expect((await loadReviewedCoverage(db, 'rav-huna-bar-hiyyon')).pages).toEqual([]);
  });

  it('lets a human rejection override an older accepted reading', async () => {
    const row = saved.records.find((r) => r.record_id === 'source_identity:b018-p2/C')!;
    sqlite
      .prepare(`INSERT INTO sage_graph_records
      (revision_id,record_id,kind,ref,subject_id,authority,decision,payload_sha256,payload_json)
      VALUES('reviewed',?,'accepted_identity',?,?,'user_correction','rejected','not-used-by-reader',?)`)
      .run('accepted_identity:b018-p2/C', row.ref, row.subject_id, row.payload_json);
    publish();
    expect((await loadReviewedCoverage(db, row.subject_id)).pages).toEqual([]);
  });

  it('does not turn a failed database read into zero appearances', async () => {
    await expect(loadReviewedCoverage(undefined, 'rav-huna-bar-hiyyon')).rejects.toThrow();
    const unavailable: RegistryDatabase = {
      prepare: () => {
        throw new Error('Unavailable');
      },
    };
    await expect(loadReviewedCoverage(unavailable, 'rav-huna-bar-hiyyon')).rejects.toThrow(
      'Unavailable',
    );
  });
});

describe('the card coverage response', () => {
  const app = new Hono<{ Bindings: Bindings }>();
  registerObservationRoutes(app);
  const slug = observation.slug;
  const sliceKey = `rabbi-obs:v1:${slug}:moed_katan:9b`;
  const aggregateKey = `rabbi-obs-agg:v1:${slug}:all:9999:s`;
  function cache(entries: Map<string, string>) {
    return {
      get: async (key: string) => entries.get(key) ?? null,
      put: async (key: string, value: string) => {
        entries.set(key, value);
      },
      list: async () => ({ keys: [{ name: sliceKey }], list_complete: true }),
    };
  }
  const url = `/api/rabbi-observations/${slug}?summary=1&min=9999&coverage=1`;

  it('includes pages still stored under a merged person ID and caches that union', async () => {
    publish();
    const key = 'rabbi-obs:v1:rabbi-shimon-bar-abba:chullin:116b';
    const entries = new Map([[key, JSON.stringify(aliasObservation)]]);
    let reads = 0;
    const kv = {
      ...cache(entries),
      list: async ({ prefix }: { prefix: string }) => {
        reads++;
        return {
          keys: [...entries.keys()]
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ name })),
          list_complete: true,
        };
      },
    };
    const request = '/api/rabbi-observations/rabbi-shimon-b-abba?summary=1&min=9999&coverage=1';
    const env = { CACHE: kv, SAGE_GRAPH_DB: db };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await app.request(request, {}, env);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        dafCount: 1,
        byTractate: { Chullin: 1 },
        reviewedOtherPassages: 1,
      });
    }
    expect(reads).toBe(2);
  });

  it('rebuilds an old summary, deduplicates the reviewed page, and caches only annotations', async () => {
    publish();
    const entries = new Map([
      [sliceKey, JSON.stringify(observation)],
      [aggregateKey, JSON.stringify({ dafCount: 1, byTractate: { 'Moed Katan': 1 } })],
    ]);
    const response = await app.request(url, {}, { CACHE: cache(entries), SAGE_GRAPH_DB: db });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      dafCount: 1,
      byTractate: { 'Moed Katan': 1 },
      reviewedDafCount: 1,
      coverageRevision: 'reviewed',
    });
    const stored = JSON.parse(entries.get(aggregateKey)!);
    expect(stored.coveragePages).toEqual(['Moed Katan 9b']);
    expect(stored).not.toHaveProperty('coverageRevision');
  });

  it('refreshes reviewed counts even when the annotation summary remains cached', async () => {
    publish();
    const entries = new Map([[sliceKey, JSON.stringify(observation)]]);
    const env = { CACHE: cache(entries), SAGE_GRAPH_DB: db };
    expect(await (await app.request(url, {}, env)).json()).toMatchObject({ reviewedDafCount: 1 });
    sqlite
      .prepare(
        "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES('next','{}','loading','2026-10-10')",
      )
      .run();
    publish('next');
    const result = await (await app.request(url, {}, env)).json();
    expect(result).toMatchObject({ dafCount: 1, reviewedDafCount: 0, coverageRevision: 'next' });
  });

  it('reports incomplete annotation reads rather than showing a false total', async () => {
    publish();
    const response = await app.request(url, {}, { CACHE: cache(new Map()), SAGE_GRAPH_DB: db });
    expect(response.status).toBe(503);
  });
});
