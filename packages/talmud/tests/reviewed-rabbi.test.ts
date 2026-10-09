import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IdentifiedRabbi } from '../src/client/dafContext';
import { app } from '../src/worker/index';
import { RABBI_PLACES } from '../src/worker/rabbi-places';
import {
  loadRabbiEntry,
  loadReviewedRabbiEntries,
  type RegistryDatabase,
  type RegistryStatement,
} from '../src/worker/reviewed-rabbi';
import later from './fixtures/elazar-later-registry.json';
import captured from './fixtures/reviewed-elazar.json';

// The person and source are from the reviewed Shemot Rabbah 52:5 reading.
// Tests vary publication states and corrupt copies, not historical facts.
let sqlite: DatabaseSync;
let db: RegistryDatabase;

function statement(sql: string, values: (string | number)[] = []): RegistryStatement {
  return {
    bind: (...next) => statement(sql, next),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  };
}

function revision(id: string, createdAt: string) {
  sqlite
    .prepare('INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES(?,?,?,?)')
    .run(id, '{}', 'loading', createdAt);
}

function person(revisionId: string, authority = 'source_review', payload = captured.entry) {
  sqlite
    .prepare(
      `INSERT INTO sage_graph_records
       (revision_id,record_id,kind,authority,decision,payload_sha256,payload_json)
       VALUES(?,?,'registry_person',?,'supported','not-used-by-reader',?)`,
    )
    .run(revisionId, `registry_person:${captured.slug}`, authority, JSON.stringify(payload));
}

function verify(id: string) {
  sqlite.prepare("UPDATE sage_graph_revisions SET state='verified' WHERE id=?").run(id);
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(new URL('../migrations-sage-graph/0001_graph.sql', import.meta.url), 'utf8'),
  );
  db = { prepare: (sql) => statement(sql) };
});
afterEach(() => sqlite.close());

