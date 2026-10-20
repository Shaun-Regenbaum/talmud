import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from '../../../research/sage-network/tests/fixtures/possible-era.json';
import type { LegacyRow } from '../src/lib/sage-graph/legacy-readings';
import { possibleEra } from '../src/lib/sage-graph/possible-era';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const rows = fixture.rows.map((r) => ({
  record_id: r[0],
  kind: r[1],
  passage_id: r[2],
  ref: r[3],
  authority: r[6],
  decision: r[7],
  payload_sha256: r[8],
  payload_json: r[9],
})) as LegacyRow[];
const output = (index: number): LegacyRow => {
  const item = fixture.outputs[index],
    payload_json = JSON.stringify(item.data);
  return { ...item, payload_json, payload_sha256: hash(payload_json) };
};
describe('separate possible era on actual source people', () => {
  it('keeps accepted identity and unreviewed candidate eras conditional', async () => {
    for (let i = 0; i < fixture.entries.length; i++) {
      const p = await possibleEra(fixture.entries[i].personKey, output(i), rows);
      expect(p?.tier).toBe(fixture.entries[i].tier);
      expect(p?.acceptedEra).toBe(false);
      expect(p?.usableForDatingOthers).toBe(false);
      expect(p).not.toHaveProperty('start');
    }
  });
  it('hides stale source, registry and changed authority', async () => {
    const entry = fixture.entries[1];
    for (const key of ['passage:b000-p0', entry.registry.recordId, entry.identity.recordId]) {
      const changed = rows.map((r) =>
        r.record_id === key ? { ...r, authority: 'user_correction' } : r,
      );
      expect(await possibleEra(entry.personKey, output(1), changed)).toBeUndefined();
    }
  });
  it('hides a candidate after a new held assessment', async () => {
    const held = rows.find(
      (r) =>
        r.kind === 'identity_assessment' && JSON.parse(r.payload_json).personKey === 'b000-p0/A',
    )!;
    const data = JSON.parse(held.payload_json);
    data.personKey = fixture.entries[1].personKey;
    const payload_json = JSON.stringify(data);
    const added = {
      ...held,
      record_id: held.record_id + '-metadata-fault',
      payload_json,
      payload_sha256: hash(payload_json),
    };
    expect(
      await possibleEra(fixture.entries[1].personKey, output(1), [...rows, added]),
    ).toBeUndefined();
  });
  it('rejects tampered hint even if its payload hash was rewritten', async () => {
    const row = output(1),
      data = JSON.parse(row.payload_json);
    data.acceptedEra = true;
    row.payload_json = JSON.stringify(data);
    row.payload_sha256 = hash(row.payload_json);
    expect(await possibleEra(fixture.entries[1].personKey, row, rows)).toBeUndefined();
  });
  it('hides a stale linked group and fails closed on malformed hint data', async () => {
    const entry = fixture.entries[2];
    const key = entry.scope.find((b) => b.recordId.startsWith('identity_group:'))!.recordId;
    expect(
      await possibleEra(
        entry.personKey,
        output(2),
        rows.map((r) => (r.record_id === key ? { ...r, payload_json: r.payload_json + ' ' } : r)),
      ),
    ).toBeUndefined();
    const bad = { ...output(1), payload_json: 'null', payload_sha256: hash('null') };
    expect(await possibleEra(fixture.entries[1].personKey, bad, rows)).toBeUndefined();
  });
});
