import { describe, expect, it } from 'vitest';
import { checkedPerson, decodeCheckedPassage } from '../src/lib/sage-graph/checked-readings';
import type { StoredRow } from '../src/lib/sage-graph/source-reading-store';
import fixture from './fixtures/machine-source-store.json';

// Stored rows of real, unreviewed machine readings of four real jobs.
const rows = fixture.rows as StoredRow[];
const readings = rows.filter((r) => r.kind === 'checked_reading');
const rowsOf = (id: string) => rows.filter((r) => r.passage_id === id);

describe('unreviewed machine readings', () => {
  it('decode through the checked decoder and keep their stored bytes', async () => {
    expect(readings.length).toBe(4);
    for (const row of readings) {
      const p = await decodeCheckedPassage(row.passage_id!, rowsOf(row.passage_id!));
      expect(p.stored).toEqual(rowsOf(row.passage_id!));
      expect(p.people.length).toBeGreaterThan(0);
      expect(p.envelope.wholeReadingFullyChecked).toBe(false);
      expect(p.coverage.every((c) => c.status === 'unreviewed')).toBe(true);
      expect((p.envelope as unknown as { origin: string }).origin).toBe('machine_unreviewed');
      for (const person of p.people) {
        const card = checkedPerson('graph', p, person.id)!;
        expect(card.generation).toBeNull();
        expect(card.initialReading!.checked?.machine).toBe(true);
        expect(card.initialReading!.checked?.wholeReadingFullyChecked).toBe(false);
      }
    }
  });
  it('marks every row as a screening proposal that needs review', () => {
    expect(rows.every((r) => r.authority === 'screening' && r.decision === 'needs_review')).toBe(
      true,
    );
  });
});
