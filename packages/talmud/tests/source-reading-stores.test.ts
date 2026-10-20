import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InitialOccurrence } from '../src/lib/sage-graph/initial-readings';
import {
  canonicalJson,
  decodeStoredPassage,
  occurrenceKey,
  type StoredRow,
} from '../src/lib/sage-graph/source-reading-store';
import type { SourcePerson } from '../src/lib/sage-graph/types';
import { sageGraph } from '../src/worker/sage-graph';
// Written by research/sage-network/tests/test_source_reading_stores.py from actual validated v8
// readings 001 and 101. pieceKey.source is a real captured piece whose text is cut short on purpose.
import fixture from './fixtures/source-reading-stores.json';

const v1 = fixture.v1 as StoredRow[];
const stored = fixture.stored as StoredRow[];
const run = stored.filter((r) => r.kind === 'source_reading_run');
const passages = [...new Set(stored.filter((r) => r.passage_id).map((r) => r.passage_id!))];
const sha256 = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const rowsOf = (rows: StoredRow[], pid: string) => rows.filter((r) => r.passage_id === pid);

describe('the compact store decoder', () => {
  it('rebuilds the v1 rows byte for byte, except the documented R2-only fields', async () => {
    const view = new Map(fixture.readerView.map((r) => [r.record_id, r.payload_json]));
    for (const pid of passages) {
      const decoded = await decodeStoredPassage(pid, rowsOf(stored, pid));
      const original = new Map(rowsOf(v1, pid).map((r) => [r.record_id, r]));
      expect(decoded.map((r) => r.record_id).sort()).toEqual([...original.keys()].sort());
      for (const row of decoded) {
        const old = original.get(row.record_id)!;
        expect(row.payload_json).toBe(view.get(row.record_id) ?? old.payload_json);
        expect(row.payload_sha256).toBe(await sha256(row.payload_json));
        // Person, claim and ownership rows keep their v1 payload hashes exactly.
        if (!['passage', 'source_reading'].includes(row.kind))
          expect(row.payload_sha256).toBe(old.payload_sha256);
        const { payload_json: _a, payload_sha256: _b, ...index } = row;
        const { payload_json: _c, payload_sha256: _d, ...oldIndex } = old;
        expect(index).toEqual(oldIndex);
      }
    }
    expect(view.size).toBe(passages.length * 2);
  });

  it('computes the occurrence key of a real split piece', async () => {
    const { source, start, end, quote, key, truncated } = fixture.pieceKey;
    expect(truncated.keptCodePoints).toBe(Array.from(source.text).length);
    expect(Array.from(source.text).slice(start, end).join('')).toBe(quote);
    expect(await occurrenceKey(source, start, end)).toBe(key);
  });

  it('refuses changed payloads, other formats and anchors that miss their words', async () => {
    const pid = passages[0];
    const rows = rowsOf(stored, pid);
    const edit = async (kind: string, change: (data: Record<string, unknown>) => void) => {
      const copy = rows.map((r) => ({ ...r }));
      const row = copy.find((r) => r.kind === kind)!;
      const data = JSON.parse(row.payload_json);
      change(data);
      row.payload_json = JSON.stringify(data);
      row.payload_sha256 = await sha256(row.payload_json);
      return copy;
    };
    const tampered = rows.map((r) =>
      r.kind === 'person' ? { ...r, payload_json: `${r.payload_json} ` } : r,
    );
    await expect(decodeStoredPassage(pid, tampered)).rejects.toThrow(
      'Stored source reading changed',
    );
    await expect(
      decodeStoredPassage(pid, await edit('person', (d) => (d.format = 'source-reading-store-v1'))),
    ).rejects.toThrow('Not source-reading-store-v2 rows');
    await expect(
      decodeStoredPassage(
        pid,
        await edit('person', (d) => ((d.mentions as unknown[][])[0][4] = 'רבה')),
      ),
    ).rejects.toThrow('does not match its source words');
    await expect(
      decodeStoredPassage(
        pid,
        rows.filter((r) => r.kind !== 'source_reading'),
      ),
    ).rejects.toThrow('exactly one source_reading envelope');
    const firstUnit = rows.find((r) => r.kind === 'source_reading_unit')!;
    await expect(
      decodeStoredPassage(
        pid,
        rows.filter((r) => r !== firstUnit),
      ),
    ).rejects.toThrow('Stored ownership differs from its units');
    expect(() => canonicalJson({ cost: 1.5 })).toThrow('integers');
  });

  it('refuses rows that are not canonical, repeat an ID, or run past their text', async () => {
    const pid = passages[0];
    const rows = rowsOf(stored, pid);
    const rewrite = async (kind: string, change: (payload: string) => string) =>
      Promise.all(
        rows.map(async (r) => {
          if (r.kind !== kind) return r;
          const payload = change(r.payload_json);
          return { ...r, payload_json: payload, payload_sha256: await sha256(payload) };
        }),
      );
    type Anchor = [string, number, number, number, string];
    const json = (kind: string, change: (data: Record<string, unknown>) => void) =>
      rewrite(kind, (payload) => {
        const data = JSON.parse(payload);
        change(data);
        return canonicalJson(data);
      });
    // 2.0 parses to 2, so the rebuilt bytes could not match; the row is refused instead.
    await expect(
      decodeStoredPassage(
        pid,
        await rewrite('passage', (s) =>
          s.replace(/"focal":(\d+),"format"/, '"focal":$1.0,"format"'),
        ),
      ),
    ).rejects.toThrow('not canonical');
    await expect(
      decodeStoredPassage(
        pid,
        await json('passage', (d) => {
          const people = d.people as string[];
          people[1] = people[0];
        }),
      ),
    ).rejects.toThrow('Stored passage differs');
    const segments = JSON.parse(rows.find((r) => r.kind === 'passage')!.payload_json).segments;
    await expect(
      decodeStoredPassage(
        pid,
        await json('person', (d) => {
          const mentions = d.mentions as Anchor[];
          const text = Array.from(
            segments.find((s: { source_id: string }) => s.source_id === mentions[0][0])
              .text as string,
          );
          // The quote is the text's last two letters, but the end runs three past the text.
          mentions[0] = [
            mentions[0][0],
            text.length - 2,
            text.length + 3,
            1,
            text.slice(-2).join(''),
          ];
        }),
      ),
    ).rejects.toThrow('does not match its source words');
    await expect(
      decodeStoredPassage(pid, await json('person', (d) => (d.id = 'p99'))),
    ).rejects.toThrow('Stored person differs');
    // One owned unit listed twice and another left out still has the right count, but is refused.
    await expect(
      decodeStoredPassage(
        pid,
        await json('source_reading_coverage', (d) => {
          const sources = d.sources as { sourceId: string; owned: boolean }[];
          const owned = sources.filter((a) => a.owned);
          owned[1].sourceId = owned[0].sourceId;
        }),
      ),
    ).rejects.toThrow('Stored ownership differs from its units');
  });
});

