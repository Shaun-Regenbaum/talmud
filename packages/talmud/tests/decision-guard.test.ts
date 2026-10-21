import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import parentFixture from '../../../research/sage-network/tests/fixtures/name-candidates-import-parent.json';
import eraFixture from '../../../research/sage-network/tests/fixtures/possible-era.json';
import {
  DECISION_GUARD_SQL,
  decidingRows,
  decisionScope,
  POSSIBLE_ERA_SCOPE_SQL,
} from '../src/lib/sage-graph/possible-era';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import { loadConditionalProfile } from '../src/worker/conditional-person-profile';
import { decisionGuard } from '../src/worker/decision-guard';
import type { RegistryDatabase } from '../src/worker/reviewed-rabbi';

// Real captured rows: the import parent's registry, claim, decision and human-correction rows from live revision 8b0f4c,
// and the possible-era fixture's identity rows. Every change below is labelled and made to a copy.
type Row = (string | null)[];
const asRow = (r: Row): StoredRow => ({
  record_id: r[0]!,
  kind: r[1]!,
  passage_id: r[2],
  ref: r[3],
  subject_id: r[4],
  object_id: r[5],
  authority: r[6]!,
  decision: r[7],
  payload_sha256: r[8]!,
  payload_json: r[9]!,
});
const real = [
  ...new Map(
    [...(parentFixture.rows as Row[]), ...(eraFixture.rows as Row[])].map((r) => [r[0], asRow(r)]),
  ).values(),
];
const REVISION = 'sage-graph-decision-guard-test';
const NO_CANDIDATE = '<no registry candidate>';

// Real SQLite with the repo's own migrations, so both queries run against the shared view exactly as on D1.
function graph(rows: StoredRow[]) {
  const d = new DatabaseSync(':memory:');
  for (const n of readdirSync(join(__dirname, '../migrations-sage-graph')).sort())
    d.exec(readFileSync(join(__dirname, '../migrations-sage-graph', n), 'utf8'));
  d.prepare(
    "INSERT INTO sage_graph_revisions(id,manifest_json,state,created_at) VALUES (?,?,'loading',?)",
  ).run(REVISION, JSON.stringify({ storageFormat: 'shared-v1' }), '2026-10-21T00:00:00Z');
  for (const r of rows) {
    const v = d
      .prepare(
        'INSERT INTO sage_graph_record_versions(version_sha256,record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        `${REVISION}/${r.record_id}`,
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
    ).run(REVISION, r.record_id, v.lastInsertRowid);
  }
  d.prepare("UPDATE sage_graph_revisions SET state='verified' WHERE id=?").run(REVISION);
  return d;
}
const read = (d: DatabaseSync, sql: string, key: string) =>
  d
    .prepare(sql)
    .all(REVISION, key.split('/')[0], key, key, key, key, key, key) as unknown as StoredRow[];
const ids = (rows: { record_id: string; payload_sha256: string }[]) =>
  rows.map((r) => `${r.record_id} ${r.payload_sha256}`).sort();
/** What the guards decide: decidingRows, and the full decisionScope (any authority, as the link guard counts it). */
const decisions = (rows: StoredRow[], key: string, candidates: string[]) => ({
  deciding: ids(decidingRows(rows, key)),
  scopes: candidates.map((c) => ids(decisionScope(rows, key, c))),
});
const keysIn = (rows: StoredRow[]) => {
  const keys = new Set<string>();
  const add = (k: unknown) => {
    if (typeof k === 'string' && /^[^/]+\/[^/]+$/.test(k.replace(/^local:/, '')))
      keys.add(k.replace(/^local:/, ''));
  };
  for (const r of rows) {
    const d = JSON.parse(r.payload_json);
    for (const k of [d.personKey, d.a?.personKey, d.b?.personKey, d.case?.personKey]) add(k);
    for (const k of [d.identityDecision?.personKey, ...(d.personKeys ?? [])]) add(k);
    add(r.subject_id);
    add(r.object_id);
  }
  return [...keys].sort();
};
const candidatesIn = (rows: StoredRow[]) => [
  NO_CANDIDATE,
  ...new Set(
    rows.flatMap((r) =>
      r.kind === 'identity_review' ? [JSON.parse(r.payload_json).registrySlug] : [],
    ),
  ),
  'rav',
  'shmuel-(amora)',
];
async function changed(row: StoredRow, change: Partial<StoredRow>, payload?: string) {
  const payload_json = payload ?? row.payload_json;
  return { ...row, ...change, payload_json, payload_sha256: await sha256(payload_json) };
}
const ANSWER = 'connection:b042-p0/review/answer'; // a real human correction naming claim b042-p0/s3
const CLAIM = 'claim:b042-p0/s3'; // its real claim: speaker B, addressee A
const B = 'b042-p0/B';

