import type { InitialOccurrence, ReadingAnchor } from './initial-readings';
import type { SourcePerson } from './types';

type Correction = {
  schema?: string;
  passageId?: string;
  legacyRef?: string;
  canonicalRef?: string;
  replacesPayloadSha256?: string;
  resolvesSourceQualityWarning?: boolean;
  duplicateCopy?: boolean;
  primaryPassageId?: string;
};
type Evidence = { quote: string; location: string };
type Person = { id: string; label: string; quote: string; quoteLocation: string };
type Claim = {
  claimId: string;
  field: string;
  kind: string;
  from?: string;
  to?: string;
  quote: string;
  quoteLocation: string;
  carried: boolean;
  readerVerdict: string;
  readerNote?: string;
  readerVerdictMeaning: string;
  originalNote?: string;
  classification: { mode: string };
  correctedEvent?: {
    quote: string;
    quoteLocation: string;
    observer?: { localId?: string };
    seen?: { localId?: string };
    reason?: string;
    note?: string;
  };
  userCorrectionExclusions?: unknown[];
  liveClaimRecord: { recordId: string; payloadSha256: string };
};
export interface LegacyPayload {
  personKey?: string;
  personId?: string;
  status?: string;
  historicalIdentityResolved?: boolean;
  personKeys?: string[];
  passageId?: string;
  ref?: string;
  source?: {
    passage?: string;
    before?: string;
    after?: string;
    livePassagePayloadSha256?: string;
    sourceSha256?: string;
  };
  people?: Person[];
  referenceCorrection?: Correction;
  sourceQuality?: { sourceReferenceVerified?: boolean; ref?: string };
  original?: {
    livePersonPayloadSha256: string;
    quote: string;
    quoteLocation: string;
    label: string;
  };
  proposalOnly?: boolean;
  schema?: string;
  registryRecords?: Record<string, string>;
  reading?: {
    reason: string;
    entityKind: string;
    status: string;
    isInitialProposal: boolean;
    historicalIdentityResolved: boolean;
    proposedRegistryId: string | null;
    proposedRegistryName?: { canonical: string; canonicalHe: string } | null;
    evidence: Evidence[];
    alternatives: { registryId?: string; why: string }[];
    localIdentity: { label: string; gloss?: string };
  };
  relationships?: { claims: Claim[]; note?: string };
  supplementalRelationshipProposals?: {
    localClaimId: string;
    personKey?: string;
    decision?: string;
    subjectPersonKey?: string;
    objectPersonKey?: string;
    reason: string;
    evidence: Evidence[];
    kind: string;
    mode?: string;
    existingClaimIds?: string[];
    matchedLiveClaimIds?: string[];
    sourceBindings?: { livePassagePayloadSha256: string; sourceSha256: string };
  }[];
  eraReview?: { reason?: string; conditionalRegistryGeneration?: unknown };
  canonical?: string;
  canonicalHe?: string;
}
export interface LegacyRow {
  record_id: string;
  kind: string;
  passage_id: string | null;
  ref: string | null;
  authority: string;
  decision: string | null;
  payload_sha256: string;
  payload_json: string;
}
const unpack = (row: LegacyRow): LegacyPayload => JSON.parse(row.payload_json);
const encode = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${encode(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};
const sha = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
export const legacyPersonId = (key: string) => `proposal:${key}`;

function correctionMatches(
  row: LegacyRow,
  payload: LegacyPayload,
  passage: LegacyRow,
  source: LegacyPayload,
) {
  const a = payload.referenceCorrection,
    b = source.referenceCorrection;
  return (
    !!a &&
    !!b &&
    a.schema === 'reference-correction/v1' &&
    b.schema === a.schema &&
    a.passageId === row.passage_id &&
    b.passageId === row.passage_id &&
    a.legacyRef === b.legacyRef &&
    a.canonicalRef === b.canonicalRef &&
    a.canonicalRef === row.ref &&
    row.ref === passage.ref &&
    source.ref === passage.ref
  );
}
function boundHash(
  row: LegacyRow,
  payload: LegacyPayload,
  passage: LegacyRow,
  source: LegacyPayload,
  expected?: string,
) {
  return (
    !!expected &&
    (row.payload_sha256 === expected ||
      (correctionMatches(row, payload, passage, source) &&
        payload.referenceCorrection?.replacesPayloadSha256 === expected))
  );
}
function sourceWarning(
  row: LegacyRow,
  data: LegacyPayload,
  passage: LegacyRow,
  source: LegacyPayload,
) {
  return (
    data.sourceQuality?.sourceReferenceVerified === false &&
    !(
      correctionMatches(row, data, passage, source) &&
      data.referenceCorrection?.resolvesSourceQualityWarning === true &&
      data.referenceCorrection.legacyRef === data.sourceQuality.ref
    )
  );
}

/** Readings remain distinct proposals for one exact passage-local person. */
export async function legacyCards(revision: string, rows: LegacyRow[], registry: LegacyRow[] = []) {
  const byId = new Map(rows.map((r) => [r.record_id, r]));
  const cards = new Map<string, SourcePerson>();
  const occurrences = new Map<string, InitialOccurrence>();
  for (const row of rows.filter(
    (r) =>
      r.kind === 'name_reading' && r.authority === 'screening' && r.decision === 'needs_review',
  )) {
    const data = unpack(row),
      key = data.personKey,
      reading = data.reading;
    if (
      !key ||
      !reading ||
      data.schema !== 'missing-name-reading/v2' ||
      !data.proposalOnly ||
      !reading.isInitialProposal ||
      reading.historicalIdentityResolved !== false ||
      reading.status !== 'read'
    )
      continue;
    const [pid, local] = key.split('/');
    if (pid !== row.passage_id) continue;
    const passage = byId.get(`passage:${pid}`),
      personRow = byId.get(`person:${key}`);
    if (!passage || !personRow) continue;
    const source = unpack(passage),
      personPayload = unpack(personRow),
      person = source.people?.find((p) => p.id === local);
    if (
      !person ||
      !boundHash(passage, source, passage, source, data.source?.livePassagePayloadSha256) ||
      !boundHash(
        personRow,
        personPayload,
        passage,
        source,
        data.original?.livePersonPayloadSha256,
      ) ||
      (await sha(encode(source.source))) !== data.source?.sourceSha256
    )
      continue;
    if (
      row.ref !== passage.ref ||
      (data.ref !== passage.ref && !correctionMatches(row, data, passage, source))
    )
      continue;
    const warned = sourceWarning(row, data, passage, source);
    const anchorFor = async (quote: string, location: string): Promise<ReadingAnchor[]> => {
      const locations = location === 'context' ? ['before', 'after'] : [location];
      const anchors: ReadingAnchor[] = [];
      for (const part of locations) {
        const text = source.source?.[part as 'passage' | 'before' | 'after'];
        if (!quote || typeof text !== 'string') continue;
        const at = text.indexOf(quote);
        if (at < 0) continue;
        const unique = text.indexOf(quote, at + 1) < 0;
        const hash = await sha(text),
          start = Array.from(text.slice(0, at)).length;
        anchors.push({
          occurrenceKey: `${source.referenceCorrection?.primaryPassageId ?? pid}:${part}:${hash}:${unique ? `${start}:${Array.from(quote).length}` : await sha(quote)}`,
          ref: passage.ref!,
          edition: '',
          quote,
          location: part,
          start: unique ? start : -1,
          end: unique ? start + Array.from(quote).length : -1,
          source_sha256: hash,
          offset_unit: unique ? 'Unicode code points' : 'unresolved',
          primary: part === 'passage' && !warned && unique,
        });
      }
      return anchors;
    };
    const evidence = (
      await Promise.all(reading.evidence.map((e) => anchorFor(e.quote, e.location)))
    ).flat();
    if (!reading.reason?.trim() || !evidence.length || evidence.length < reading.evidence.length)
      continue;
    const id = legacyPersonId(key);
    const card = cards.get(id) ?? {
      revision,
      id,
      name: reading.localIdentity.label,
      nameHe: person.label,
      summary: '',
      summaryHe: '',
      generation: null,
      places: [],
      ref: passage.ref!,
      quote: person.quote,
      initialReading: {
        reason: '',
        alternatives: [],
        relationships: [],
        neededContext: [],
        proposals: [],
      },
    };
    const initial = card.initialReading!;
    const candidate = reading.proposedRegistryId
      ? registry.find(
          (r) =>
            r.record_id === `registry_person:${reading.proposedRegistryId}` &&
            r.payload_sha256 === data.registryRecords?.[reading.proposedRegistryId!],
        )
      : undefined;
    initial.proposals!.push({
      id: row.record_id,
      reason: reading.reason,
      candidate: candidate
        ? {
            id: reading.proposedRegistryId!,
            name: unpack(candidate).canonical ?? reading.proposedRegistryId!,
            nameHe: unpack(candidate).canonicalHe ?? '',
          }
        : undefined,
      alternatives: reading.alternatives.map((a) => {
        const alternative =
          a.registryId &&
          registry.find(
            (r) =>
              r.record_id === `registry_person:${a.registryId}` &&
              r.payload_sha256 === data.registryRecords?.[a.registryId!],
          );
        return alternative ? `${unpack(alternative).canonical}: ${a.why}` : a.why;
      }),
      eraReason: data.eraReview?.reason,
      evidence,
      sourceWarning: warned,
    });
    const reviewedRows = rows.filter(
      (r) => r.kind === 'source_identity' && unpack(r).personKey === key,
    );
    const preferredRows = reviewedRows.some((r) => r.authority === 'user_correction')
      ? reviewedRows.filter((r) => r.authority === 'user_correction')
      : reviewedRows;
    const reviewed = preferredRows
      .filter(
        (r) =>
          r.kind === 'source_identity' &&
          ['source_review', 'user_correction'].includes(r.authority) &&
          r.decision === 'accepted_registry_identity',
      )
      .map(unpack)
      .filter(
        (d) =>
          d.personKey === key &&
          d.historicalIdentityResolved === true &&
          d.status === 'accepted_registry_identity' &&
          d.personId,
      );
    initial.reviewedPeople = reviewed.map((d) => ({
      id: d.personId!,
      name: registry.find((r) => r.record_id === `registry_person:${d.personId}`)
        ? (unpack(registry.find((r) => r.record_id === `registry_person:${d.personId}`)!)
            .canonical ?? d.personId!)
        : d.personId!,
    }));
    const endpoint = (localId?: string) => {
      const p = source.people?.find((p) => p.id === localId);
      return p ? { id: legacyPersonId(`${pid}/${p.id}`), name: p.label, nameHe: p.label } : null;
    };
    for (const claim of data.relationships?.claims ?? []) {
      const live = byId.get(claim.liveClaimRecord.recordId);
      if (
        !live ||
        live.authority === 'user_correction' ||
        claim.userCorrectionExclusions?.length ||
        !boundHash(live, unpack(live), passage, source, claim.liveClaimRecord.payloadSha256)
      )
        continue;
      if (claim.from !== local && claim.to !== local) continue;
      const evidence = await anchorFor(claim.quote, claim.quoteLocation);
      if (!evidence.length) continue;
      const subject = endpoint(claim.from),
        object = endpoint(claim.to),
        partner = claim.from === local ? object : subject;
      const relation = legacyRelation(claim);
      initial.relationships.push({
        id: `${row.record_id}/${claim.claimId}`,
        reviewBinding: {
          readingRecordId: row.record_id,
          readingPayloadSha256: row.payload_sha256,
          kind: 'claim',
          claimRecordId: live.record_id,
          claimPayloadSha256: live.payload_sha256,
          verdict: claim.readerVerdict,
        },
        subject,
        object,
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? '',
        partnerNameHe: partner?.nameHe ?? '',
        evidence,
        countable:
          claim.carried &&
          ['ok', 'fam', 'teach', 'narr'].includes(claim.readerVerdict) &&
          relation.known,
        reviewStatus:
          claim.readerVerdict === 'bad'
            ? 'rejected'
            : claim.readerVerdict === 'unc' || !claim.carried
              ? 'questioned'
              : claim.classification.mode === 'attempted'
                ? 'attempted'
                : undefined,
        reading: {
          relation: relation.name,
          category: relation.category,
          direction: relation.symmetric ? 'symmetric' : 'directed',
          modality:
            claim.classification.mode === 'hypothetical'
              ? 'hypothetical'
              : claim.readerVerdict === 'unc' || !claim.carried
                ? 'uncertain'
                : relation.response
                  ? 'response_to_teaching'
                  : 'asserted',
          scene_status:
            claim.classification.mode === 'hypothetical'
              ? 'hypothetical'
              : ['stated', 'attempted'].includes(claim.classification.mode)
                ? 'actual_report'
                : 'mixed',
          polarity: claim.classification.mode === 'denied' ? 'negative' : 'positive',
          verb: claim.kind,
          reason: [claim.readerNote, claim.originalNote, claim.readerVerdictMeaning]
            .filter(Boolean)
            .join(' '),
          alternatives: [],
        },
      });
    }
    for (const claim of data.relationships?.claims ?? []) {
      const event = claim.correctedEvent;
      if (!event || ![event.observer?.localId, event.seen?.localId].includes(key)) continue;
      const live = byId.get(claim.liveClaimRecord.recordId);
      if (
        !live ||
        live.authority === 'user_correction' ||
        claim.userCorrectionExclusions?.length ||
        !boundHash(live, unpack(live), passage, source, claim.liveClaimRecord.payloadSha256)
      )
        continue;
      const subject = event.observer?.localId?.startsWith(`${pid}/`)
        ? endpoint(event.observer.localId.slice(pid.length + 1))
        : null;
      const object = event.seen?.localId?.startsWith(`${pid}/`)
        ? endpoint(event.seen.localId.slice(pid.length + 1))
        : null;
      const evidence = await anchorFor(event.quote, event.quoteLocation);
      if (!evidence.length) continue;
      const partner = event.observer?.localId === key ? object : subject;
      initial.relationships.push({
        id: `${row.record_id}/${claim.claimId}/correction`,
        reviewBinding: {
          readingRecordId: row.record_id,
          readingPayloadSha256: row.payload_sha256,
          kind: 'corrected_event',
          claimRecordId: live.record_id,
          claimPayloadSha256: live.payload_sha256,
          verdict: claim.readerVerdict,
        },
        subject,
        object,
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? '',
        partnerNameHe: partner?.nameHe ?? '',
        evidence,
        countable: false,
        reading: {
          relation: 'source_connection',
          category: 'other',
          direction: 'directed',
          modality: 'asserted',
          scene_status: 'actual_report',
          polarity: 'positive',
          verb: 'saw',
          reason: event.note ?? event.reason ?? claim.readerNote ?? '',
          alternatives: [],
        },
      });
    }
    for (const proposal of data.supplementalRelationshipProposals ?? []) {
      if (
        proposal.sourceBindings &&
        (proposal.sourceBindings.sourceSha256 !== data.source?.sourceSha256 ||
          !boundHash(
            passage,
            source,
            passage,
            source,
            proposal.sourceBindings.livePassagePayloadSha256,
          ))
      )
        continue;
      if (proposal.matchedLiveClaimIds?.some((id) => byId.get(id)?.authority === 'user_correction'))
        continue;
      const subjectKey = proposal.subjectPersonKey,
        objectKey = proposal.objectPersonKey;
      if (subjectKey !== key && objectKey !== key && proposal.personKey !== key) continue;
      const subject = subjectKey?.startsWith(`${pid}/`)
        ? endpoint(subjectKey.slice(pid.length + 1))
        : null;
      const object = objectKey?.startsWith(`${pid}/`)
        ? endpoint(objectKey.slice(pid.length + 1))
        : null;
      const evidence = (
        await Promise.all(proposal.evidence.map((e) => anchorFor(e.quote, e.location)))
      ).flat();
      if (!evidence.length) continue;
      const partner = subjectKey === key ? object : subject;
      initial.relationships.push({
        id: `${row.record_id}/${proposal.localClaimId}`,
        reviewBinding: {
          readingRecordId: row.record_id,
          readingPayloadSha256: row.payload_sha256,
          kind: 'supplemental',
          localProposalId: proposal.localClaimId,
        },
        subject,
        object,
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? '',
        partnerNameHe: partner?.nameHe ?? '',
        evidence,
        countable:
          ['descendant_of', 'group_descent'].includes(proposal.kind) &&
          proposal.decision === 'source_supported' &&
          ['reported', 'stated'].includes(proposal.mode ?? ''),
        reading: {
          relation: ['descendant_of', 'group_descent'].includes(proposal.kind)
            ? proposal.kind
            : 'source_connection',
          category: ['descendant_of', 'group_descent'].includes(proposal.kind) ? 'family' : 'other',
          direction: 'directed',
          modality: proposal.decision === 'source_supported' ? 'asserted' : 'uncertain',
          scene_status:
            proposal.mode === 'hypothetical'
              ? 'hypothetical'
              : proposal.mode === 'reported' || proposal.mode === 'stated'
                ? 'actual_report'
                : 'mixed',
          polarity: 'positive',
          verb: proposal.kind,
          reason: proposal.reason,
          alternatives: [],
        },
      });
    }
    cards.set(id, card);
    if (reading.entityKind !== 'not_a_person' && person.quoteLocation === 'passage' && !warned) {
      const nameAnchors = await anchorFor(person.quote, 'passage');
      if (nameAnchors.length) {
        const anchor = nameAnchors[0],
          occurrence = occurrences.get(anchor.occurrenceKey) ?? {
            key: anchor.occurrenceKey,
            ref: passage.ref!,
            quote: person.quote,
            people: [],
            passageOnly: !anchor.primary || !wholeName(source.source?.passage ?? '', person.quote),
          };
        if (!occurrence.people.some((p) => p.id === id))
          occurrence.people.push({ id, name: card.name });
        occurrences.set(anchor.occurrenceKey, occurrence);
      }
    }
  }
  // A partner without a first reading can still use its existing local card, if present.
  for (const card of cards.values())
    for (const relation of card.initialReading!.relationships) {
      for (const endpoint of [relation.subject, relation.object]) {
        if (!endpoint || cards.has(endpoint.id)) continue;
        const key = endpoint.id.slice('proposal:'.length),
          node = byId.get(`graph_node:local:${key}`);
        const known = node && unpack(node).personKeys?.includes(key);
        const previous = endpoint.id;
        if (known) endpoint.id = `local:${key}`;
        if (relation.partnerId === previous) {
          relation.partnerId = endpoint.id;
          relation.partnerNavigable = !!known;
        }
      }
    }
  return { cards: [...cards.values()], occurrences: [...occurrences.values()] };
}
function legacyRelation(claim: Claim) {
  const family = ['child_of', 'parent_of', 'spouse_of', 'sibling_of'];
  if (family.includes(claim.kind))
    return {
      name: claim.kind,
      category: 'family',
      known: true,
      symmetric: ['spouse_of', 'sibling_of'].includes(claim.kind),
    };
  if (['teacher_of', 'student_of'].includes(claim.kind))
    return { name: claim.kind, category: 'teaching', known: true };
  if (
    claim.field === 'speech' &&
    ['said', 'asked', 'answered', 'objected', 'taught'].includes(claim.kind)
  )
    return { name: 'speaks_to', category: 'action', known: true };
  if (claim.kind === 'quoted_teaching')
    return { name: 'reports_in_name_of', category: 'teaching', response: false, known: true };
  if (claim.kind === 'in_the_presence_of')
    return { name: 'meets', category: 'action', known: true };
  return { name: 'source_connection', category: 'other', known: false };
}

export function wholeName(text: string, quote: string) {
  const at = text.indexOf(quote);
  if (at < 0 || text.indexOf(quote, at + 1) >= 0) return false;
  const word = (character: string | undefined) => !!character && /[\p{L}\p{M}]/u.test(character);
  return (
    !word(Array.from(text.slice(0, at)).at(-1)) &&
    !word(Array.from(text.slice(at + quote.length))[0])
  );
}
