import type { CheckedCoverage, CheckedDetail } from './checked-readings';
import type { SourcePerson } from './types';

export interface ReadingAnchor {
  role?: 'printed_name' | 'actor_description' | 'referential_evidence';
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
  placementEligible?: boolean;
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
  checked?: CheckedDetail;
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
  checked?: {
    artifactHash: string;
    wholeReadingFullyChecked: boolean;
    sourceCoverage: CheckedCoverage[];
    mentions: ReadingAnchor[];
  };
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
  /** Another reading quotes overlapping words of this source as a different occurrence. */
  overlapsOtherReading?: boolean;
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
    if (person.placementEligible === false) continue;
    for (const anchor of person.mentions.filter(
      (m) => (m.published ?? m.primary) && (!m.role || m.role === 'printed_name'),
    )) {
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
 * The one attached Hebrew letter that may stand before a name in a quote: the same letters as the
 * reviewed prefix amendment, research/sage-network/anchor_repair_v2.py `PREFIXES`. A test keeps the
 * two lists equal.
 */
export const NAME_PREFIX_LETTERS = 'ובלמשכד';

/**
 * The occurrences of several readings, each shown once. Two occurrences from different readings join
 * only when the source words show they are the same name: the same span, or one quote is the other
 * with one attached prefix letter (ורבי יוחנן / רבי יוחנן) that the longer reading's own label leaves
 * out. Nothing else joins, however much it
 * overlaps: one reading's father-only quote and another's full name of the son stay apart, even when
 * neither reading has both. One reading's own occurrences never join. A joined occurrence keeps every
 * reading's proposal and shows the shorter quote. An occurrence that overlaps another reading's
 * occurrence without joining is marked `overlapsOtherReading`, and placement leaves it unlinked, so
 * no reading is chosen over another.
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
      if (person.placementEligible === false) continue;
      for (const anchor of person.mentions.filter(
        (m) => (m.published ?? m.primary) && (!m.role || m.role === 'printed_name'),
      )) {
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
  const readingsOf = (g: number) =>
    new Set(items.flatMap((item, i) => (root(i) === g ? [...item.readings] : [])));
  // Labels name a person as "רבי יוחנן", "Rabbi Akiva (ר\"ע)" or "רבה (Rabbah)"; compare without vowels.
  const bare = (s: string) => s.replace(/\p{M}/gu, '').trim();
  const names = (label: string) => [label, ...label.split(/[()]/)].map(bare).filter(Boolean);
  // The same name, by the source words: one quote is the other with one attached prefix letter,
  // which in pointed text may carry its own vowel marks (וְרַבִּי / רַבִּי). The longer reading must
  // itself name the person without that letter, or the letter may belong to a different name, as in
  // בבא and בא; those stay apart and contested.
  const prefixed = (long: Item, short: Item) => {
    const letters = Array.from(long.occurrence.quote);
    const width = Array.from(short.occurrence.quote).length;
    const prefix = letters.slice(0, letters.length - width);
    return (
      long.segment === short.segment &&
      long.end === short.end &&
      long.start + prefix.length === short.start &&
      prefix.length >= 1 &&
      NAME_PREFIX_LETTERS.includes(prefix[0]) &&
      prefix.slice(1).every((mark) => /\p{M}/u.test(mark)) &&
      letters.slice(prefix.length).join('') === short.occurrence.quote &&
      long.occurrence.people.every((p) => names(p.name).includes(bare(short.occurrence.quote)))
    );
  };
  for (const [i, a] of items.entries()) {
    for (const [j, b] of items.entries()) {
      if (!prefixed(a, b)) continue;
      const [gi, gj] = [root(i), root(j)];
      const left = readingsOf(gi);
      // Never join two occurrences of one reading.
      if (gi === gj || [...readingsOf(gj)].some((r) => left.has(r))) continue;
      group[gj] = gi;
    }
  }
  const groups = new Map<number, Item[]>();
  for (const [i, item] of items.entries())
    groups.set(root(i), [...(groups.get(root(i)) ?? []), item]);
  const shown = [...groups.values()].map((joined) => {
    const people = joined.flatMap((m) => m.occurrence.people);
    const narrowest = [...joined].sort((x, y) => x.end - x.start - (y.end - y.start))[0];
    return {
      joined,
      readings: new Set(joined.flatMap((m) => [...m.readings])),
      occurrence: {
        ...narrowest.occurrence,
        people: people.filter((p, k) => people.findIndex((q) => q.id === p.id) === k),
      } as InitialOccurrence,
    };
  });
  const overlap = (x: Item, y: Item) =>
    x.segment === y.segment && x.start < y.end && y.start < x.end;
  // Overlapping occurrences of one reading alone, like a son's name and the father inside it, are
  // that reading's own choice. Any other overlap is two readings disagreeing about the words.
  const oneReading = (x: (typeof shown)[number], y: (typeof shown)[number]) =>
    x.readings.size === 1 && y.readings.size === 1 && [...x.readings][0] === [...y.readings][0];
  for (const a of shown) {
    if (
      shown.some(
        (b) =>
          b !== a && !oneReading(a, b) && a.joined.some((x) => b.joined.some((y) => overlap(x, y))),
      )
    )
      a.occurrence.overlapsOtherReading = true;
  }
  return shown.map((s) => s.occurrence);
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