describe('the decision guard query', () => {
  it('leaves the full possible-era scope query exactly as it was', () => {
    expect(POSSIBLE_ERA_SCOPE_SQL).toBe(
      "SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND (passage_id=? OR kind IN ('identity_group','identity_review','identity_finding') OR authority='user_correction' OR json_extract(payload_json,'$.personKey')=? OR json_extract(payload_json,'$.a.personKey')=? OR json_extract(payload_json,'$.b.personKey')=? OR json_extract(payload_json,'$.case.personKey')=? OR json_extract(payload_json,'$.identityDecision.personKey')=? OR EXISTS (SELECT 1 FROM json_each(sage_graph_all_records.payload_json,'$.personKeys') WHERE value=?)) LIMIT 2001",
    );
  });

  it('gives the same decisions as the full scope for every person in the real rows', () => {
    const d = graph(real);
    const keys = keysIn(real);
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      const full = read(d, POSSIBLE_ERA_SCOPE_SQL, key);
      const guard = read(d, DECISION_GUARD_SQL, key);
      expect(ids(guard).every((x) => ids(full).includes(x))).toBe(true);
      expect(decisions(guard, key, candidatesIn(real))).toEqual(
        decisions(full, key, candidatesIn(real)),
      );
    }
    // The real human correction reaches B through its claim, in both.
    expect(ids(decisionScope(read(d, DECISION_GUARD_SQL, B), B, NO_CANDIDATE)).join()).toContain(
      ANSWER,
    );
  });

  it('keeps a claim found by its claim: ID whatever its kind', async () => {
    // Test only: the real claim row's kind metadata changed; stored rows need not match their ID prefix.
    const rows = await Promise.all(
      real.map((r) => (r.record_id === CLAIM ? changed(r, { kind: 'source_binding' }) : r)),
    );
    const d = graph(rows);
    const full = read(d, POSSIBLE_ERA_SCOPE_SQL, B);
    expect(ids(decisionScope(full, B, NO_CANDIDATE)).join()).toContain(ANSWER);
    expect(decisions(read(d, DECISION_GUARD_SQL, B), B, [NO_CANDIDATE])).toEqual(
      decisions(full, B, [NO_CANDIDATE]),
    );
    // Without the claim: ID branch the human correction would be lost.
    const withoutPrefix = DECISION_GUARD_SQL.replace(" OR record_id GLOB 'claim:*'", '');
    expect(withoutPrefix).not.toBe(DECISION_GUARD_SQL);
    expect(ids(decisionScope(read(d, withoutPrefix, B), B, NO_CANDIDATE)).join()).not.toContain(
      ANSWER,
    );
  });

  it('keeps a claim with no passage index that the JSON still ties to the person', async () => {
    // Test only: the real claim stored as an older writer could, with no passage index and the person key in its JSON.
    const data = {
      ...JSON.parse(real.find((r) => r.record_id === CLAIM)!.payload_json),
      personKey: B,
    };
    const rows = await Promise.all(
      real.map((r) =>
        r.record_id === CLAIM ? changed(r, { passage_id: null }, canonicalJson(data)) : r,
      ),
    );
    const d = graph(rows);
    const full = read(d, POSSIBLE_ERA_SCOPE_SQL, B);
    expect(ids(decisionScope(full, B, NO_CANDIDATE)).join()).toContain(ANSWER);
    expect(decisions(read(d, DECISION_GUARD_SQL, B), B, [NO_CANDIDATE])).toEqual(
      decisions(full, B, [NO_CANDIDATE]),
    );
    // Keeping only the passage's own claims (one more bound value, the passage) would lose the human correction.
    const passageClaimsOnly = DECISION_GUARD_SQL.replace(
      ",'claim') OR record_id GLOB 'claim:*')",
      ") OR (kind='claim' AND passage_id=?))",
    );
    expect(passageClaimsOnly).not.toBe(DECISION_GUARD_SQL);
    const narrow = d
      .prepare(passageClaimsOnly)
      .all(REVISION, 'b042-p0', 'b042-p0', B, B, B, B, B, B) as unknown as StoredRow[];
    expect(ids(decisionScope(narrow, B, NO_CANDIDATE)).join()).not.toContain(ANSWER);
  });

  it('keeps reviewed and human rows of any kind, with the key in any field, escaped or not', async () => {
    // Test only: rows of a kind the code does not know, each naming B in one of the six places the predicate reads.
    const base = real.find((r) => r.record_id === ANSWER)!;
    const places = [
      { personKey: B },
      { a: { personKey: B } },
      { b: { personKey: B } },
      { case: { personKey: B } },
      { identityDecision: { personKey: B } },
      { personKeys: ['b042-p9/A', B] },
    ];
    const added: StoredRow[] = [];
    for (const [i, value] of places.entries())
      for (const authority of ['source_review', 'user_correction'])
        added.push(
          await changed(
            base,
            {
              record_id: `future_kind:${authority}/${i}`,
              kind: 'future_kind',
              passage_id: null,
              subject_id: null,
              object_id: null,
              authority,
            },
            canonicalJson(value),
          ),
        );
    // Valid JSON with an escaped slash, which a text search for the key would miss.
    added.push(
      await changed(
        base,
        {
          record_id: 'future_kind:escaped',
          kind: 'future_kind',
          passage_id: null,
          subject_id: null,
          object_id: null,
          authority: 'source_review',
        },
        '{"personKey":"b042-p0\\/B"}',
      ),
    );
    const d = graph([...real, ...added]);
    const guard = decidingRows(read(d, DECISION_GUARD_SQL, B), B).map((r) => r.record_id);
    for (const r of added) expect(guard).toContain(r.record_id);
    expect(decisions(read(d, DECISION_GUARD_SQL, B), B, [NO_CANDIDATE])).toEqual(
      decisions(read(d, POSSIBLE_ERA_SCOPE_SQL, B), B, [NO_CANDIDATE]),
    );
  });

  it('fails closed when more than 2000 relevant rows match', async () => {
    // Test only: an explicit limit fault, 2001 copies of a real identity_group row's metadata under new IDs.
    const group = real.find((r) => r.kind === 'identity_group')!;
    const copies = await Promise.all(
      Array.from({ length: 2001 }, (_, i) =>
        changed(group, { record_id: `identity_group:limit-fault/${i}` }),
      ),
    );
    const d = graph([...real, ...copies]);
    expect(read(d, DECISION_GUARD_SQL, B)).toHaveLength(2001);
    const db: RegistryDatabase = {
      prepare: (sql) => {
        const statement = (values: (string | number)[]) => ({
          bind: (...v: (string | number)[]) => statement(v),
          first: async <T>() => (d.prepare(sql).get(...values) ?? null) as T | null,
          all: async <T>() => ({ results: d.prepare(sql).all(...values) as T[], success: true }),
        });
        return statement([]);
      },
    };
    const candidate = {
      id: 'rav',
      registrySha256: '0'.repeat(64),
      proof: { recordId: ANSWER, payloadSha256: '0'.repeat(64), personKey: B },
    };
    expect(await loadConditionalProfile(db, REVISION, candidate)).toBeUndefined();
  });
});

