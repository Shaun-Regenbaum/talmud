import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { initialSummary } from '../src/client/InitialInteractions';
import {
  checkedPerson,
  checkedPlacement,
  decodeCheckedPassage,
  supersededReadings,
} from '../src/lib/sage-graph/checked-readings';
import { readingOccurrences } from '../src/lib/sage-graph/initial-readings';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import { sageGraph } from '../src/worker/sage-graph';
import additional from './fixtures/checked-source-additional.json';
import fixture from './fixtures/checked-source-store.json';

// Exact stored rows from the approved release. Mutations below deliberately corrupt those rows.
const rows = [...fixture.rows, ...additional.rows] as StoredRow[];
const readings = rows.filter((r) => r.kind === 'checked_reading');
const rowsOf = (id: string) => rows.filter((r) => r.passage_id === id);
const byRef = (prefix: string) => readings.find((r) => r.ref!.startsWith(prefix))!.passage_id!;
async function changed(
  id: string,
  kind: string,
  change: (data: ReturnType<typeof JSON.parse>, row: StoredRow) => void,
) {
  const copy = structuredClone(rowsOf(id));
  const row = copy.find((r) => r.kind === kind)!;
  const data = JSON.parse(row.payload_json);
  change(data, row);
  row.payload_json = canonicalJson(data);
  row.payload_sha256 = await sha256(row.payload_json);
  return copy;
}

