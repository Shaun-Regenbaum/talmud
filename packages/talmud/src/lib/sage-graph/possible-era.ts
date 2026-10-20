import { canonicalSlug } from '../rabbi/identity';
import type { LegacyRow } from './legacy-readings';

type EraRow = LegacyRow & { subject_id?: string | null; object_id?: string | null };

export interface EraBinding {
  recordId: string;
  payloadSha256: string;
  authority: string;
  decision: string | null;
}
export interface PossibleEra {
  version: 'possible-era-v1';
  personKey: string;
  tier: 'A' | 'B';
  originalCandidateId: string;
  canonicalCandidateId: string;
  generation: string;
  identity: EraBinding;
  reason: EraBinding & { text: string; evidence: { location: string; quote: string }[] };
  registry: EraBinding & { name: string; nameHe: string };
  dependencies: EraBinding[];
  scope: EraBinding[];
  policySha256: string;
  holdsSha256: string;
  aliasMapSha256: string;
  acceptedEra: false;
  independentlyConfirmed: false;
  usableForDatingOthers: false;
  meaning: 'approximate_activity_generation_not_lifespan';
}
export const POSSIBLE_ERA_POLICY =
  '73dedaade975d72fcb015d735435d9b73131e9bd6ab022fb1ccd919e43f0ef01';
const HOLDS = 'c4c5a91522695dc5d6fc489e62458128195bb2d364d253d9f7c47c31f8beca18';
const ALIASES = '6eb992d650ce40a8848e34032170b971de0d8fbd6e729d2272f4409fea803e64';
const scopeKinds = new Set([
  'source_identity',
  'identity_assessment',
  'identity_proposal',
  'name_reading',
  'era_review',
  'era_assessment',
  'identity_assignment',
  'accepted_identity',
]);
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const same = (row: LegacyRow | undefined, b: EraBinding) =>
  !!row &&
  row.record_id === b.recordId &&
  row.payload_sha256 === b.payloadSha256 &&
  row.authority === b.authority &&
  row.decision === b.decision;

function decisionScope(rows: EraRow[], personKey: string, candidate: string) {
  const [pid, local] = personKey.split('/');
  const payload = (r: LegacyRow) => JSON.parse(r.payload_json);
  const direct = (d: ReturnType<typeof JSON.parse>) =>
    d.personKey === personKey ||
    d.case?.personKey === personKey ||
    d.identityDecision?.personKey === personKey ||
    d.personKeys?.includes(personKey) ||
    d.a?.personKey === personKey ||
    d.b?.personKey === personKey;
  const groups = new Set(
    rows
      .filter((r) => r.kind === 'identity_assignment' && direct(payload(r)))
      .flatMap((r) => payload(r).groupIds ?? []),
  );
  const byId = new Map(rows.map((r) => [r.record_id, r]));
  return rows.filter((r) => {
    const d = payload(r);
    let keep = scopeKinds.has(r.kind) && direct(d);
    if (['identity_group', 'identity_review', 'identity_finding'].includes(r.kind)) {
      const ids = [d.groupId, ...(d.groupIds ?? []), ...(r.kind === 'identity_group' ? [d.id] : [])]
        .filter(Boolean)
        .map((g) => (g.includes('/') ? g : `${d.dossierId ?? ''}/${g}`));
      keep =
        ids.some((g) => groups.has(g)) ||
        (r.kind === 'identity_review' &&
          [candidate, canonicalSlug(candidate)].includes(d.registrySlug));
    }
    if (r.kind === 'withheld' && r.passage_id === pid) keep = true;
    if (r.authority === 'user_correction') {
      keep ||=
        direct(d) ||
        [r.subject_id, r.object_id].some((id) => id === personKey || id === `local:${personKey}`);
      for (const raw of d.passageId === pid ? (d.claimIds ?? []) : []) {
        const cid = raw.replace(/^claim:/, '');
        const claim = byId.get(`claim:${cid.includes('/') ? cid : `${pid}/${cid}`}`);
        if (claim) {
          const c = payload(claim).claim ?? {};
          keep ||= [c.speaker, c.addressee, c.a, c.b].includes(local);
        }
      }
    }
    return keep;
  });
}

export async function possibleEra(
  personKey: string,
  row: LegacyRow,
  rows: EraRow[],
): Promise<PossibleEra | undefined> {
  try {
    return await checkedPossibleEra(personKey, row, rows);
  } catch {
    return undefined;
  }
}