type Db = DatabaseSync;
const migrations = join(__dirname, '../migrations-sage-graph');
function database(): Db {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(migrations).sort())
    db.exec(readFileSync(join(migrations, name), 'utf8'));
  return db;
}
/** A shared-v1 revision, loaded the way the importer loads one and then made verified. */
function publish(db: Db, id: string, manifest: object, rows: StoredRow[], createdAt: string) {
  db.prepare(
    "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES (?,?,'loading',?)",
  ).run(id, JSON.stringify({ storageFormat: 'shared-v1', ...manifest }), createdAt);
  for (const r of rows) {
    const version = db
      .prepare(
        'INSERT INTO sage_graph_record_versions(version_sha256,record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        `${id}/${r.record_id}`,
        r.record_id,
        r.kind,
        r.passage_id,
        r.ref,
        r.subject_id,
        r.object_id,
        r.authority,
        r.decision,
        r.payload_sha256,
        r.payload_json,
      );
    db.prepare(
      'INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) VALUES (?,?,?)',
    ).run(id, r.record_id, version.lastInsertRowid);
  }
  db.prepare("UPDATE sage_graph_revisions SET state='verified' WHERE id=?").run(id);
}
interface Statement {
  bind: (...v: unknown[]) => Statement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
}
const binding = (db: Db) => {
  const statement = (sql: string, values: unknown[] = []): Statement => ({
    bind: (...v) => statement(sql, v),
    first: async () => db.prepare(sql).get(...(values as string[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(values as string[])) }),
  });
  return { prepare: (sql: string) => statement(sql) };
};
const broken = {
  prepare: () => ({
    bind: () => broken.prepare(),
    first: async () => {
      throw Error('D1 is down');
    },
    all: async () => {
      throw Error('D1 is down');
    },
  }),
};

