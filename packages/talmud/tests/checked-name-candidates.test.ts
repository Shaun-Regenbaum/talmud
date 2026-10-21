import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import bridgeFixture from '../../../research/sage-network/tests/fixtures/index-identity-link-yitzhak.json';
import graphParent from '../../../research/sage-network/tests/fixtures/name-candidates-import-parent.json';
import { decodeCheckedPassage } from '../src/lib/sage-graph/checked-readings';
import { checkedNameSuggestion, LISTED_ENTRIES } from '../src/lib/sage-graph/name-candidates';
import { POSSIBLE_ERA_SCOPE_SQL } from '../src/lib/sage-graph/possible-era';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import type { SourcePerson } from '../src/lib/sage-graph/types';
import { RABBI_PLACES } from '../src/worker/rabbi-places';
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
const proposalFor = async (
  r: StoredRow,
  store = 'bavli',
  passageRows?: StoredRow[],
  scope: StoredRow[] = [],
) => {
  const { passageId, localId } = parts(r);
  const passage = await decodeCheckedPassage(passageId, passageRows ?? rowsOf(passageId));
  return checkedNameSuggestion(r, passage, localId, store, scope);
};
// The real human correction connection:b042-p0/review/answer from live revision 8b0f4c, as the importer tests use it.
const [correction] = graphParent.rows
  .filter((r) => r[0] === 'connection:b042-p0/review/answer')
  .map(
    (r) =>
      ({
        record_id: r[0],
        kind: r[1],
        passage_id: r[2],
        ref: r[3],
        subject_id: r[4],
        object_id: r[5],
        authority: r[6],
        decision: r[7],
        payload_sha256: r[8],
        payload_json: r[9],
      }) as StoredRow,
  );
/** That correction re-pointed at one person by its subject column only, as the importer tests do. Test only. */
const correctionAbout = (personKey: string) => ({
  ...correction,
  subject_id: `local:${personKey}`,
});
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
    expect(p.status).toBe('tentative');
    const r = record('רמי בר חמא');
    expect([p.id, p.payloadSha256, p.personKey]).toEqual([
      r.record_id,
      r.payload_sha256,
      r.subject_id,
    ]);
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
  it('shows nothing once a reviewed or human decision covers the person, even a later one', async () => {
    const r = record('רמי בר חמא');
    expect(correction.authority).toBe('user_correction');
    expect(await proposalFor(r, 'bavli', undefined, [correction])).toBeTruthy();
    expect(
      await proposalFor(r, 'bavli', undefined, [correctionAbout(r.subject_id!)]),
    ).toBeUndefined();
    // Test only: a withheld passage, and a reviewed assessment naming the person in its payload.
    const { passageId } = parts(r);
    const payload = canonicalJson({ personKey: r.subject_id });
    for (const row of [
      {
        ...correction,
        record_id: 'withheld:test',
        kind: 'withheld',
        passage_id: passageId,
        subject_id: null,
        authority: 'screening',
      },
      {
        ...correction,
        record_id: 'identity_assessment:test',
        kind: 'identity_assessment',
        subject_id: null,
        authority: 'source_review',
        payload_json: payload,
        payload_sha256: await sha256(payload),
      },
    ])
      expect(await proposalFor(r, 'bavli', undefined, [row as StoredRow])).toBeUndefined();
    // Too many scope rows to check them all: nothing is shown.
    expect(await proposalFor(r, 'bavli', undefined, Array(2001).fill(correction))).toBeUndefined();
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
  all: () => Promise<{ results: unknown[]; success: boolean }>;
}
function binding(d: DatabaseSync, failScope = false) {
  const statement = (sql: string, v: string[] = []): Statement => ({
    bind: (...a) => statement(sql, a),
    first: async () => d.prepare(sql).get(...v) ?? null,
    all: async () =>
      sql === POSSIBLE_ERA_SCOPE_SQL && failScope
        ? { results: [], success: false }
        : { results: d.prepare(sql).all(...v), success: true },
  });
  return { prepare: (sql: string) => statement(sql) };
}
it('serves the suggestion on the existing checked person card', async () => {
  const graph = db(),
    bavli = db(),
    other = db();
  try {
    const gid = 'sage-graph-checked-name-test';
    const registryPayload = canonicalJson(RABBI_PLACES.rabbis['rav-rami-bar-hama']);
    const registryRow: StoredRow = {
      record_id: 'registry_person:rav-rami-bar-hama',
      kind: 'registry_person',
      passage_id: null,
      ref: null,
      subject_id: 'rav-rami-bar-hama',
      object_id: null,
      authority: 'registry',
      decision: null,
      payload_json: registryPayload,
      payload_sha256: await sha256(registryPayload),
    };
    publish(graph, gid, {}, [...records, registryRow]);
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
      return (await response.json()) as SourcePerson;
    };
    const shown = await card(gid);
    expect(shown.initialReading!.checked).toBeTruthy();
    expect(shown.initialReading!.nameSuggestion?.candidate?.id).toBe('rav-rami-bar-hama');
    expect(shown.conditionalProfile).toMatchObject({
      status: 'available',
      bio: RABBI_PLACES.rabbis['rav-rami-bar-hama'].bio,
      registry: { payloadSha256: registryRow.payload_sha256 },
      accepted: false,
    });
    // It is its own field, never one of the reviewed proposals.
    expect(shown.initialReading!.proposals).toBeUndefined();
    // A later revision that keeps the record and adds a human decision about this person shows no suggestion.
    publish(graph, `${gid}-corrected`, {}, [
      ...records,
      registryRow,
      correctionAbout(`${passageId}/${localId}`),
    ]);
    const corrected = await card(`${gid}-corrected`);
    expect(corrected.initialReading!.checked).toBeTruthy();
    expect(corrected.initialReading!.nameSuggestion).toBeUndefined();
    expect(corrected.conditionalProfile).toBeUndefined();
    // A graph revision without the record shows the same checked card, with no suggestion.
    const without = await card(`${gid}-none`);
    expect(without.initialReading!.checked).toBeTruthy();
    expect(without.initialReading!.nameSuggestion).toBeUndefined();
    expect(without.conditionalProfile).toBeUndefined();
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
    expect(broken.initialReading!.checked).toBeTruthy();
    expect(broken.initialReading!.nameSuggestion).toBeUndefined();
  } finally {
    graph.close();
    bavli.close();
    other.close();
  }
});

