import { z } from 'zod';
import { GENERATION_ID_SET } from '../client/generations';
import { canonicalSlug } from '../lib/rabbi/identity';
import type { ConditionalProfileResult } from '../lib/sage-graph/conditional-profile';
import {
  decidingRows,
  decisionScope,
  POSSIBLE_ERA_SCOPE_SQL,
} from '../lib/sage-graph/possible-era';
import { type StoredRow, sha256 } from '../lib/sage-graph/source-reading-store';
import { type RegistryDatabase, reviewedEraShape, reviewedRabbiShape } from './reviewed-rabbi';

export interface VerifiedProfileCandidate {
  id: string;
  proof: { recordId: string; payloadSha256: string; personKey: string };
  registrySha256: string;
  reason?: string;
}
const source = z.object({ title: z.string().min(1), url: z.string().url().startsWith('https://') });
const entryShape = z.object({
  canonical: z.string().min(1),
  canonicalHe: z.string().nullable().optional(),
  generation: z
    .string()
    .refine((id) => GENERATION_ID_SET.has(id))
    .nullable()
    .optional(),
  era: reviewedEraShape.optional(),
  bio: z.string().nullable().optional(),
  places: z.array(z.string().min(1)),
  sources: z.array(source).optional(),
  wiki: z.string().url().startsWith('https://').nullable().optional(),
});

/** Call only after the shared candidate/source/current-decision checks succeed. No name lookup occurs here. */
export async function loadConditionalProfile(
  db: RegistryDatabase,
  revision: string,
  candidate: VerifiedProfileCandidate,
): Promise<ConditionalProfileResult | undefined> {
  try {
    const slug = canonicalSlug(candidate.id);
    if (!/^[a-z0-9()-]+$/.test(slug)) return undefined;
    const key = candidate.proof.personKey;
    const scope: { results: StoredRow[]; success?: boolean } = await db
      .prepare(POSSIBLE_ERA_SCOPE_SQL)
      .bind(revision, key.split('/')[0], key, key, key, key, key, key)
      .all<StoredRow>();
    if (scope.success !== true) throw Error('Could not read current identity decisions');
    if (
      scope.results.length > 2000 ||
      decidingRows(scope.results, key).length ||
      decisionScope(scope.results, key, candidate.id).some(
        (r) => ['source_review', 'user_correction'].includes(r.authority) || r.kind === 'withheld',
      )
    )
      return undefined;

    const row = await db
      .prepare(
        `SELECT record_id,kind,subject_id,authority,decision,payload_sha256,payload_json
       FROM sage_graph_all_records WHERE revision_id=? AND record_id=?`,
      )
      .bind(revision, `registry_person:${slug}`)
      .first<StoredRow>();
    if (!row) return undefined;
    if (
      row.kind !== 'registry_person' ||
      row.subject_id !== slug ||
      (await sha256(row.payload_json)) !== row.payload_sha256
    )
      throw Error('Invalid saved registry row');
    if (
      !/^[a-f0-9]{64}$/.test(candidate.registrySha256) ||
      candidate.registrySha256 !== row.payload_sha256
    )
      throw Error('Registry evidence changed');
    let payload: unknown;
    if (row.authority === 'registry' && row.decision == null)
      payload = JSON.parse(row.payload_json);
    else if (
      ['source_review', 'user_correction'].includes(row.authority) &&
      row.decision === 'supported'
    )
      payload = reviewedRabbiShape.parse(JSON.parse(row.payload_json));
    else return undefined;
    const payloadHash = row.payload_sha256;
    const entry = entryShape.parse(payload);
    return {
      status: 'available',
      candidateId: slug,
      name: entry.canonical,
      nameHe: entry.canonicalHe ?? entry.canonical,
      accepted: false,
      historicalIdentityResolved: false,
      generation: entry.generation ?? null,
      ...(entry.era ? { era: entry.era } : {}),
      bio: entry.bio || null,
      ...(candidate.reason ? { identityReason: candidate.reason } : {}),
      places: entry.places,
      sources: entry.sources ?? (entry.wiki ? [{ title: entry.canonical, url: entry.wiki }] : []),
      proposal: { ...candidate.proof, revision },
      registry: {
        recordId: `registry_person:${slug}`,
        payloadSha256: payloadHash,
        source: 'graph',
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
