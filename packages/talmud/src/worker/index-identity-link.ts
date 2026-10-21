import type { CheckedPassage } from '../lib/sage-graph/checked-readings';
import { checkedNameSuggestion } from '../lib/sage-graph/name-candidates';
import { decisionScope, POSSIBLE_ERA_SCOPE_SQL } from '../lib/sage-graph/possible-era';
import { type StoredRow, sha256 } from '../lib/sage-graph/source-reading-store';

type Binding = {
  recordId: string;
  payloadSha256: string;
  authority: string;
  decision: string | null;
};
interface Link {
  version: 'index-identity-link-v1';
  personKey: string;
  candidate: string;
  accepted: false;
  status: 'possible';
  candidateRecord: Binding;
  registry: Binding;
  checkedDependencies: { recordId: string; payloadSha256: string; store: string }[];
  reason: string;
}
export interface IndexIdentityCandidate {
  id: string;
  registrySha256: string;
  proof: { recordId: string; payloadSha256: string; personKey: string };
  reason: string;
}
const matches = async (row: StoredRow, pin: Binding) =>
  row.record_id === pin.recordId &&
  row.payload_sha256 === pin.payloadSha256 &&
  row.authority === pin.authority &&
  row.decision === pin.decision &&
  (await sha256(row.payload_json)) === pin.payloadSha256;

/** Only a release-rebuilt link can enrich a still-current checked person's possible profile. */
export async function indexIdentityCandidate(
  link: StoredRow,
  candidate: StoredRow,
  registry: StoredRow,
  passage: CheckedPassage,
  localId: string,
  store: string,
  scope: StoredRow[],
): Promise<IndexIdentityCandidate | undefined> {
  try {
    const key = `${passage.id}/${localId}`;
    if (
      link.kind !== 'identity_link_evidence' ||
      link.record_id !== `identity_link_evidence:v1/${key}` ||
      link.subject_id !== key ||
      link.authority !== 'screening' ||
      link.decision !== 'needs_review' ||
      (await sha256(link.payload_json)) !== link.payload_sha256
    )
      return;
    const d = JSON.parse(link.payload_json) as Link;
    if (
      d.version !== 'index-identity-link-v1' ||
      d.personKey !== key ||
      d.accepted !== false ||
      d.status !== 'possible' ||
      d.registry.recordId !== `registry_person:${d.candidate}` ||
      !(await matches(candidate, d.candidateRecord)) ||
      !(await matches(registry, d.registry)) ||
      !d.reason?.trim() ||
      !Array.isArray(d.checkedDependencies) ||
      d.checkedDependencies.length !== 4 ||
      decisionScope(scope, key, d.candidate).length
    )
      return;
    // This shared guard also checks later decisions, exact source anchors and source-store ownership.
    if (!(await checkedNameSuggestion(candidate, passage, localId, store, scope))) return;
    const names = JSON.parse(candidate.payload_json);
    if (
      !names.candidates.some(
        (c: { slug: string; payloadSha256: string }) =>
          c.slug === d.candidate && c.payloadSha256 === registry.payload_sha256,
      )
    )
      return;
    const required = new Set([
      `checked_person:${key}`,
      `checked_reading:${passage.id}`,
      `checked_coverage:${passage.id}`,
      `checked_ownership:${passage.id}`,
    ]);
    for (const b of d.checkedDependencies) {
      if (!required.delete(b.recordId) || b.store !== store) return;
      const row = passage.stored.find((r) => r.record_id === b.recordId);
      if (
        !row ||
        row.payload_sha256 !== b.payloadSha256 ||
        (await sha256(row.payload_json)) !== b.payloadSha256
      )
        return;
    }
    if (required.size) return;
    return {
      id: d.candidate,
      registrySha256: registry.payload_sha256,
      proof: { recordId: link.record_id, payloadSha256: link.payload_sha256, personKey: key },
      reason: d.reason,
    };
  } catch {
    return;
  }
}

/** Reads the link and all current decisions from the requested graph revision, never from a short-name lookup. */
export async function readIndexIdentityCandidate(
  db: D1Database,
  revision: string,
  passage: CheckedPassage,
  localId: string,
  store: string,
): Promise<IndexIdentityCandidate | undefined> {
  try {
    const key = `${passage.id}/${localId}`;
    const read = (id: string) =>
      db
        .prepare(
          'SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=?',
        )
        .bind(revision, id)
        .first<StoredRow>();
    const link = await read(`identity_link_evidence:v1/${key}`);
    if (!link) return;
    const d = JSON.parse(link.payload_json) as Link;
    const [candidate, registry, scope] = await Promise.all([
      read(`name_candidates:v1/${key}`),
      read(`registry_person:${d.candidate}`),
      db
        .prepare(POSSIBLE_ERA_SCOPE_SQL)
        .bind(revision, passage.id, key, key, key, key, key, key)
        .all<StoredRow>(),
    ]);
    if (!candidate || !registry || !scope.success) return;
    return await indexIdentityCandidate(
      link,
      candidate,
      registry,
      passage,
      localId,
      store,
      scope.results,
    );
  } catch {
    return;
  }
}
