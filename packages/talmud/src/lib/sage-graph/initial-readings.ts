import type { SourcePerson } from './types';

export interface ReadingAnchor {
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
  reviewedPeople?: { id: string; name: string }[];
  reason: string;
  alternatives: { id: string | null; reason: string }[];
  relationships: InitialRelationship[];
  neededContext: string[];
}
export interface InitialOccurrence {
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
    for (const anchor of person.mentions.filter((m) => m.primary)) {
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
  const anchor = person.mentions.find((m) => m.primary) ?? person.mentions[0];
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