it('serves the exact Yitzhak bridge without choosing from short-name alternatives', async () => {
  const graph = db(),
    bavli = db(),
    other = db();
  try {
    const columns = [
      'record_id',
      'kind',
      'passage_id',
      'ref',
      'subject_id',
      'object_id',
      'authority',
      'decision',
      'payload_sha256',
      'payload_json',
    ];
    const graphRows = bridgeFixture.graphRows.map(
      (r) => Object.fromEntries(columns.map((k, i) => [k, r[i]])) as unknown as StoredRow,
    );
    const key = bridgeFixture.artifact.personKey;
    const store = fixture.stores.bavli;
    const gid = 'sage-graph-yitzhak-bridge-test';
    publish(graph, gid, {}, [...graphRows, bridgeFixture.linkRow as StoredRow]);
    publish(graph, `${gid}-corrected`, {}, [
      ...graphRows,
      bridgeFixture.linkRow as StoredRow,
      correctionAbout(key),
    ]);
    publish(
      bavli,
      store.revision,
      { sourceReadingStore: store.block },
      bridgeFixture.currentCheckedRows as StoredRow[],
    );
    publish(
      other,
      fixture.stores.other.revision,
      { sourceReadingStore: fixture.stores.other.block },
      [],
    );
    const card = async (revision: string, failScope = false) => {
      const response = await sageGraph.request(
        `/person?id=${encodeURIComponent(`reading:${key}`)}&revision=${revision}&bavliRevision=${store.revision}&otherRevision=${fixture.stores.other.revision}`,
        {},
        {
          SAGE_GRAPH_DB: binding(graph, failScope),
          SOURCE_READINGS_BAVLI_DB: binding(bavli),
          SOURCE_READINGS_OTHER_DB: binding(other),
        },
      );
      expect(response.status).toBe(200);
      return (await response.json()) as SourcePerson;
    };
    const shown = await card(gid);
    expect(shown.initialReading?.nameSuggestion?.candidate).toBeUndefined();
    expect(shown.initialReading?.nameSuggestion?.registryEntries?.total).toBe(9);
    expect(shown.conditionalProfile).toMatchObject({
      status: 'available',
      candidateId: 'rabbi-yitzhak-nappaha',
      accepted: false,
      places: ['Caesarea'],
    });
    expect(JSON.stringify(shown.initialReading)).toContain('יוחנן');
    for (const withheld of [await card(`${gid}-corrected`), await card(gid, true)]) {
      expect(withheld.conditionalProfile).toBeUndefined();
      expect(withheld.initialReading?.checked).toBeTruthy();
    }
  } finally {
    graph.close();
    bavli.close();
    other.close();
  }
});