const GRAPH = 'sage-graph-00000000000000000000';
const BAVLI = 'source-readings-bavli-00000000000000000001';
const BAVLI_EMPTY = 'source-readings-bavli-00000000000000000002';
const OTHER = 'source-readings-other-00000000000000000001';
const block = (name: 'bavli' | 'other') => ({
  sourceReadingStore: { ...fixture.storeBlock, name },
});
type Initial = {
  revision: string;
  sourceRevisions: Record<'bavli' | 'other', string | null>;
  unavailableSourceStores?: string[];
  occurrences: InitialOccurrence[];
  sources: { unitKey: string; readingPassageIds: string[] }[];
  placement?: unknown;
};

let graph: Db, bavli: Db, other: Db;
let env: Record<string, unknown>;
beforeEach(() => {
  graph = database();
  bavli = database();
  other = database();
  publish(graph, GRAPH, {}, [], '2026-10-20T00:00:00.000Z');
  publish(bavli, BAVLI, block('bavli'), stored, '2026-10-20T00:00:01.000Z');
  env = {
    SAGE_GRAPH_DB: binding(graph),
    SOURCE_READINGS_BAVLI_DB: binding(bavli),
    SOURCE_READINGS_OTHER_DB: binding(other),
  };
});
afterEach(() => {
  for (const db of [graph, bavli, other]) db.close();
});
const get = async <T>(url: string) => {
  const response = await sageGraph.request(url, {}, env);
  return { status: response.status, body: (await response.json()) as T };
};
const firstPerson = async (ref: string) =>
  (await get<Initial>(`/initial?ref=${encodeURIComponent(ref)}`)).body.occurrences[0].people[0].id;

