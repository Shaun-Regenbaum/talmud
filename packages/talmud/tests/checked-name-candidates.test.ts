import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { decodeCheckedPassage } from '../src/lib/sage-graph/checked-readings';
import { checkedNameProposal, LISTED_ENTRIES } from '../src/lib/sage-graph/name-candidates';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import { sageGraph } from '../src/worker/sage-graph';
import suggestions from './fixtures/checked-name-candidates.json';
import additional from './fixtures/checked-source-additional.json';
import fixture from './fixtures/checked-source-store.json';

// Exact stored checked rows from the approved release, and four real name_candidates records the importer made for
// them (the fixture says how). Changes below deliberately corrupt copies of those rows.
const rows = [...fixture.rows, ...additional.rows] as StoredRow[];
const records = suggestions.rows as StoredRow[];
const rowsOf = (id: string) => rows.filter((r) => r.passage_id === id);
const record = (label: string) =>
  records.find((r) => JSON.parse(r.payload_json).readingLabel === label)!;
const parts = (r: StoredRow) => {
  const [passageId, localId] = r.subject_id!.split('/');
  return { passageId, localId };
};
const proposalFor = async (r: StoredRow, store = 'bavli', passageRows?: StoredRow[]) => {
  const { passageId, localId } = parts(r);
  const passage = await decodeCheckedPassage(passageId, passageRows ?? rowsOf(passageId));
  return checkedNameProposal(r, passage, localId, store);
};
async function edited(r: StoredRow, change: (data: ReturnType<typeof JSON.parse>) => void) {
  const data = JSON.parse(r.payload_json);
  change(data);
  const payload_json = canonicalJson(data);
  return { ...r, payload_json, payload_sha256: await sha256(payload_json) };
}

describe('first registry suggestions on checked person cards', () => {
  it('shows one exact full name as a possible identity, never an accepted one', async () => {
    const p = (await proposalFor(record('רמי בר חמא')))!;
    expect(p.candidate).toEqual({
      id: 'rav-rami-bar-hama',
      name: 'Rav Rami bar Hama',
      nameHe: 'רמי בר חמא',
    });
    expect(p.reviewDecision).toBeUndefined();
    expect(p.registryEntries).toBeUndefined();
    expect(p.reason).toContain('first suggestion only');
    expect(p.evidence.map((e) => [e.role, e.quote])).toEqual([['printed_name', 'רמי בר חמא']]);
  });
  it('lists the registry entries a short name fits, and counts the rest', async () => {
    const r = record('רבי יוסי');
    const p = (await proposalFor(r))!;
    const total = JSON.parse(r.payload_json).candidates.length;
    expect(total).toBeGreaterThan(LISTED_ENTRIES);
    expect(p.candidate).toBeUndefined();
    expect(p.registryEntries!.listed).toHaveLength(LISTED_ENTRIES);
    expect(p.registryEntries!.total).toBe(total);
  });
  it('shows only the reason for a father inside a patronymic and for an unmatched name', async () => {
    for (const label of ['חמא', 'יהודה בן שמוע']) {
      const p = (await proposalFor(record(label)))!;
      expect([p.candidate, p.registryEntries]).toEqual([undefined, undefined]);
      expect(p.reason.length).toBeGreaterThan(0);
    }
  });
  it('shows nothing unless the record cites the exact checked rows on the card', async () => {
    const r = record('רמי בר חמא');
    const { passageId, localId } = parts(r);
    expect(await proposalFor(r, 'other')).toBeUndefined();
    expect(await proposalFor({ ...r, payload_json: `${r.payload_json} ` })).toBeUndefined();
    expect(await proposalFor({ ...r, authority: 'source_review' })).toBeUndefined();
    for (const change of [
      (d: ReturnType<typeof JSON.parse>) => {
        d.accepted = true;
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.basis = 'raw-reading';
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.bindings.person.payloadSha256 = '0'.repeat(64);
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.bindings.reading.store = 'other';
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.bindings.ownership.payloadSha256 = '0'.repeat(64);
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.bindings.coverage.recordId = 'checked_coverage:other';
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.mentions = null;
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.candidates = {};
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.mentions[0].start += 1;
      },
      (d: ReturnType<typeof JSON.parse>) => {
        d.candidates.push({ ...d.candidates[0], slug: 'another' });
      },
    ])
      expect(await proposalFor(await edited(r, change))).toBeUndefined();
    // A printed name of another person in the same reading is not this person's.
    const passage = await decodeCheckedPassage(passageId, rowsOf(passageId));
    const other = [...passage.allMentions.entries()]
      .filter(([id]) => id !== localId)
      .flatMap(([, ms]) => ms)
      .find((m) => m.role === 'printed_name')!;
    expect(
      await proposalFor(
        await edited(r, (d) => {
          Object.assign(d.mentions[0], {
            sourceId: other.source_id,
            start: other.start,
            end: other.end,
            quote: other.quote,
          });
        }),
      ),
    ).toBeUndefined();
    // The checked person row changed after the suggestion was made: its hash no longer matches the citation.
    const copy = structuredClone(rowsOf(passageId));
    const person = copy.find((x) => x.record_id === `checked_person:${passageId}/${localId}`)!;
    const data = JSON.parse(person.payload_json);
    data.reason += ' (edited)';
    person.payload_json = canonicalJson(data);
    person.payload_sha256 = await sha256(person.payload_json);
    expect(await proposalFor(r, 'bavli', copy)).toBeUndefined();
  });
});

