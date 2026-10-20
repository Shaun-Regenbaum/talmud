import { describe, expect, it } from 'vitest';
import { identityCards } from '../src/lib/sage-graph/identity-readings';
import { type LegacyRow, legacyCards } from '../src/lib/sage-graph/legacy-readings';
import { shareReviewedRelationships } from '../src/lib/sage-graph/reviewed-relationships';
import saved from './fixtures/reviewed-relationship-symmetry.json';

const rows = () => structuredClone(saved.records) as LegacyRow[];
async function project(input: LegacyRow[]) {
  const legacy = await legacyCards('captured', input);
  const identities = await identityCards('captured', input);
  for (const card of identities.cards)
    if (!legacy.cards.some((p) => p.id === card.id)) legacy.cards.push(card);
  return legacy.cards;
}
const claim = (id: string) => (r: { reviewBinding?: { claimRecordId?: string } }) =>
  r.reviewBinding?.claimRecordId === `claim:${id}`;
describe('reviewed relationships on both exact endpoint cards', () => {
  it('shows the father reading on the named son’s existing reason card without reversing child and parent', async () => {
    const input = rows(),
      cards = await project(input);
    const son = cards.find((c) => c.id === 'proposal:b059-p9/B')!;
    expect(son.initialReading!.relationships.filter(claim('b059-p9/r0'))).toHaveLength(0);
    shareReviewedRelationships(cards, input);
    const a = son.initialReading!.relationships.filter(claim('b059-p9/r0'));
    const father = cards.find((c) => c.id === 'proposal:b059-p9/C')!;
    const b = father.initialReading!.relationships.filter(claim('b059-p9/r0'));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    expect(
      a.every(
        (r) => r.subject!.id === son.id && r.object!.id === father.id && r.partnerId === father.id,
      ),
    ).toBe(true);
    expect(
      b.every(
        (r) => r.subject!.id === son.id && r.object!.id === father.id && r.partnerId === son.id,
      ),
    ).toBe(true);
    expect(a.some((r) => r.countable)).toBe(true);
  });
  it('keeps the real doubled-bar disagreement visible on both cards without selecting one review', async () => {
    const input = rows(),
      cards = await project(input);
    shareReviewedRelationships(cards, input);
    for (const id of ['proposal:b043-p1/E', 'proposal:b043-p1/F']) {
      const claims = cards
        .find((c) => c.id === id)!
        .initialReading!.relationships.filter(claim('b043-p1/r2'));
      expect(claims.length).toBe(2);
      expect(claims.every((r) => r.reviewStatus === 'conflicting_reviews' && !r.countable)).toBe(
        true,
      );
      expect(new Set(claims.map((r) => r.reviewBinding!.verdict))).toEqual(new Set(['fam', 'unc']));
    }
  });
  it('copies a partner rejection without restoring the supported machine claim', async () => {
    const input = rows(),
      cards = await project(input);
    shareReviewedRelationships(cards, input);
    const claims = cards
      .find((c) => c.id === 'proposal:b032-p8/K')!
      .initialReading!.relationships.filter(claim('b032-p8/r3'));
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((r) => !r.countable && r.reviewStatus === 'rejected')).toBe(true);
  });
  it('does not duplicate evidence when sharing the same already-shared cards again', async () => {
    const input = rows(),
      cards = await project(input);
    shareReviewedRelationships(cards, input);
    const first = JSON.stringify(cards);
    shareReviewedRelationships(cards, input);
    expect(JSON.stringify(cards)).toBe(first);
  });
  it('rejects changed claim bindings and foreign endpoints before copying a review', async () => {
    for (const fault of ['hash', 'endpoint']) {
      const input = rows(),
        cards = await project(input);
      const relation = cards
        .flatMap((c) => c.initialReading!.relationships)
        .find(claim('b059-p9/r0'))!;
      if (fault === 'hash') relation.reviewBinding!.claimPayloadSha256 = '0'.repeat(64);
      else relation.object!.id = 'proposal:b043-p1/F';
      shareReviewedRelationships(cards, input);
      expect(
        cards.flatMap((c) => c.initialReading!.relationships).filter(claim('b059-p9/r0')),
      ).toEqual([]);
    }
  });
});
it('keeps the corrected unnamed-witness event separate from the rejected named pair', async () => {
  const input = rows(),
    cards = await project(input);
  shareReviewedRelationships(cards, input);
  const samai = cards.find((c) => c.id === 'proposal:b407-p8/O')!;
  const correction = samai.initialReading!.relationships.find(
    (r) => r.reviewBinding?.kind === 'corrected_event',
  )!;
  expect(correction.subject).toBeNull();
  expect(correction.object!.id).toBe(samai.id);
  expect(correction.partnerId).toBeNull();
  const original = cards
    .flatMap((c) => c.initialReading!.relationships)
    .filter((r) => claim('b407-p8/r5')(r) && r.reviewBinding?.kind === 'claim');
  expect(original.every((r) => !r.countable && r.reviewStatus === 'rejected')).toBe(true);
});
it('does not reuse an older generated verdict after a human corrects its live claim', async () => {
  const input = rows(),
    cards = await project(input);
  input.find((r) => r.record_id === 'claim:b059-p9/r0')!.authority = 'user_correction';
  shareReviewedRelationships(cards, input);
  expect(cards.flatMap((c) => c.initialReading!.relationships).filter(claim('b059-p9/r0'))).toEqual(
    [],
  );
});
it('rejects duplicate local/proposal cards for one exact person key', async () => {
  const input = rows(),
    cards = await project(input),
    card = structuredClone(cards.find((c) => c.id === 'proposal:b059-p9/B')!);
  card.id = 'local:b059-p9/B';
  cards.push(card);
  expect(() => shareReviewedRelationships(cards, input)).toThrow('Duplicate local person reading');
});
it('does not inherit a link when the partner has no projected or existing local card', async () => {
  const input = rows().filter((r) => r.record_id !== 'graph_node:local:b059-p9/B'),
    cards = (await project(input)).filter((c) => c.id !== 'proposal:b059-p9/B');
  const relation = cards.flatMap((c) => c.initialReading!.relationships).find(claim('b059-p9/r0'))!;
  relation.partnerNavigable = true;
  shareReviewedRelationships(cards, input);
  expect(
    cards
      .find((c) => c.id === 'proposal:b059-p9/C')!
      .initialReading!.relationships.find(claim('b059-p9/r0'))!.partnerNavigable,
  ).toBe(false);
});