describe('reading initial names from the source-reading stores', () => {
  it('gives the same page and card as the same readings stored in the graph', async () => {
    const urls = ['/initial?ref=Shabbat%20153b&placement=v1', '/initial?ref=Pesachim%2071b:10'];
    const fromStore = await Promise.all(urls.map((u) => get<Initial>(u)));
    const id = fromStore[1].body.occurrences[0].people[0].id;
    const storeCard = await get<SourcePerson>(`/person?id=${encodeURIComponent(id)}`);
    // The same v1 rows, imported into the graph the old way, with no store bound.
    const legacy = database();
    publish(legacy, GRAPH, {}, v1, '2026-10-20T00:00:00.000Z');
    env = { SAGE_GRAPH_DB: binding(legacy) };
    const fromGraph = await Promise.all(urls.map((u) => get<Initial>(u)));
    const graphCard = await get<SourcePerson>(`/person?id=${encodeURIComponent(id)}`);
    legacy.close();
    for (const [i, store] of fromStore.entries()) {
      expect(store.status).toBe(200);
      expect(store.body.sourceRevisions).toEqual({ bavli: BAVLI, other: null });
      expect(fromGraph[i].body.sourceRevisions).toEqual({ bavli: null, other: null });
      const { sourceRevisions: _a, ...a } = store.body;
      const { sourceRevisions: _b, ...b } = fromGraph[i].body;
      expect(a).toEqual(b);
      expect(a.occurrences.length).toBeGreaterThan(0);
    }
    // These readings use English labels, which the placement rule never links, so both copies give
    // an empty placement. Placement trusts the unit payload hash, checked against v1 above.
    expect(fromStore[0].body.placement).toEqual({
      version: 'initial-name-placement-v1',
      sources: [],
      occurrences: [],
    });
    expect(storeCard.status).toBe(200);
    expect(storeCard.body.sourceStore).toBe('bavli');
    const { sourceRevisions: _c, sourceStore: _d, ...a } = storeCard.body;
    const { sourceRevisions: _e, sourceStore: _f, ...b } = graphCard.body;
    expect(a).toEqual(b);
  });

  it('reads one revision per request and serves a requested revision exactly', async () => {
    publish(bavli, BAVLI_EMPTY, block('bavli'), run, '2026-10-20T00:00:02.000Z');
    const newest = await get<Initial>('/initial?ref=Shabbat%20153b');
    expect(newest.body.sourceRevisions.bavli).toBe(BAVLI_EMPTY);
    expect(newest.body.occurrences).toEqual([]);
    const pinned = await get<Initial>(`/initial?ref=Shabbat%20153b&bavliRevision=${BAVLI}`);
    expect(pinned.body.sourceRevisions.bavli).toBe(BAVLI);
    expect(pinned.body.occurrences.length).toBeGreaterThan(0);
    const id = pinned.body.occurrences[0].people[0].id;
    expect((await get(`/person?id=${encodeURIComponent(id)}`)).status).toBe(404);
    const card = await get<SourcePerson>(
      `/person?id=${encodeURIComponent(id)}&bavliRevision=${BAVLI}`,
    );
    expect(card.body.sourceRevisions).toEqual({ bavli: BAVLI, other: null });
    for (const missing of [`${BAVLI}x`, OTHER, GRAPH])
      expect((await get(`/initial?ref=Shabbat%20153b&bavliRevision=${missing}`)).status).toBe(404);
    expect((await get(`/initial?ref=Shabbat%20153b&otherRevision=${OTHER}`)).status).toBe(404);
  });

  it('lets the graph copy of a reading win over a store copy', async () => {
    const changed = v1.map((r) => {
      if (r.kind !== 'person') return r;
      const data = JSON.parse(r.payload_json);
      return {
        ...r,
        payload_json: JSON.stringify({ ...data, label: `${data.label} (graph copy)` }),
      };
    });
    graph.close();
    graph = database();
    publish(graph, GRAPH, {}, changed, '2026-10-20T00:00:00.000Z');
    env.SAGE_GRAPH_DB = binding(graph);
    const page = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(
      page.body.occurrences.every((o) => o.people.every((p) => p.name.endsWith('(graph copy)'))),
    ).toBe(true);
    const card = await get<SourcePerson>(
      `/person?id=${encodeURIComponent(page.body.occurrences[0].people[0].id)}`,
    );
    expect(card.body.name.endsWith('(graph copy)')).toBe(true);
    expect(card.body.sourceStore).toBeUndefined();
  });

  it('refuses a reading held by both stores, or by a store for the wrong corpus', async () => {
    publish(other, OTHER, block('other'), stored, '2026-10-20T00:00:01.000Z');
    expect((await get('/initial?ref=Pesachim%2071b:10')).status).toBe(503);
    const id = `reading:${passages[1]}/p1`;
    expect((await get(`/person?id=${encodeURIComponent(id)}`)).status).toBe(503);
    other.close();
    other = database();
    env.SOURCE_READINGS_OTHER_DB = binding(other);
    publish(
      other,
      'source-readings-bavli-00000000000000000009',
      block('bavli'),
      [],
      '2026-10-20T00:00:01.000Z',
    );
    const page = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(page.body.unavailableSourceStores).toEqual(['other']);
    expect(page.body.sourceRevisions.other).toBeNull();
  });

  it('keeps showing graph readings when a store is down or not bound', async () => {
    const id = await firstPerson('Pesachim 71b:10');
    env.SOURCE_READINGS_BAVLI_DB = broken;
    const page = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(page.status).toBe(200);
    expect(page.body.unavailableSourceStores).toEqual(['bavli']);
    expect(page.body.occurrences).toEqual([]);
    expect((await get(`/person?id=${encodeURIComponent(id)}`)).status).toBe(503);
    expect((await get(`/initial?ref=Pesachim%2071b:10&bavliRevision=${BAVLI}`)).status).toBe(503);
    delete env.SOURCE_READINGS_BAVLI_DB;
    const unbound = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(unbound.body.sourceRevisions).toEqual({ bavli: null, other: null });
    expect(unbound.body.unavailableSourceStores).toBeUndefined();
    expect((await get(`/person?id=${encodeURIComponent(id)}`)).status).toBe(404);
  });

  it('keeps graph readings when a store fails after its revision is picked', async () => {
    // The graph holds the Shabbat reading; the store holds both readings.
    graph.close();
    graph = database();
    publish(
      graph,
      GRAPH,
      {},
      v1.filter((r) => r.passage_id === passages[0]),
      '2026-10-20T00:00:00.000Z',
    );
    env.SOURCE_READINGS_BAVLI_DB = {
      prepare: (sql: string) =>
        sql.includes('sage_graph_revisions') ? binding(bavli).prepare(sql) : broken.prepare(),
    };
    env.SAGE_GRAPH_DB = binding(graph);
    const page = await get<Initial>('/initial?ref=Shabbat%20153b');
    expect(page.status).toBe(200);
    expect(page.body.sourceRevisions.bavli).toBe(BAVLI);
    expect(page.body.unavailableSourceStores).toEqual(['bavli']);
    expect(page.body.occurrences.length).toBeGreaterThan(0);
    expect((await get(`/initial?ref=Shabbat%20153b&bavliRevision=${BAVLI}`)).status).toBe(503);
    expect(
      (await get(`/person?id=${encodeURIComponent(`reading:${passages[1]}/p1`)}`)).status,
    ).toBe(503);
    // A store without migration 0003 has no record view at all.
    const old = new DatabaseSync(':memory:');
    for (const name of readdirSync(migrations).sort().slice(0, 2))
      old.exec(readFileSync(join(migrations, name), 'utf8'));
    old
      .prepare("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,'verified')")
      .run(BAVLI, JSON.stringify({ storageFormat: 'shared-v1', ...block('bavli') }));
    env.SOURCE_READINGS_BAVLI_DB = binding(old);
    const stale = await get<Initial>('/initial?ref=Shabbat%20153b');
    expect(stale.status).toBe(200);
    expect(stale.body.unavailableSourceStores).toEqual(['bavli']);
    expect(stale.body.occurrences).toEqual(page.body.occurrences);
    old.close();
    // One stored row the decoder refuses drops that store's readings, not the page.
    const tampered = database();
    publish(
      tampered,
      BAVLI,
      block('bavli'),
      stored.map((r) => (r.kind === 'person' ? { ...r, payload_sha256: '0'.repeat(64) } : r)),
      '2026-10-20T00:00:01.000Z',
    );
    env.SOURCE_READINGS_BAVLI_DB = binding(tampered);
    const refused = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(refused.status).toBe(200);
    expect(refused.body.unavailableSourceStores).toEqual(['bavli']);
    expect(refused.body.occurrences).toEqual([]);
    tampered.close();
  });

  it('never serves a store revision as the graph, and refuses an empty revision name', async () => {
    publish(graph, BAVLI, block('bavli'), [], '2026-10-21T00:00:00.000Z');
    const page = await get<Initial>('/initial?ref=Pesachim%2071b:10');
    expect(page.status).toBe(200);
    expect(page.body.revision).toBe(GRAPH);
    expect((await get(`/initial?ref=Pesachim%2071b:10&revision=${BAVLI}`)).status).toBe(404);
    expect((await get<{ revision: string }>('/')).body.revision).toBe(GRAPH);
    expect((await get('/initial?ref=Pesachim%2071b:10&bavliRevision=')).status).toBe(404);
  });

  it('never reads a store for a person the graph holds, even when its graph copy is unreadable', async () => {
    const envelope = v1.find((r) => r.kind === 'source_reading' && r.passage_id === passages[1])!;
    const data = JSON.parse(envelope.payload_json);
    graph.close();
    graph = database();
    publish(
      graph,
      GRAPH,
      {},
      [
        {
          ...envelope,
          payload_json: JSON.stringify({ ...data, version: 'source-reading-import-v0' }),
        },
      ],
      '2026-10-20T00:00:00.000Z',
    );
    env.SAGE_GRAPH_DB = binding(graph);
    const card = await get<SourcePerson>(
      `/person?id=${encodeURIComponent(`reading:${passages[1]}/p1`)}`,
    );
    expect(card.status).toBe(404);
  });
});
