import { describe, expect, it } from 'vitest';
import fixture from '../../../research/sage-network/tests/fixtures/index-identity-link-yitzhak.json';
import { decodeCheckedPassage } from '../src/lib/sage-graph/checked-readings';
import { type StoredRow, sha256 } from '../src/lib/sage-graph/source-reading-store';
import { indexIdentityCandidate } from '../src/worker/index-identity-link';

// All source records are captured Yitzhak data. Mutations below test refusal, not new historical examples.
const toRow = (r: (string | null)[]) =>
  Object.fromEntries(
    [
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
    ].map((k, i) => [k, r[i]]),
  ) as unknown as StoredRow;
const candidate = toRow(fixture.graphRows[0]);
const registry = toRow(fixture.graphRows[1]);
const link = fixture.linkRow as StoredRow;
const key = fixture.artifact.personKey;
const pid = key.split('/')[0];
const passage = async () => decodeCheckedPassage(pid, fixture.currentCheckedRows as StoredRow[]);
const run = async (l = link, c = candidate, r = registry, scope: StoredRow[] = []) =>
  indexIdentityCandidate(l, c, r, await passage(), 'p1', 'bavli', scope);
const change = async (r: StoredRow, f: (d: Record<string, unknown>) => void) => {
  const d = JSON.parse(r.payload_json);
  f(d);
  const payload_json = JSON.stringify(d);
  return { ...r, payload_json, payload_sha256: await sha256(payload_json) };
};

describe('exact index identity link', () => {
  it('returns a possible profile candidate for both exact occurrences', async () => {
    expect(await run()).toMatchObject({
      id: 'rabbi-yitzhak-nappaha',
      registrySha256: registry.payload_sha256,
      proof: { recordId: link.record_id, personKey: key },
    });
    expect(JSON.parse(candidate.payload_json).candidates).toHaveLength(9);
  });
  it('hides changed alternatives or registry metadata', async () => {
    expect(
      await run(
        link,
        await change(candidate, (d) => {
          d.status = 'unresolved';
        }),
      ),
    ).toBeUndefined();
    expect(
      await run(
        link,
        candidate,
        await change(registry, (d) => {
          d.generation = 'unknown';
        }),
      ),
    ).toBeUndefined();
  });
  it('hides a later human decision on this exact person', async () => {
    expect(
      await run(link, candidate, registry, [{ ...candidate, authority: 'user_correction' }]),
    ).toBeUndefined();
  });
  it('hides a candidate-specific review even without local person key', async () => {
    const reviewed = await change(candidate, (d) => {
      d.registrySlug = 'rabbi-yitzhak-nappaha';
      delete d.personKey;
    });
    expect(
      await run(link, candidate, registry, [
        { ...reviewed, kind: 'identity_review', authority: 'source_review' },
      ]),
    ).toBeUndefined();
  });
  it('rejects malformed link without throwing', async () => {
    const broken = { ...link, payload_json: 'null', payload_sha256: await sha256('null') };
    expect(await run(broken)).toBeUndefined();
  });
  it('requires all four distinct source dependencies', async () => {
    const changed = await change(link, (d) => {
      const a = d.checkedDependencies as unknown[];
      a[3] = a[0];
    });
    expect(await run(changed)).toBeUndefined();
  });
  it('keeps accepted state out of the bridge', async () => {
    expect(
      await run(
        await change(link, (d) => {
          d.accepted = true;
        }),
      ),
    ).toBeUndefined();
  });
});