// Real SQLite executes the same queries used by D1; the adapter only translates the call interface.
function db() {
  const d = new DatabaseSync(':memory:');
  for (const n of readdirSync(join(__dirname, '../migrations-sage-graph')).sort())
    d.exec(readFileSync(join(__dirname, '../migrations-sage-graph', n), 'utf8'));
  return d;
}
function publish(d: DatabaseSync, id: string, manifest: object, data: StoredRow[]) {
  d.prepare(
    "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES (?,?,'loading',?)",
  ).run(id, JSON.stringify({ storageFormat: 'shared-v1', ...manifest }), '2026-10-21T00:00:00Z');
  for (const r of data) {
    const v = d
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
    d.prepare(
      'INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) VALUES (?,?,?)',
    ).run(id, r.record_id, v.lastInsertRowid);
  }
  d.prepare("UPDATE sage_graph_revisions SET state='verified' WHERE id=?").run(id);
}
interface Statement {
  bind: (...v: string[]) => Statement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
}
function binding(d: DatabaseSync) {
  const statement = (sql: string, v: string[] = []): Statement => ({
    bind: (...a) => statement(sql, a),
    first: async () => d.prepare(sql).get(...v) ?? null,
    all: async () => ({ results: d.prepare(sql).all(...v) }),
  });
  return { prepare: (sql: string) => statement(sql) };
}
it('serves the suggestion on the existing checked person card', async () => {
  const graph = db(),
    bavli = db(),
    other = db();
  try {
    const gid = 'sage-graph-checked-name-test';
    publish(graph, gid, {}, records);
    publish(graph, `${gid}-none`, {}, []);
    const store = fixture.stores.bavli;
    const bavliIds = new Set(
      rows
        .filter((r) => r.kind === 'checked_reading' && !/^(Sifra|Mishnah)/.test(r.ref!))
        .map((r) => r.passage_id),
    );
    publish(
      bavli,
      store.revision,
      { sourceReadingStore: store.block },
      rows.filter((r) => bavliIds.has(r.passage_id)),
    );
    publish(
      other,
      fixture.stores.other.revision,
      { sourceReadingStore: fixture.stores.other.block },
      [],
    );
    const env = {
      SAGE_GRAPH_DB: binding(graph),
      SOURCE_READINGS_BAVLI_DB: binding(bavli),
      SOURCE_READINGS_OTHER_DB: binding(other),
    };
    const { passageId, localId } = parts(record('רמי בר חמא'));
    const card = async (revision: string) => {
      const response = await sageGraph.request(
        `/person?id=${encodeURIComponent(`reading:${passageId}/${localId}`)}&revision=${revision}&bavliRevision=${store.revision}&otherRevision=${fixture.stores.other.revision}`,
        {},
        env,
      );
      expect(response.status).toBe(200);
      return (await response.json()) as {
        initialReading: { checked: unknown; proposals?: { candidate?: { id: string } }[] };
      };
    };
    const shown = await card(gid);
    expect(shown.initialReading.checked).toBeTruthy();
    expect(shown.initialReading.proposals?.map((p) => p.candidate?.id)).toEqual([
      'rav-rami-bar-hama',
    ]);
    // A graph revision without the record shows the same checked card, with no suggestion.
    const without = await card(`${gid}-none`);
    expect(without.initialReading.checked).toBeTruthy();
    expect(without.initialReading.proposals).toBeUndefined();
    // A suggestion lookup that fails leaves the checked card as it is.
    const failing = binding(graph);
    const prepare = failing.prepare;
    failing.prepare = (sql: string) => {
      const statement = prepare(sql);
      const bind = statement.bind;
      statement.bind = (...v: string[]) =>
        v.some((x) => x.startsWith('name_candidates:'))
          ? { ...bind(...v), first: () => Promise.reject(Error('test: lookup fails')) }
          : bind(...v);
      return statement;
    };
    env.SAGE_GRAPH_DB = failing;
    const broken = await card(gid);
    expect(broken.initialReading.checked).toBeTruthy();
    expect(broken.initialReading.proposals).toBeUndefined();
  } finally {
    graph.close();
    bavli.close();
    other.close();
  }
});
