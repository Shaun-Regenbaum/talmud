import type { SourcePerson } from './types';

export interface ReadingAnchor {
  source_id?: string;
  segmentId?: string;
  published?: boolean;
  segmentStart?: number;
  segmentEnd?: number;
  segmentSha256?: string;
  location?: string;
  occurrenceKey: string;
  ref: string;
  edition: string;
  quote: string;
  start: number;
  end: number;
  source_sha256: string;
  offset_unit: string;
  primary: boolean;
}
export interface ReadingPerson {
  id: string;
  label: string;
  named: string;
  mentions: ReadingAnchor[];
  reading: { reason: string; alternatives: { person_id: string | null; reason: string }[] };
}
export interface ReadingClaim {
  id: string;
  evidence: ReadingAnchor[];
  claim: {
    a: string | null;
    b: string | null;
    reading: {
      relation: string;
      category: string;
      direction: string;
      modality: string;
      scene_status: string;
      polarity: string;
      verb: string;
      reason: string;
      alternatives: { subject: string | null; object: string | null; reason: string }[];
    };
  };
}
export interface InitialRelationship {
  reviewBinding?: {
    readingRecordId: string;
    readingPayloadSha256: string;
    kind: 'claim' | 'corrected_event' | 'supplemental';
    claimRecordId?: string;
    claimPayloadSha256?: string;
    localProposalId?: string;
    verdict?: string;
  };
  countable?: boolean;
  reviewStatus?: string;
  partnerNavigable?: boolean;
  subject: { id: string; name: string; nameHe: string } | null;
  object: { id: string; name: string; nameHe: string } | null;
  id: string;
  partnerId: string | null;
  partnerName: string;
  partnerNameHe: string;
  reading: ReadingClaim['claim']['reading'];
  evidence: ReadingAnchor[];
}
export interface InitialReading {
  proposals?: {
    id: string;
    reviewDecision?: string;
    reason: string;
    candidate?: { id: string; name: string; nameHe: string };
    alternatives: string[];
    eraReason?: string;
    evidence: ReadingAnchor[];
    sourceWarning: boolean;
  }[];
  reviewedPeople?: { id: string; name: string }[];
  reason: string;
  alternatives: { id: string | null; reason: string }[];
  relationships: InitialRelationship[];
  neededContext: string[];
}
export interface InitialOccurrence {
  passageOnly?: boolean;
  key: string;
  ref: string;
  quote: string;
  people: { id: string; name: string }[];
}

export const readingPersonId = (passageId: string, localId: string) =>
  `reading:${passageId}/${localId}`;

/** An occurrence can support different local groupings; it never chooses an identity. */
export function initialOccurrences(
  passageId: string,
  people: ReadingPerson[],
): InitialOccurrence[] {
  const occurrences = new Map<string, InitialOccurrence>();
  for (const person of people) {
    for (const anchor of person.mentions.filter((m) => m.published ?? m.primary)) {
      const occurrence = occurrences.get(anchor.occurrenceKey) ?? {
        key: anchor.occurrenceKey,
        ref: anchor.ref,
        quote: anchor.quote,
        people: [],
      };
      const id = readingPersonId(passageId, person.id);
      if (!occurrence.people.some((p) => p.id === id))
        occurrence.people.push({ id, name: person.label });
      occurrences.set(anchor.occurrenceKey, occurrence);
    }
  }
  return [...occurrences.values()];
}

/**
 * The occurrences of several readings, each shown once. Readings of the same words share an
 * occurrence key. Readings that quote different spans of the same words (one quotes "אמר רב", another
 * "רב") are matched too: two occurrences in the same source segment from different readings join
 * when each overlaps the other more than anything else in the other reading. One reading's own
 * occurrences never join, so a son's name and the father named inside it stay apart. A joined
 * occurrence keeps every reading's proposal and shows the narrowest quote. It chooses no identity:
 * with people from two readings it competes, and placement leaves it unlinked.
 */
