import { CHECKED_FORMAT, type CheckedPassage } from './checked-readings';
import type { NameSuggestion } from './initial-readings';
import { decidingRows } from './possible-era';
import { type StoredRow, sha256 } from './source-reading-store';

/** A card names at most this many registry entries for a short name; the rest are only counted. */
export const LISTED_ENTRIES = 12;
/** More scope rows than this and the decisions cannot all be checked, so nothing is shown (as for possible eras). */
const SCOPE_LIMIT = 2000;

interface Binding {
  recordId: string;
  store: string | null;
  payloadSha256: string | null;
  payloadFormat: string | null;
}
interface NameCandidates {
  basis?: string;
  personKey: string;
  passageId: string;
  status: 'tentative' | 'alternatives' | 'unresolved' | 'local_relative';
  suggestion: string | null;
  candidates: { slug: string; name: string; nameHe: string }[];
  reason: string;
  accepted: boolean;
  historicalIdentityResolved: boolean;
  mentions: { sourceId: string; start: number; end: number; quote: string }[];
  bindings: { person: Binding; reading: Binding; ownership: Binding; coverage: Binding };
}

/**
 * The graph's first registry suggestion for one checked person, for that person's card. It is shown only when the
 * record cites the exact checked rows this card was read from (the person, and the reading's envelope, ownership and
 * coverage), in the same store, and only that person's printed names. A reviewed or human decision about this person in
 * the same graph revision outranks it, even one made after it, and then nothing is shown. scope: the person's scope rows
 * in that revision (POSSIBLE_ERA_SCOPE_SQL). It never becomes an accepted identity: one exact full name shows as a
 * possible identity, and a short name lists the registry entries it fits.
 */
export async function checkedNameSuggestion(
  row: StoredRow | null,
  passage: CheckedPassage,
  localId: string,
  store: string,
  scope: StoredRow[],
): Promise<NameSuggestion | undefined> {
  const key = `${passage.id}/${localId}`;
  if (
    !row ||
    scope.length > SCOPE_LIMIT ||
    decidingRows(scope, key).length ||
    row.record_id !== `name_candidates:v1/${key}` ||
    row.kind !== 'name_candidates' ||
    row.subject_id !== key ||
    row.authority !== 'screening' ||
    row.decision !== 'needs_review' ||
    (await sha256(row.payload_json)) !== row.payload_sha256
  )
    return undefined;
  const data = JSON.parse(row.payload_json) as NameCandidates;
  const cites = (b: Binding | undefined, recordId: string) => {
    const stored = passage.stored.find((r) => r.record_id === recordId);
    return (
      !!stored &&
      b?.recordId === recordId &&
      b.store === store &&
      b.payloadFormat === CHECKED_FORMAT &&
      b.payloadSha256 === stored.payload_sha256
    );
  };
  if (
    !Array.isArray(data.mentions) ||
    !Array.isArray(data.candidates) ||
    data.basis !== 'checked-reading' ||
    data.personKey !== key ||
    data.passageId !== passage.id ||
    data.accepted !== false ||
    data.historicalIdentityResolved !== false ||
    !cites(data.bindings?.person, `checked_person:${key}`) ||
    !cites(data.bindings?.reading, `checked_reading:${passage.id}`) ||
    !cites(data.bindings?.ownership, `checked_ownership:${passage.id}`) ||
    !cites(data.bindings?.coverage, `checked_coverage:${passage.id}`)
  )
    return undefined;
  const printed = (passage.allMentions.get(localId) ?? []).filter((m) => m.role === 'printed_name');
  const evidence = data.mentions.map((m) =>
    printed.find(
      (a) =>
        a.source_id === m.sourceId && a.start === m.start && a.end === m.end && a.quote === m.quote,
    ),
  );
  if (!evidence.length || evidence.some((a) => !a)) return undefined;
  const entry = (c: NameCandidates['candidates'][number]) => ({
    id: c.slug,
    name: c.name,
    nameHe: c.nameHe,
  });
  const chosen = data.candidates.find((c) => c.slug === data.suggestion);
  if (data.status === 'tentative' && (!chosen || data.candidates.length !== 1)) return undefined;
  return {
    id: row.record_id,
    payloadSha256: row.payload_sha256,
    personKey: key,
    status: data.status,
    reason: data.reason,
    candidate: data.status === 'tentative' ? entry(chosen!) : undefined,
    registryEntries:
      data.status === 'alternatives'
        ? {
            listed: data.candidates.slice(0, LISTED_ENTRIES).map(entry),
            total: data.candidates.length,
          }
        : undefined,
    evidence: evidence as NonNullable<(typeof evidence)[number]>[],
  };
}