describe('checked local source readings', () => {
  it('decodes each actual approved fixture without changing its stored bytes', async () => {
    for (const row of readings) {
      const p = await decodeCheckedPassage(row.passage_id!, rowsOf(row.passage_id!));
      expect(p.stored).toEqual(rowsOf(row.passage_id!));
      expect(p.people.length).toBeGreaterThan(0);
      for (const person of p.people) {
        const card = checkedPerson('graph', p, person.id)!;
        expect(card.generation).toBeNull();
        expect(card.initialReading!.checked?.artifactHash).toBe(p.envelope.artifactHash);
      }
    }
  });
  it('keeps the corrected name spans and makes only owned printed names placeable', async () => {
    const p = await decodeCheckedPassage(byRef('Bava Kamma 114'), rowsOf(byRef('Bava Kamma 114')));
    const occurrences = readingOccurrences([{ passageId: p.id, people: p.people }], () => true);
    const placement = await checkedPlacement(occurrences, [p]);
    expect(placement.occurrences.length).toBeGreaterThan(0);
    for (const o of placement.occurrences) {
      const s = placement.sources.find((s) => s.key === o.sourceKey)!;
      expect(Array.from(s.text).slice(o.start, o.end).join('')).toBe(o.quote);
      expect(o.quote).not.toMatch(/^אמר /);
    }
    expect(p.people.flatMap((p) => p.mentions).every((m) => m.role === 'printed_name')).toBe(true);
  });
  it('retains undirected intellectual pairs without turning them into responses or meetings', async () => {
    const p = await decodeCheckedPassage(
      byRef('Mishnah Shabbat'),
      rowsOf(byRef('Mishnah Shabbat')),
    );
    const card = checkedPerson('graph', p, 'p1')!;
    const pair = card.initialReading!.relationships[0];
    expect(pair.checked?.direction).toEqual({ status: 'held', subject: null, object: null });
    expect(pair.checked?.predicate.value).toBeNull();
    expect(pair.checked?.establishesMeeting).toBe(false);
    expect(pair.subject).not.toBeNull();
    expect(pair.object).not.toBeNull();
    const summary = initialSummary(card.id, card.name, card.initialReading!);
    expect(summary.partners[0].kinds.intellectual).toBeGreaterThan(0);
  });
  it('keeps child-to-parent direction separate from pair sorting', async () => {
    const p = await decodeCheckedPassage(byRef('Bava Kamma 114'), rowsOf(byRef('Bava Kamma 114')));
    const c = p.connections.find((c) => c.data.predicate.value === 'child_of')!;
    const card = checkedPerson('graph', p, c.data.direction.subject!)!;
    const row = card.initialReading!.relationships.find((r) => r.id === c.data.id)!;
    expect(row.subject!.id).toBe(`reading:${p.id}/${c.data.direction.subject}`);
    expect(row.object!.id).toBe(`reading:${p.id}/${c.data.direction.object}`);
  });
  it('keeps partial source coverage and description evidence without name links', async () => {
    const p = await decodeCheckedPassage(byRef('Taanit'), rowsOf(byRef('Taanit')));
    expect(p.envelope.wholeReadingFullyChecked).toBe(false);
    const matron = checkedPerson('graph', p, 'p5')!;
    expect(matron.initialReading!.checked!.mentions.every((m) => m.role !== 'printed_name')).toBe(
      true,
    );
    expect(matron.initialReading!.relationships.length).toBeGreaterThan(0);
    expect(
      matron.initialReading!.checked!.sourceCoverage.some(
        (c) => c.status === 'partial' && c.holes.length,
      ),
    ).toBe(true);
    const occurrences = readingOccurrences([{ passageId: p.id, people: p.people }], () => true);
    expect(occurrences.flatMap((o) => o.people).some((person) => person.id.endsWith('/p5'))).toBe(
      false,
    );
    const sukkah = await decodeCheckedPassage(byRef('Sukkah'), rowsOf(byRef('Sukkah')));
    expect(checkedPerson('graph', sukkah, 'p6')).toBeNull();
    expect(sukkah.people).toHaveLength(8);
    expect(sukkah.connections).toHaveLength(7);
  });
  it('replaces only exact matching raw metadata and never the graph copy', async () => {
    const p = await decodeCheckedPassage(byRef('Bava Kamma 114'), rowsOf(byRef('Bava Kamma 114')));
    const meta = {
      rawResultHash: p.envelope.binding.rawResultHash,
      jobHash: p.envelope.binding.jobHash,
    };
    const checked = { ...meta, id: p.id, checked: true, legacy: false };
    // Metadata-only branches of the same actual saved result, not invented source readings.
    const raw = { ...meta, id: 'raw-link', checked: false, legacy: false };
    expect([...supersededReadings([checked, raw])]).toEqual(['raw-link']);
    expect([...supersededReadings([checked, { ...raw, legacy: true }])]).toEqual([checked.id]);
    expect(
      supersededReadings([checked, { ...raw, rawResultHash: p.envelope.binding.rawFileSha256 }])
        .size,
    ).toBe(0);
    expect(() => supersededReadings([checked, { ...checked, id: 'duplicate' }])).toThrow(
      'Conflicting',
    );
    expect(() =>
      supersededReadings([checked, { ...raw, jobHash: p.envelope.binding.rawFileSha256 }]),
    ).toThrow('source differs');
  });
  it('rejects missing listed rows and duplicate rows', async () => {
    const id = byRef('Bava Kamma 114');
    await expect(
      decodeCheckedPassage(
        id,
        rowsOf(id).filter((r) => r.kind !== 'checked_person'),
      ),
    ).rejects.toThrow('Missing or changed');
    await expect(decodeCheckedPassage(id, [...rowsOf(id), rowsOf(id)[0]])).rejects.toThrow(
      'Duplicate',
    );
  });
  it.each(['source', 'quote', 'offset', 'role', 'ownership', 'direction', 'index', 'identity'])(
    'rejects deliberate %s corruption',
    async (kind) => {
      const id = byRef('Mishnah Shabbat');
      const target =
        kind === 'source' || kind === 'identity'
          ? 'checked_reading'
          : kind === 'ownership'
            ? 'checked_unit'
            : ['direction', 'index'].includes(kind)
              ? 'checked_connection'
              : 'checked_person';
      const copy = await changed(id, target, (d, r) => {
        if (kind === 'source') d.segments[0].text += 'x';
        if (kind === 'identity') d.historicalIdentityAccepted = true;
        if (kind === 'quote') d.mentions[0].quote += 'x';
        if (kind === 'offset') d.mentions[0].start++;
        if (kind === 'role') d.mentions[0].role = 'name_guess';
        if (kind === 'ownership') d.rawStart++;
        if (kind === 'direction') d.direction.subject = d.participants[0];
        if (kind === 'index') r.subject_id = 'other';
      });
      await expect(decodeCheckedPassage(id, copy)).rejects.toThrow();
    },
  );
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
it('serves actual checked cards, owned page names and pinned links from the existing API', async () => {
  const graph = db(),
    bavli = db(),
    other = db();
  try {
    const gid = 'sage-graph-checked-reader-test';
    publish(graph, gid, {}, []);
    for (const [name, d] of [
      ['bavli', bavli],
      ['other', other],
    ] as const) {
      const store = fixture.stores[name];
      const ids = new Set(
        readings
          .filter((r) =>
            name === 'bavli'
              ? !r.ref!.startsWith('Sifra') && !r.ref!.startsWith('Mishnah')
              : r.ref!.startsWith('Sifra') || r.ref!.startsWith('Mishnah'),
          )
          .map((r) => r.passage_id),
      );
      publish(
        d,
        store.revision,
        { sourceReadingStore: store.block },
        rows.filter((r) => ids.has(r.passage_id)),
      );
    }
    const env = {
      SAGE_GRAPH_DB: binding(graph),
      SOURCE_READINGS_BAVLI_DB: binding(bavli),
      SOURCE_READINGS_OTHER_DB: binding(other),
    };
    const response = await sageGraph.request(
      '/initial?ref=Bava%20Kamma%20114b&placement=v1',
      {},
      env,
    );
    expect(response.status).toBe(200);
    const page = (await response.json()) as {
      occurrences: { people: { id: string }[] }[];
      placement: { occurrences: unknown[] };
    };
    expect(page.placement.occurrences.length).toBeGreaterThan(0);
    const id = page.occurrences[0].people[0].id;
    expect(id).toContain('reading:cs1-');
    const card = await sageGraph.request(
      `/person?id=${encodeURIComponent(id)}&revision=${gid}&bavliRevision=${fixture.stores.bavli.revision}&otherRevision=${fixture.stores.other.revision}`,
      {},
      env,
    );
    expect(card.status).toBe(200);
    expect(
      ((await card.json()) as { initialReading: { checked: unknown } }).initialReading.checked,
    ).toBeTruthy();
    // Deliberately change only storage metadata to reproduce a legacy correction
    // outside the page query. No new source text or historical claim is introduced.
    const checked = readings.find((r) => id.startsWith(`reading:${r.passage_id}/`))!;
    const envelope = JSON.parse(checked.payload_json);
    const payload = canonicalJson({
      provenance: { resultSha256: envelope.supersedes.rawResultHash },
    });
    const correctedRevision = `${gid}-legacy`;
    publish(graph, correctedRevision, {}, [
      {
        ...checked,
        record_id: 'source_reading:legacy-overlap',
        kind: 'source_reading',
        passage_id: 'legacy-overlap',
        ref: null,
        authority: 'user_correction',
        decision: 'reviewed',
        payload_json: payload,
        payload_sha256: await sha256(payload),
      },
    ]);
    const hiddenPage = await sageGraph.request(
      `/initial?ref=Bava%20Kamma%20114b&placement=v1&revision=${correctedRevision}`,
      {},
      env,
    );
    expect(hiddenPage.status).toBe(200);
    expect(
      ((await hiddenPage.json()) as { occurrences: { people: { id: string }[] }[] }).occurrences
        .flatMap((o) => o.people)
        .some((p) => p.id === id),
    ).toBe(false);
    const hiddenCard = await sageGraph.request(
      `/person?id=${encodeURIComponent(id)}&revision=${correctedRevision}&bavliRevision=${fixture.stores.bavli.revision}&otherRevision=${fixture.stores.other.revision}`,
      {},
      env,
    );
    expect(hiddenCard.status).toBe(503);
  } finally {
    graph.close();
    bavli.close();
    other.close();
  }
});