describe('reviewed registry people', () => {
  it('keeps the later namesake and old duplicate links in the bundled registry', async () => {
    expect(await loadRabbiEntry(db, 'rabbi-elazar-b-yose')).toEqual(
      RABBI_PLACES.rabbis['rabbi-elazar-b-yose'],
    );
    expect(await loadRabbiEntry(db, 'rabbi-shimon-bar-abba')).toEqual(
      RABBI_PLACES.rabbis['rabbi-shimon-b-abba'],
    );
    expect(await loadRabbiEntry(db, captured.slug)).toBeNull();
  });

  it('publishes the new person to card lookup and search only after verification', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed');
    expect(await loadRabbiEntry(db, captured.slug)).toBeNull();
    expect(await loadReviewedRabbiEntries(db)).toEqual({});
    verify('reviewed');
    const entry = await loadRabbiEntry(db, captured.slug);
    expect(entry?.canonical).toBe(captured.entry.canonical);
    expect(entry?.generation).toBeNull();
    expect(await loadReviewedRabbiEntries(db)).toEqual({ [captured.slug]: entry });
  });

  it('ignores a newer unfinished revision, then respects removal in the next verified revision', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed');
    verify('reviewed');
    revision('next', '2026-10-09T00:01:00Z');
    expect((await loadRabbiEntry(db, captured.slug))?.canonical).toBe(captured.entry.canonical);
    verify('next');
    expect(await loadRabbiEntry(db, captured.slug)).toBeNull();
    expect(await loadReviewedRabbiEntries(db)).toEqual({});
  });

  it('does not treat an unreviewed registry import as an approved new person', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed', 'registry');
    verify('reviewed');
    expect(await loadRabbiEntry(db, captured.slug)).toBeNull();
    expect(await loadReviewedRabbiEntries(db)).toEqual({});
  });

  it('rejects missing source evidence instead of reporting that the person does not exist', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed', 'source_review', { ...captured.entry, sources: [] });
    verify('reviewed');
    await expect(loadRabbiEntry(db, captured.slug)).rejects.toThrow();
    await expect(loadReviewedRabbiEntries(db)).rejects.toThrow();
  });

  it('rejects prototype keys and malformed person identifiers', async () => {
    expect(await loadRabbiEntry(db, 'constructor')).toBeNull();
    expect(await loadRabbiEntry(db, '__proto__')).toBeNull();
    expect(await loadRabbiEntry(db, "' OR 1=1 --")).toBeNull();
  });

  it('pins search pagination to its original revision when a newer one is verified', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed');
    verify('reviewed');
    revision('next', '2026-10-09T00:01:00Z');
    const queriedRevisions: (string | number)[] = [];
    const changingDb: RegistryDatabase = {
      prepare: (sql) => ({
        ...statement(sql),
        bind: (...values) => ({
          ...statement(sql, values),
          all: async <T>() => {
            queriedRevisions.push(values[0]);
            const result = await statement(sql, values).all<T>();
            if (queriedRevisions.length === 1) verify('next');
            return result;
          },
        }),
      }),
    };
    expect(Object.keys(await loadReviewedRabbiEntries(changingDb, 1))).toEqual([captured.slug]);
    expect(queriedRevisions).toEqual(['reviewed', 'reviewed']);
  });

  it('uses the same exact identity in the card, entity response, and search result', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    person('reviewed', 'user_correction');
    verify('reviewed');
    // An absent interaction asset is a normal state for a newly added person.
    const env = {
      SAGE_GRAPH_DB: db,
      ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    };
    const card = await app.request(`/api/rabbi/${captured.slug}`, {}, env);
    expect(card.status).toBe(200);
    const body = (await card.json()) as { rabbi: IdentifiedRabbi };
    expect(body.rabbi.slug).toBe(captured.slug);
    expect(body.rabbi.name).toBe(captured.entry.canonical);
    const entity = await app.request(`/api/entity/rabbi/${captured.slug}`, {}, env);
    expect(entity.status).toBe(200);
    const entityBody = (await entity.json()) as {
      pieces: { identity: IdentifiedRabbi; geography: unknown };
    };
    expect(entityBody.pieces.identity).toEqual(body.rabbi);
    expect(entityBody.pieces.geography).toBeNull();
    const search = await app.request('/api/sages-index', {}, env);
    expect(search.status).toBe(200);
    const { rows } = (await search.json()) as {
      rows: { slug: string; canonical: string }[];
    };
    expect(rows.find((r: { slug: string }) => r.slug === captured.slug)?.canonical).toBe(
      captured.entry.canonical,
    );
    const enriched = await app.request(`/api/admin/rabbi-enriched/${captured.slug}`, {}, env);
    expect(enriched.status).toBe(200);
    expect(await enriched.json()).toEqual({
      slug: captured.slug,
      record: null,
      profileSource: 'reviewed_registry',
    });
  });

  it('keeps a human removal of biography ahead of the bundled and cached versions', async () => {
    revision('reviewed', '2026-10-09T00:00:00Z');
    // Remove one field from the captured later namesake to exercise a correction.
    const corrected = {
      ...later.entry,
      identityStatus: 'reviewed_person',
      bio: null,
      sources: [later.source],
    };
    sqlite
      .prepare(
        `INSERT INTO sage_graph_records
         (revision_id,record_id,kind,authority,decision,payload_sha256,payload_json)
         VALUES(?,?,'registry_person','user_correction','supported','not-used-by-reader',?)`,
      )
      .run('reviewed', `registry_person:${later.slug}`, JSON.stringify(corrected));
    verify('reviewed');
    expect(RABBI_PLACES.rabbis[later.slug].bio).toBeTruthy();
    expect((await loadRabbiEntry(db, later.slug))?.bio).toBeNull();
    const response = await app.request(
      `/api/admin/rabbi-enriched/${later.slug}`,
      {},
      {
        SAGE_GRAPH_DB: db,
        CACHE: {
          get: () => {
            throw new Error('Old biography must not be read');
          },
        },
      },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { record: unknown }).record).toBeNull();
  });
});
