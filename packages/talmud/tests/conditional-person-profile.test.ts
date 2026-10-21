import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import linkFixture from '../../../research/sage-network/tests/fixtures/index-identity-link-yitzhak.json';
import { decodeCheckedPassage } from '../src/lib/sage-graph/checked-readings';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import {
  loadConditionalProfile,
  type VerifiedProfileCandidate,
} from '../src/worker/conditional-person-profile';
import { indexIdentityCandidate } from '../src/worker/index-identity-link';
import { RABBI_PLACES } from '../src/worker/rabbi-places';
import type { RegistryDatabase, RegistryStatement } from '../src/worker/reviewed-rabbi';
import suggestions from './fixtures/checked-name-candidates.json';

// A real checked Rami bar Hama suggestion and the actual saved registry entry.
// Negative tests alter storage states/bytes, not historical source material.
const row = (suggestions.rows as StoredRow[]).find(
  (r) => JSON.parse(r.payload_json).readingLabel === 'רמי בר חמא',
)!;
const slug = JSON.parse(row.payload_json).suggestion as string;
const entry = RABBI_PLACES.rabbis[slug];
const candidate: VerifiedProfileCandidate = {
  id: slug,
  registrySha256: JSON.parse(row.payload_json).candidates[0].payloadSha256,
  proof: { recordId: row.record_id, payloadSha256: row.payload_sha256, personKey: row.subject_id! },
};
let sqlite: DatabaseSync;
let db: RegistryDatabase;
function statement(sql: string, values: (string | number)[] = []): RegistryStatement {
  return {
    bind: (...v) => statement(sql, v),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[], success: true }),
  };
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,passage_id TEXT,ref TEXT,object_id TEXT,subject_id TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT)',
  );
  db = { prepare: (sql) => statement(sql) };
});
afterEach(() => sqlite.close());
async function save(
  revision: string,
  value: unknown = entry,
  authority = 'registry',
  decision: string | null = null,
  hash?: string,
) {
  const text = canonicalJson(value);
  const digest = hash ?? (await sha256(text));
  sqlite
    .prepare(
      'INSERT INTO sage_graph_all_records(revision_id,record_id,kind,subject_id,authority,decision,payload_sha256,payload_json) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      revision,
      `registry_person:${slug}`,
      'registry_person',
      slug,
      authority,
      decision,
      digest,
      text,
    );
  return digest;
}
describe('conditional saved profile', () => {
  it('loads the saved Yitzhak profile only through the exact checked index bridge', async () => {
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
    const rows = linkFixture.graphRows.map(
      (r) => Object.fromEntries(columns.map((k, i) => [k, r[i]])) as unknown as StoredRow,
    );
    const key = linkFixture.artifact.personKey;
    const passage = await decodeCheckedPassage(
      key.split('/')[0],
      linkFixture.currentCheckedRows as StoredRow[],
    );
    const linked = await indexIdentityCandidate(
      linkFixture.linkRow as StoredRow,
      rows[0],
      rows[1],
      passage,
      'p1',
      'bavli',
      [],
    );
    expect(linked).toBeDefined();
    for (const r of rows)
      sqlite
        .prepare(
          `INSERT INTO sage_graph_all_records(revision_id,${columns.join(',')}) VALUES(${Array(11).fill('?').join(',')})`,
        )
        .run('pinned', ...columns.map((k) => r[k as keyof StoredRow] ?? null));
    const result = await loadConditionalProfile(db, 'pinned', linked!);
    expect(result).toMatchObject({
      status: 'available',
      candidateId: 'rabbi-yitzhak-nappaha',
      identityReason: linked!.reason,
      generation: 'amora-ey-2',
      places: ['Caesarea'],
      accepted: false,
      historicalIdentityResolved: false,
    });
    if (result?.status === 'available') expect(result.bio).toBeTruthy();
  });

  it('treats an unsuccessful scope query as unavailable, even with no rows', async () => {
    await save('old');
    const failed: RegistryDatabase = {
      prepare: (sql) => {
        const s = statement(sql);
        return {
          ...s,
          bind: (...v) => ({
            ...statement(sql, v),
            all: async <T>() => ({ results: [] as T[], success: false }),
          }),
        };
      },
    };
    expect(await loadConditionalProfile(failed, 'old', candidate)).toEqual({
      status: 'unavailable',
    });
  });

  it('withholds a candidate-specific human decision even when the checked source is unchanged', async () => {
    await save('old');
    const payload = canonicalJson({ registrySlug: slug });
    sqlite
      .prepare(
        'INSERT INTO sage_graph_all_records(revision_id,record_id,kind,authority,decision,payload_sha256,payload_json) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'old',
        'identity_review:regression',
        'identity_review',
        'user_correction',
        'held',
        await sha256(payload),
        payload,
      );
    expect(await loadConditionalProfile(db, 'old', candidate)).toBeUndefined();
  });

  it('reads the pinned registry, not a later populated copy or bundle', async () => {
    const oldHash = await save('old', { ...entry, bio: null, generation: null, places: [] });
    await save('new');
    const p = await loadConditionalProfile(db, 'old', { ...candidate, registrySha256: oldHash });
    expect(p).toMatchObject({
      status: 'available',
      bio: null,
      generation: null,
      places: [],
      accepted: false,
      historicalIdentityResolved: false,
      proposal: { revision: 'old' },
      registry: { source: 'graph' },
    });
  });
  it('does not invent a fallback when the pinned registry row is missing', async () => {
    expect(entry.bio).toBeTruthy();
    expect(await loadConditionalProfile(db, 'old', candidate)).toBeUndefined();
    await save('old');
    expect(await loadConditionalProfile(db, 'old', candidate)).toMatchObject({
      status: 'available',
      bio: entry.bio,
      registry: { source: 'graph' },
    });
  });
  it('does not replace a rejected human registry decision with the bundle', async () => {
    await save('old', entry, 'user_correction', 'rejected');
    expect(await loadConditionalProfile(db, 'old', candidate)).toBeUndefined();
  });
  it('distinguishes bad bytes or a failed read from an absent profile', async () => {
    await save('old', entry, 'registry', null, '0'.repeat(64));
    expect(await loadConditionalProfile(db, 'old', candidate)).toEqual({ status: 'unavailable' });
    sqlite.close();
    expect(await loadConditionalProfile(db, 'old', candidate)).toEqual({ status: 'unavailable' });
    sqlite = new DatabaseSync(':memory:');
  });
  it('checks a bridge-pinned registry hash and never substitutes a bundle for it', async () => {
    expect(
      await loadConditionalProfile(db, 'old', { ...candidate, registrySha256: '0'.repeat(64) }),
    ).toBeUndefined();
    const hash = await save('old');
    expect(
      await loadConditionalProfile(db, 'old', { ...candidate, registrySha256: hash }),
    ).toMatchObject({ status: 'available' });
    expect(
      await loadConditionalProfile(db, 'old', { ...candidate, registrySha256: '0'.repeat(64) }),
    ).toEqual({ status: 'unavailable' });
  });
});
