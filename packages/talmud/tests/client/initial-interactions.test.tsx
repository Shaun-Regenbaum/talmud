import { describe, expect, it } from 'vitest';
import { countedInitialRelationship, initialSummary } from '../../src/client/InitialInteractions';
import {
  initialOccurrences,
  initialPerson,
  type ReadingClaim,
  type ReadingPerson,
} from '../../src/lib/sage-graph/initial-readings';
import capture from '../fixtures/initial-source-readings.json';

const passage = capture.records.find((r) => r.kind === 'passage' && r.ref === 'Shabbat 153b:13')!;
const people = capture.records
  .filter((r) => r.passage_id === passage.passage_id && r.kind === 'person')
  .map((r) => r.data as unknown as ReadingPerson);
const claims = capture.records
  .filter((r) => r.passage_id === passage.passage_id && r.kind === 'claim')
  .map((r) => r.data as unknown as ReadingClaim);

describe('initial interaction summaries', () => {
  it('counts a source passage once despite several excerpts and repeated readings', () => {
    const pesachim = capture.records.find(
      (r) => r.kind === 'passage' && r.ref === 'Pesachim 71b:10',
    )!;
    const rows = capture.records.filter((r) => r.passage_id === pesachim.passage_id);
    const person = initialPerson(
      'captured',
      pesachim.passage_id,
      'p1',
      rows.filter((r) => r.kind === 'person').map((r) => r.data as unknown as ReadingPerson),
      rows.filter((r) => r.kind === 'claim').map((r) => r.data as unknown as ReadingClaim),
      [],
    )!;
    const first = initialSummary(person.id, person.name, person.initialReading!);
    const repeated = initialSummary(person.id, person.name, {
      ...person.initialReading!,
      relationships: [
        ...person.initialReading!.relationships,
        ...person.initialReading!.relationships,
      ],
    });
    expect(repeated).toEqual(first);
    expect(first.partners).toHaveLength(1);
    expect(first.partners[0].total).toBe(1);
    const published = {
      ...person.initialReading!,
      relationships: person.initialReading!.relationships.map((row) => ({
        ...row,
        evidence: row.evidence.map((anchor) => ({ ...anchor, published: true })),
      })),
    };
    const covered = initialSummary(person.id, person.name, published);
    expect(covered.partners[0].total).toBe(2);
    expect(published.relationships.flatMap((row) => row.evidence)).toHaveLength(4);
  });
  it('never counts hypothetical or negated readings as actual interactions', () => {
    const row = capture.records.find(
      (r) =>
        r.kind === 'claim' &&
        r.ref === 'Pesachim 71b:10' &&
        (r.data as unknown as ReadingClaim).evidence.some((e) => e.primary),
    )!.data as unknown as ReadingClaim;
    const relationship = {
      id: row.id,
      subject: null,
      object: null,
      partnerId: 'reading:' + row.claim.b,
      partnerName: '',
      partnerNameHe: '',
      reading: row.claim.reading,
      evidence: row.evidence,
    };
    expect(countedInitialRelationship(relationship)).toBe(true);
    // Corrupt only the status of real evidence to check counting rules.
    expect(
      countedInitialRelationship({
        ...relationship,
        reading: { ...relationship.reading, scene_status: 'hypothetical' },
      }),
    ).toBe(false);
    expect(
      countedInitialRelationship({
        ...relationship,
        reading: { ...relationship.reading, polarity: 'negative' },
      }),
    ).toBe(false);
    expect(
      countedInitialRelationship({
        ...relationship,
        reading: { ...relationship.reading, scene_status: 'mixed' },
      }),
    ).toBe(false);
  });
  it('does not multiply an occurrence when local IDs or groups differ', () => {
    const rava = people.find((p) => p.id === 'p2')!;
    // Deliberately regroup the captured occurrence; do not invent source text.
    const regrouped = { ...rava, id: 'p999' };
    const occurrences = initialOccurrences(passage.passage_id, [...people, regrouped]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].people).toHaveLength(2);
  });
  it('retains contextual claims as evidence without adding them to primary counts', () => {
    const person = initialPerson('captured', passage.passage_id, 'p2', people, claims, [])!;
    expect(person.initialReading!.relationships.length).toBeGreaterThan(1);
    const summary = initialSummary(person.id, person.name, person.initialReading!);
    expect(summary.partners.every((p) => p.slug?.startsWith('reading:'))).toBe(true);
    expect(summary.partners.reduce((n, p) => n + p.total, 0)).toBe(0);
    expect(person.initialReading!.relationships.some((r) => !r.partnerId)).toBe(true);
  });
});
