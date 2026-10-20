import type { InitialRelationship } from './initial-readings';
import type { LegacyRow } from './legacy-readings';
import type { SourcePerson } from './types';

const personKey = (id: string | null | undefined) =>
  id?.startsWith('proposal:') ? id.slice(9) : id?.startsWith('local:') ? id.slice(6) : null;

/** Share already validated reviews by exact claim ID, never by names or source similarity. */
export function shareReviewedRelationships(cards: SourcePerson[], rows: LegacyRow[]) {
  const byRecord = new Map(rows.map((row) => [row.record_id, row]));
  const byPerson = new Map<string, SourcePerson>();
  for (const card of cards) {
    const key = personKey(card.id);
    if (!key || !card.initialReading) continue;
    if (byPerson.has(key)) throw Error('Duplicate local person reading');
    byPerson.set(key, card);
  }
  const localCardExists = (key: string) => {
    const node = byRecord.get(`graph_node:local:${key}`);
    return (
      !!node &&
      (JSON.parse(node.payload_json) as { personKeys?: string[] }).personKeys?.includes(key) ===
        true
    );
  };
  const protectedClaims = new Set<string>();
  for (const row of rows.filter((r) => r.authority === 'user_correction')) {
    if (row.kind === 'claim') protectedClaims.add(row.record_id);
    if (!['connection', 'exclusion'].includes(row.kind)) continue;
    const data = JSON.parse(row.payload_json) as { passageId?: string; claimIds?: string[] };
    if (!row.passage_id || data.passageId !== row.passage_id) continue;
    for (const id of data.claimIds ?? []) {
      const key = id.includes('/') ? id : `${row.passage_id}/${id}`;
      if (key.startsWith(`${row.passage_id}/`)) protectedClaims.add(`claim:${key}`);
    }
  }
  const groups = new Map<string, Map<string, InitialRelationship>>();
  for (const card of cards) {
    if (!card.initialReading) continue;
    card.initialReading.relationships = card.initialReading.relationships.filter((relation) => {
      const binding = relation.reviewBinding;
      if (!binding) return true;
      const reading = byRecord.get(binding.readingRecordId);
      if (
        reading?.kind !== 'name_reading' ||
        reading.authority !== 'screening' ||
        reading.decision !== 'needs_review' ||
        reading.payload_sha256 !== binding.readingPayloadSha256
      )
        return false;
      const subject = personKey(relation.subject?.id),
        object = personKey(relation.object?.id);
      if (!subject || !object || subject === object) return true;
      if (![subject, object].every((key) => key.startsWith(`${reading.passage_id}/`))) return false;
      const sourcePerson = personKey(card.id);
      if (sourcePerson !== subject && sourcePerson !== object) return false;
      let groupKey: string;
      if (binding.kind === 'supplemental') {
        if (!binding.localProposalId) return false;
        const data = JSON.parse(reading.payload_json) as {
          supplementalRelationshipProposals?: {
            localClaimId: string;
            subjectPersonKey?: string;
            objectPersonKey?: string;
            matchedLiveClaimIds?: string[];
            existingClaimIds?: string[];
          }[];
        };
        const proposal = data.supplementalRelationshipProposals?.find(
          (p) => p.localClaimId === binding.localProposalId,
        );
        if (proposal?.subjectPersonKey !== subject || proposal.objectPersonKey !== object)
          return false;
        if (
          [...(proposal.matchedLiveClaimIds ?? []), ...(proposal.existingClaimIds ?? [])].some(
            (id) =>
              protectedClaims.has(
                id.startsWith('claim:')
                  ? id
                  : `claim:${id.includes('/') ? id : `${reading.passage_id}/${id}`}`,
              ),
          )
        )
          return false;
        groupKey = `${binding.readingRecordId}/${binding.localProposalId}`;
      } else {
        const claim = byRecord.get(binding.claimRecordId ?? '');
        if (
          claim?.kind !== 'claim' ||
          claim.passage_id !== reading.passage_id ||
          claim.payload_sha256 !== binding.claimPayloadSha256 ||
          protectedClaims.has(claim.record_id)
        )
          return false;
        if (binding.kind === 'claim') {
          const data = JSON.parse(claim.payload_json) as {
            claim: { speaker?: string; addressee?: string; a?: string; b?: string };
          };
          const from = data.claim.speaker ?? data.claim.a,
            to = data.claim.addressee ?? data.claim.b;
          if (subject !== `${claim.passage_id}/${from}` || object !== `${claim.passage_id}/${to}`)
            return false;
        } else {
          const data = JSON.parse(reading.payload_json) as {
            relationships?: {
              claims: {
                liveClaimRecord: { recordId: string };
                correctedEvent?: { observer?: { localId?: string }; seen?: { localId?: string } };
              }[];
            };
          };
          const event = data.relationships?.claims.find(
            (c) => c.liveClaimRecord.recordId === claim.record_id,
          )?.correctedEvent;
          if (event?.observer?.localId !== subject || event?.seen?.localId !== object) return false;
        }
        groupKey = `${claim.record_id}:${claim.payload_sha256}:${binding.kind}`;
      }
      const group = groups.get(groupKey) ?? new Map();
      group.set(relation.id, structuredClone(relation));
      groups.set(groupKey, group);
      return false;
    });
  }
  for (const group of groups.values()) {
    const reviews = [...group.values()];
    const verdicts = new Set(reviews.map((r) => r.reviewBinding?.verdict).filter(Boolean));
    const interpretations = new Set(
      reviews.map((r) =>
        JSON.stringify([
          personKey(r.subject?.id),
          personKey(r.object?.id),
          r.reading.relation,
          r.reading.direction,
          r.reading.modality,
          r.reading.scene_status,
          r.reading.polarity,
        ]),
      ),
    );
    const conflict = interpretations.size > 1 || verdicts.size > 1;
    for (const review of reviews) {
      if (conflict) {
        review.countable = false;
        review.reviewStatus = 'conflicting_reviews';
      }
      const subjectKey = personKey(review.subject?.id)!,
        objectKey = personKey(review.object?.id)!;
      for (const key of [subjectKey, objectKey]) {
        const target = byPerson.get(key);
        if (!target?.initialReading) continue;
        const relation = structuredClone(review);
        for (const endpoint of [relation.subject, relation.object]) {
          const endpointKey = personKey(endpoint?.id);
          const card = endpointKey ? byPerson.get(endpointKey) : undefined;
          if (endpoint && card) endpoint.id = card.id;
          else if (endpoint && endpointKey && localCardExists(endpointKey))
            endpoint.id = `local:${endpointKey}`;
        }
        const partner = key === subjectKey ? relation.object : relation.subject;
        relation.partnerId = partner?.id ?? null;
        relation.partnerName = partner?.name ?? '';
        relation.partnerNameHe = partner?.nameHe ?? '';
        relation.partnerNavigable =
          !!byPerson.get(key === subjectKey ? objectKey : subjectKey) ||
          localCardExists(key === subjectKey ? objectKey : subjectKey);
        target.initialReading.relationships.push(relation);
      }
    }
  }
}