describe('the request-local decision read', () => {
  const failing = () => {
    let prepared = 0;
    const db: RegistryDatabase = {
      prepare: () => {
        prepared++;
        const statement = {
          bind: () => statement,
          first: async () => null,
          all: () => Promise.reject(Error('test: D1 is unavailable')),
        };
        return statement;
      },
    };
    return { db, prepared: () => prepared };
  };
  const candidate = {
    id: 'rav',
    registrySha256: '0'.repeat(64),
    proof: { recordId: ANSWER, payloadSha256: '0'.repeat(64), personKey: B },
  };

  it('reads once, and a failed read is reused, never retried, and fails every guard closed', async () => {
    const { db, prepared } = failing();
    const guard = decisionGuard(db, REVISION, B);
    expect(guard.read()).toBe(guard.read());
    await expect(guard.read()).rejects.toThrow('test: D1 is unavailable');
    expect(await loadConditionalProfile(db, REVISION, candidate, guard)).toEqual({
      status: 'unavailable',
    });
    expect(await loadConditionalProfile(db, REVISION, candidate, guard)).toEqual({
      status: 'unavailable',
    });
    expect(prepared()).toBe(1);
  });

  it('refuses a read made for another person or revision', async () => {
    const { db, prepared } = failing();
    for (const guard of [
      decisionGuard(db, REVISION, 'b042-p0/A'),
      decisionGuard(db, 'another-revision', B),
    ])
      expect(await loadConditionalProfile(db, REVISION, candidate, guard)).toEqual({
        status: 'unavailable',
      });
    expect(prepared()).toBe(0);
  });
});