/** A possible era disappears when its exact supporting records or review scope change. */
async function checkedPossibleEra(
  personKey: string,
  row: LegacyRow,
  rows: EraRow[],
): Promise<PossibleEra | undefined> {
  if (
    row.kind !== 'possible_era' ||
    row.record_id !== `possible_era:v1/${personKey}` ||
    row.authority !== 'screening' ||
    row.decision !== 'needs_review' ||
    (await hash(row.payload_json)) !== row.payload_sha256
  )
    return;
  const value = JSON.parse(row.payload_json) as PossibleEra;
  if (
    value.version !== 'possible-era-v1' ||
    value.personKey !== personKey ||
    !['A', 'B'].includes(value.tier) ||
    value.policySha256 !== POSSIBLE_ERA_POLICY ||
    value.holdsSha256 !== HOLDS ||
    value.aliasMapSha256 !== ALIASES ||
    value.acceptedEra !== false ||
    value.independentlyConfirmed !== false ||
    value.usableForDatingOthers !== false ||
    value.meaning !== 'approximate_activity_generation_not_lifespan' ||
    canonicalSlug(value.originalCandidateId) !== value.canonicalCandidateId
  )
    return;
  const byId = new Map(rows.map((r) => [r.record_id, r]));
  for (const b of value.dependencies) {
    const dependency = byId.get(b.recordId);
    if (!same(dependency, b) || (await hash(dependency!.payload_json)) !== b.payloadSha256) return;
  }
  const currentScope = decisionScope(rows, personKey, value.originalCandidateId);
  if (
    currentScope.length !== value.scope.length ||
    value.scope.some((b) => !same(byId.get(b.recordId), b))
  )
    return;
  const identityRow = byId.get(value.identity.recordId),
    registryRow = byId.get(value.registry.recordId);
  if (
    !same(identityRow, value.identity) ||
    !same(registryRow, value.registry) ||
    value.reason.recordId !== value.identity.recordId ||
    value.reason.payloadSha256 !== value.identity.payloadSha256
  )
    return;
  const identity = JSON.parse(identityRow!.payload_json),
    registry = JSON.parse(registryRow!.payload_json);
  const selected =
    identityRow!.kind === 'source_identity'
      ? identity
      : identityRow!.kind === 'identity_proposal'
        ? identity.answer
        : identityRow!.kind === 'name_reading'
          ? identity.reading
          : null;
  if (
    !selected ||
    (selected.personId ?? selected.proposedRegistryId) !== value.originalCandidateId ||
    selected.reason !== value.reason.text ||
    JSON.stringify(selected.evidence) !== JSON.stringify(value.reason.evidence)
  )
    return;
  if (
    value.tier === 'A' &&
    (identityRow!.kind !== 'source_identity' ||
      !['source_review', 'user_correction'].includes(identityRow!.authority) ||
      identityRow!.decision !== 'accepted_registry_identity' ||
      identity.status !== 'accepted_registry_identity' ||
      identity.historicalIdentityResolved !== true)
  )
    return;
  if (
    value.tier === 'B' &&
    (identityRow!.authority !== 'screening' ||
      identityRow!.decision !== 'needs_review' ||
      !['identity_proposal', 'name_reading'].includes(identityRow!.kind))
  )
    return;
  if (
    value.tier === 'B' &&
    identityRow!.kind === 'identity_proposal' &&
    (identity.accepted !== false || identity.status !== 'complete' || selected.status !== 'matched')
  )
    return;
  if (
    value.tier === 'B' &&
    identityRow!.kind === 'name_reading' &&
    (selected.identityStatus !== 'registry_candidate' ||
      !['sage', 'biblical_person', 'other_human'].includes(selected.entityKind))
  )
    return;
  if (
    registry.generation !== value.generation ||
    registry.canonical !== value.registry.name ||
    registry.canonicalHe !== value.registry.nameHe
  )
    return;
  return value;
}

/** Include exact-key decisions even when older writers omitted their passage index. */
export const POSSIBLE_ERA_SCOPE_SQL = `SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND (passage_id=? OR kind IN ('identity_group','identity_review','identity_finding') OR authority='user_correction' OR json_extract(payload_json,'$.personKey')=? OR json_extract(payload_json,'$.a.personKey')=? OR json_extract(payload_json,'$.b.personKey')=? OR json_extract(payload_json,'$.case.personKey')=? OR json_extract(payload_json,'$.identityDecision.personKey')=? OR EXISTS (SELECT 1 FROM json_each(sage_graph_all_records.payload_json,'$.personKeys') WHERE value=?)) LIMIT 2001`;
