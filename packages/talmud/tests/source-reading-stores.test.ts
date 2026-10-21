import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type InitialOccurrence,
  NAME_PREFIX_LETTERS,
  type ReadingClaim,
  type ReadingPerson,
  readingOccurrences,
} from '../src/lib/sage-graph/initial-readings';
import {
  parseSourcePersonHash,
  pinQuery,
  readingPins,
  sourcePersonHash,
} from '../src/lib/sage-graph/reading-pins';
import {
  applyReadingCoverage,
  type ReadingCoverage,
} from '../src/lib/sage-graph/source-reading-coverage';
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
    // Another real name from this passage, put where it does not stand.
    const mentionsOf = (r: StoredRow) => JSON.parse(r.payload_json).mentions as unknown[][];
    const persons = rows.filter((r) => r.kind === 'person');
    const elsewhere = persons
      .map((r) => mentionsOf(r)[0][4])
      .find((quote) => quote !== mentionsOf(persons[0])[0][4]);
    await expect(
      decodeStoredPassage(
        pid,
        await edit('person', (d) => ((d.mentions as unknown[][])[0][4] = elsewhere)),
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

// Real readings of jobs v18-bavli-005 (Eruvin 29a:15) and 007 (Niddah 41b:9): the stronger8 v4 run with
// Hebrew labels, and the quality-210 v2 run of the same jobs with English labels. See fixture.hebrew.
const hebrew = fixture.hebrew as Record<'v4' | 'v2', { v1: StoredRow[]; stored: StoredRow[] }>;
type Placed = {
  placement: {
    sources: { key: string; text: string }[];
    occurrences: (InitialOccurrence & { sourceKey: string; start: number; end: number })[];
  };
};
/** One real stored reading as the page reads it: decoded, with its owned sources published. */
async function readingAt(rows: StoredRow[], ref: string) {
  const passage = rows.find((r) => r.kind === 'passage' && r.ref === ref)!;
  const passageId = passage.passage_id!;
  const decoded = await decodeStoredPassage(
    passageId,
    rows.filter((r) => r.passage_id === passageId),
  );
  const data = (kind: string) =>
    decoded.filter((r) => r.kind === kind).map((r) => JSON.parse(r.payload_json));
  const { people } = applyReadingCoverage(
    passageId,
    data('source_reading')[0].provenance.jobSha256,
    data('passage')[0].sourceSegments,
    data('source_reading_coverage')[0] as ReadingCoverage,
    data('person') as ReadingPerson[],
    data('claim') as ReadingClaim[],
  );
  return { passageId, people };
}
/** Fresh databases for one test: graph rows and store rows, each as one verified revision. */
function setUp(graphRows: StoredRow[], storeRows: StoredRow[]) {
  for (const db of [graph, bavli]) db.close();
  graph = database();
  bavli = database();
  publish(graph, GRAPH, {}, graphRows, '2026-10-20T00:00:00.000Z');
  publish(bavli, BAVLI, block('bavli'), storeRows, '2026-10-20T00:00:01.000Z');
  env = {
    SAGE_GRAPH_DB: binding(graph),
    SOURCE_READINGS_BAVLI_DB: binding(bavli),
    SOURCE_READINGS_OTHER_DB: binding(other),
  };
}
const withoutRevisions = <T extends { sourceRevisions?: unknown }>({
  sourceRevisions: _,
  ...rest
}: T) => rest;

describe('real Hebrew names and duplicate readings', () => {
  for (const ref of ['Eruvin 29a', 'Niddah 41b']) {
    it(`links real Hebrew names on ${ref} from a store as it does from the graph`, async () => {
      setUp([], hebrew.v4.stored);
      const url = `/initial?ref=${encodeURIComponent(ref)}&placement=v1`;
      const fromStore = await get<Initial & Placed>(url);
      expect(fromStore.status).toBe(200);
      const placed = fromStore.body.placement.occurrences;
      expect(placed.length).toBeGreaterThan(0);
      for (const row of placed) {
        const source = fromStore.body.placement.sources.find((s) => s.key === row.sourceKey)!;
        expect(Array.from(source.text).slice(row.start, row.end).join('')).toBe(row.quote);
        expect(row.people).toHaveLength(1);
        expect(row.people[0].name).toMatch(/^[א-ת ]+$/);
      }
      setUp(hebrew.v4.v1, []);
      const fromGraph = await get<Initial & Placed>(url);
      expect(withoutRevisions(fromStore.body)).toEqual(withoutRevisions(fromGraph.body));
    });
  }

  it('joins two readings only at the same words, and links neither', async () => {
    for (const [graphRows, storeRows] of [
      [hebrew.v2.v1, hebrew.v4.stored], // the older reading in the graph, the new one in a store
      [
        [],
        [...hebrew.v2.stored, ...hebrew.v4.stored.filter((r) => r.kind !== 'source_reading_run')],
      ],
    ]) {
      setUp(graphRows, storeRows);
      // Niddah 41b: both readings quote ריש לקיש and רבי יוחנן at the same spans, so they join.
      const niddah = await get<Initial & Placed>('/initial?ref=Niddah%2041b&placement=v1');
      const keys = niddah.body.occurrences.map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
      const joined = niddah.body.occurrences.filter(
        (o) => new Set(o.people.map((p) => p.id.split('/')[0])).size === 2,
      );
      expect(joined.map((o) => o.quote)).toEqual(expect.arrayContaining(['ריש לקיש', 'רבי יוחנן']));
      for (const row of niddah.body.placement.occurrences)
        expect(joined.some((o) => o.key === row.key)).toBe(false);
      const units = niddah.body.sources.map((s) => s.unitKey);
      expect(new Set(units).size).toBe(units.length);
      expect(niddah.body.sources.some((s) => s.readingPassageIds.length === 2)).toBe(true);
      // Eruvin 29a: the older reading quotes phrases ("אמר רב"), the newer one names ("רב"). The
      // source words do not show these are one name, so they stay apart and neither is linked.
      const eruvin = await get<Initial & Placed>('/initial?ref=Eruvin%2029a&placement=v1');
      const quotes = eruvin.body.occurrences.map((o) => o.quote);
      expect(quotes).toEqual(expect.arrayContaining(['אמר רב', 'רב', 'אמר ליה רבה', 'רבה']));
      expect(eruvin.body.occurrences.every((o) => o.people.length === 1)).toBe(true);
      const contested = eruvin.body.occurrences.filter((o) => o.overlapsOtherReading);
      expect(contested.length).toBeGreaterThan(0);
      for (const row of eruvin.body.placement.occurrences)
        expect(contested.some((o) => o.key === row.key)).toBe(false);
      // A son's name and the father named inside it are never one occurrence.
      const son = eruvin.body.occurrences.find((o) => o.quote === 'רבי שמעון בן אלעזר')!;
      const father = eruvin.body.occurrences.find((o) => o.quote === 'אלעזר')!;
      expect(son.key).not.toBe(father.key);
    }
  });

  it('keeps a father-only quote and a son-only quote apart when each reading missed the other', async () => {
    // The real readings of Eruvin 29a:15, each with one person left out, as a missed extraction would.
    const [v4, v2] = await Promise.all([
      readingAt(hebrew.v4.stored, 'Eruvin 29a:15'),
      readingAt(hebrew.v2.stored, 'Eruvin 29a:15'),
    ]);
    const only = (reading: typeof v4, keep: (label: string) => boolean) => ({
      ...reading,
      people: reading.people.filter((p) => keep(p.label)),
    });
    // The v2 labels add an English gloss: "אלעזר (Elazar)".
    const isFather = (label: string) => label.split(' (')[0] === 'אלעזר';
    const isSon = (label: string) => label.split(' (')[0] === 'רבי שמעון בן אלעזר';
    for (const pair of [
      [only(v4, isFather), only(v2, isSon)],
      [only(v4, isSon), only(v2, isFather)],
    ]) {
      expect(pair.every((r) => r.people.length === 1)).toBe(true);
      const shown = readingOccurrences(pair, (ref) => ref === 'Eruvin 29a:15');
      expect(shown).toHaveLength(2);
      expect(shown.every((o) => o.people.length === 1 && o.overlapsOtherReading)).toBe(true);
    }
  });

  it('joins a quote with one attached prefix letter, and nothing looser', async () => {
    // Real words of Shabbat 153b:15, where the captured reading quotes "דר"ע". No captured reading
    // quotes these words without the prefix, so the second reading here is those same real words
    // starting one letter later. Its text is the source's own.
    const reading = await readingAt(stored, 'Shabbat 153b:13');
    const akiva = reading.people.find((p) => p.mentions.some((m) => m.quote === 'דר"ע'))!;
    const later = (person: ReadingPerson, skip: number) => ({
      passageId: `${reading.passageId}-later-by-${skip}`,
      people: [
        {
          ...person,
          mentions: person.mentions.map((m) => ({
            ...m,
            start: m.start + skip,
            segmentStart: (m.segmentStart ?? m.start) + skip,
            quote: Array.from(m.quote).slice(skip).join(''),
            occurrenceKey: `${m.occurrenceKey}-later-by-${skip}`,
          })),
        },
      ],
    });
    const page = (ref: string) => ref === 'Shabbat 153b:15';
    const one = readingOccurrences([{ ...reading, people: [akiva] }, later(akiva, 1)], page);
    expect(one).toHaveLength(1);
    expect(one[0].quote).toBe('ר"ע');
    expect(one[0].people).toHaveLength(2);
    const yose = reading.people.find((p) => p.mentions.some((m) => m.quote === "דר' יוסי"))!;
    const apart = readingOccurrences([{ ...reading, people: [yose] }, later(yose, 4)], page);
    expect(apart.map((o) => o.quote)).toEqual(["דר' יוסי", 'יוסי']);
    expect(apart.every((o) => o.overlapsOtherReading)).toBe(true);
  });

  it('lets a pointed prefix letter carry its own vowel marks', () => {
    // Real pointed words from the captured Tanchuma piece; the two readings here are built on them.
    const { source } = fixture.pieceKey;
    const text = Array.from(source.text);
    const at = (word: string) => Array.from(source.text.slice(0, source.text.indexOf(word))).length;
    const reading = (passageId: string, quote: string, label = quote) => {
      const start = at(quote);
      const mention = {
        occurrenceKey: `${passageId}:${start}`,
        ref: source.ref,
        edition: source.edition,
        segmentId: source.provenance.segment_id,
        source_id: source.source_id,
        source_sha256: source.sha256,
        quote,
        start,
        end: start + Array.from(quote).length,
        offset_unit: 'Unicode code points',
        primary: true,
      };
      expect(text.slice(mention.start, mention.end).join('')).toBe(quote);
      return {
        passageId,
        people: [
          {
            id: 'p1',
            label,
            named: 'name',
            mentions: [mention],
            reading: { reason: '', alternatives: [] },
          },
        ],
      };
    };
    // The source's own spelling of "to Jerusalem": ל with its hiriq, then the name.
    const word = source.text
      .split(/\s+/)
      .map((w) => w.replace(/\p{P}/gu, ''))
      .find((w) => w.replace(/\p{M}/gu, '') === 'לירושלים')!;
    const name = Array.from(word).slice(2).join('');
    // The first reading names the place without its prefix, so the two join.
    const shown = readingOccurrences(
      [reading('first', word, name.replace(/\p{M}/gu, '')), reading('second', name)],
      () => true,
    );
    expect(shown.map((o) => [o.quote, o.people.length])).toEqual([[name, 2]]);
    // If the first reading names it with the letter, the letter may be part of another name: apart.
    const apart = readingOccurrences([reading('first', word), reading('second', name)], () => true);
    expect(apart.map((o) => [o.quote, o.overlapsOtherReading])).toEqual([
      [word, true],
      [name, true],
    ]);
  });

  it('uses the same prefix letters as the reviewed prefix amendment', () => {
    const python = readFileSync(
      join(__dirname, '../../../research/sage-network/anchor_repair_v2.py'),
      'utf8',
    );
    const letters = /^PREFIXES = frozenset\('([^']+)'\)$/m.exec(python)![1];
    expect([...NAME_PREFIX_LETTERS].sort()).toEqual([...letters].sort());
  });

  it('counts relationships from one reading only, however many readings share the words', async () => {
    setUp([], hebrew.v4.stored);
    const page = await get<Initial>('/initial?ref=Eruvin%2029a:14');
    const ids = [...new Set(page.body.occurrences.flatMap((o) => o.people.map((p) => p.id)))];
    const cards = async () =>
      Promise.all(
        ids.map(
          async (id) => (await get<SourcePerson>(`/person?id=${encodeURIComponent(id)}`)).body,
        ),
      );
    const alone = await cards();
    expect(alone.some((c) => c.initialReading!.relationships.length > 0)).toBe(true);
    setUp(hebrew.v2.v1, hebrew.v4.stored);
    const beside = await cards();
    expect(beside.map((c) => c.initialReading)).toEqual(alone.map((c) => c.initialReading));
  });

  it('serves a card from the exact store revision its page read', async () => {
    setUp([], hebrew.v4.stored);
    const page = await get<Initial>('/initial?ref=Niddah%2041b');
    const pins = readingPins(page.body.revision, page.body.sourceRevisions)!;
    expect(pins).toEqual({ revision: GRAPH, bavliRevision: BAVLI, otherRevision: 'none' });
    const id = page.body.occurrences[0].people[0].id;
    // A newer release that no longer holds this reading.
    publish(bavli, BAVLI_EMPTY, block('bavli'), run, '2026-10-21T00:00:00.000Z');
    expect((await get(`/person?id=${encodeURIComponent(id)}`)).status).toBe(404);
    const card = await get<SourcePerson>(`/person?id=${encodeURIComponent(id)}&${pinQuery(pins)}`);
    expect(card.status).toBe(200);
    expect(readingPins(card.body.revision, card.body.sourceRevisions)).toEqual(pins);
    // A pinned revision that is not there is an error, never the newest.
    const missing = pinQuery({ ...pins, bavliRevision: `${BAVLI}0` });
    expect((await get(`/person?id=${encodeURIComponent(id)}&${missing}`)).status).toBe(404);
    const graphMissing = pinQuery({ ...pins, revision: `${GRAPH}0` });
    expect((await get(`/person?id=${encodeURIComponent(id)}&${graphMissing}`)).status).toBe(404);
    // `none` means the page read no revision of that store, so neither does the card.
    const none = pinQuery({ ...pins, bavliRevision: 'none' });
    expect((await get(`/person?id=${encodeURIComponent(id)}&${none}`)).status).toBe(404);
    const hash = sourcePersonHash(id, pins);
    expect(parseSourcePersonHash(hash)).toEqual({ id, pins });
    // A link with only some of the pins, or an empty one, is malformed, never read as unpinned.
    const partials = [
      `revision=${GRAPH}`,
      `${pinQuery(pins)}&bavliRevision=`,
      pinQuery({ ...pins, bavliRevision: '' }),
      '',
    ];
    for (const partial of partials)
      expect(parseSourcePersonHash(`#source-person/${encodeURIComponent(id)}?${partial}`)).toEqual({
        id,
        malformed: true,
      });
    expect(parseSourcePersonHash(`#source-person/${encodeURIComponent(id)}`)).toEqual({ id });
    // An empty graph revision is not a request for the newest one.
    expect((await get(`/person?id=${encodeURIComponent(id)}&revision=`)).status).toBe(404);
    expect((await get('/initial?ref=Niddah%2041b&revision=')).status).toBe(404);
  });
});