export function readingOccurrences(
  readings: { passageId: string; people: ReadingPerson[] }[],
  onPage: (ref: string) => boolean,
): InitialOccurrence[] {
  interface Item {
    occurrence: InitialOccurrence;
    segment: string;
    start: number;
    end: number;
    readings: Set<string>;
  }
  const byKey = new Map<string, Item>();
  for (const { passageId, people } of readings) {
    for (const person of people) {
      for (const anchor of person.mentions.filter((m) => m.published ?? m.primary)) {
        if (!onPage(anchor.ref)) continue;
        const item = byKey.get(anchor.occurrenceKey) ?? {
          occurrence: {
            key: anchor.occurrenceKey,
            ref: anchor.ref,
            quote: anchor.quote,
            people: [],
          },
          segment: JSON.stringify([
            anchor.edition,
            anchor.segmentId ?? anchor.source_id,
            anchor.segmentSha256 ?? anchor.source_sha256,
          ]),
          start: anchor.segmentStart ?? anchor.start,
          end: anchor.segmentEnd ?? anchor.end,
          readings: new Set<string>(),
        };
        item.readings.add(passageId);
        const id = readingPersonId(passageId, person.id);
        if (!item.occurrence.people.some((p) => p.id === id))
          item.occurrence.people.push({ id, name: person.label });
        byKey.set(anchor.occurrenceKey, item);
      }
    }
  }
  const items = [...byKey.values()];
  const group = items.map((_, i) => i);
  const root = (i: number) => {
    let at = i;
    while (group[at] !== at) at = group[at];
    return at;
  };
  const members = (g: number) => items.filter((_, i) => root(i) === g);
  const share = (a: Item, b: Item) => {
    if (a.segment !== b.segment || a.end <= b.start || b.end <= a.start) return 0;
    return (
      (Math.min(a.end, b.end) - Math.max(a.start, b.start)) /
      (Math.max(a.end, b.end) - Math.min(a.start, b.start))
    );
  };
  // The one occurrence of the other reading that overlaps this one most; a tie matches nothing.
  const best = (i: number, among: number[]) => {
    const scored = among
      .map((j) => ({ j, score: share(items[i], items[j]) }))
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score);
    return scored.length && (scored.length === 1 || scored[0].score > scored[1].score)
      ? scored[0].j
      : undefined;
  };
  const ids = [...new Set(readings.map((r) => r.passageId))].sort();
  for (const [n, first] of ids.entries()) {
    for (const second of ids.slice(n + 1)) {
      const a = items.flatMap((item, i) => (item.readings.has(first) ? [i] : []));
      const b = items.flatMap((item, i) =>
        item.readings.has(second) && !item.readings.has(first) ? [i] : [],
      );
      for (const i of a) {
        const j = best(i, b);
        if (j === undefined || best(j, a) !== i) continue;
        const [gi, gj] = [root(i), root(j)];
        if (gi === gj) continue;
        const left = members(gi).flatMap((m) => [...m.readings]);
        const right = members(gj).flatMap((m) => [...m.readings]);
        // Never join two occurrences of one reading.
        if (left.some((r) => right.includes(r))) continue;
        group[gj] = gi;
      }
    }
  }
  const out: InitialOccurrence[] = [];
  const shownGroups = new Set<number>();
  for (const [i] of items.entries()) {
    const g = root(i);
    if (shownGroups.has(g)) continue;
    shownGroups.add(g);
    const joined = members(g);
    if (joined.length === 1) {
      out.push(joined[0].occurrence);
      continue;
    }
    const shown = [...joined].sort(
      (x, y) =>
        x.end - x.start - (y.end - y.start) ||
        x.start - y.start ||
        x.occurrence.key.localeCompare(y.occurrence.key),
    )[0].occurrence;
    const people = joined.flatMap((m) => m.occurrence.people);
    out.push({
      ...shown,
      people: people.filter((p, k) => people.findIndex((q) => q.id === p.id) === k),
    });
  }
  return out;
}

export function initialPerson(
  revision: string,
  passageId: string,
  localId: string,
  people: ReadingPerson[],
  claims: ReadingClaim[],
  neededContext: string[],
): SourcePerson | null {
  const person = people.find((p) => p.id === localId);
  if (!person) return null;
  const anchor = person.mentions.find((m) => m.published ?? m.primary) ?? person.mentions[0];
  if (!anchor) return null;
  const relationships = claims
    .filter((c) => c.claim.a === localId || c.claim.b === localId)
    .map((claim): InitialRelationship => {
      const partnerId = claim.claim.a === localId ? claim.claim.b : claim.claim.a;
      const partner = people.find((p) => p.id === partnerId);
      const endpoint = (id: string | null) => {
        const p = people.find((item) => item.id === id);
        return p
          ? {
              id: readingPersonId(passageId, p.id),
              name: p.label,
              nameHe: p.mentions[0]?.quote ?? p.label,
            }
          : null;
      };
      return {
        id: claim.id,
        subject: endpoint(claim.claim.a),
        object: endpoint(claim.claim.b),
        partnerId: partner ? readingPersonId(passageId, partner.id) : null,
        partnerName: partner?.label ?? '',
        partnerNameHe: partner?.mentions[0]?.quote ?? '',
        reading: claim.claim.reading,
        evidence: claim.evidence,
      };
    });
  return {
    revision,
    id: readingPersonId(passageId, localId),
    name: person.label,
    nameHe: anchor.quote,
    summary: '',
    summaryHe: '',
    generation: null,
    places: [],
    ref: anchor.ref,
    quote: anchor.quote,
    initialReading: {
      reason: person.reading.reason,
      alternatives: person.reading.alternatives.map((a) => ({
        id: a.person_id ? readingPersonId(passageId, a.person_id) : null,
        reason: a.reason,
      })),
      relationships,
      neededContext,
    },
  };
}
