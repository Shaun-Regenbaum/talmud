import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import {
  loadConditionalProfile,
  type VerifiedProfileCandidate,
} from '../src/worker/conditional-person-profile';
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
  proof: { recordId: row.record_id, payloadSha256: row.payload_sha256, personKey: row.subject_id! },
};
let sqlite: DatabaseSync;
let db: RegistryDatabase;
function statement(sql: string, values: (string | number)[] = []): RegistryStatement {
  return {
    bind: (...v) => statement(sql, v),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  };
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE sage_graph_all_records(revision_id TEXT,record_id TEXT,kind TEXT,subject_id TEXT,authority TEXT,decision TEXT,payload_sha256 TEXT,payload_json TEXT)',
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
    .prepare('INSERT INTO sage_graph_all_records VALUES(?,?,?,?,?,?,?,?)')
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
  it('reads the pinned registry, not a later populated copy or bundle', async () => {
    await save('old', { ...entry, bio: null, generation: null, places: [] });
    await save('new');
    const p = await loadConditionalProfile(db, 'old', candidate);
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
  it('uses the real bundled profile only when the pinned registry has no row', async () => {
    expect(entry.bio).toBeTruthy();
    expect(await loadConditionalProfile(db, 'old', candidate)).toMatchObject({
      status: 'available',
      candidateId: slug,
      bio: entry.bio,
      generation: entry.generation,
      places: entry.places,
      registry: { source: 'bundled' },
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
