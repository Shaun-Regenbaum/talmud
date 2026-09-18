// Keep operations kind-agnostic; register category-specific types in claim-registry.ts.
import type {
  LearnerProfileClaimFor,
  LearnerProfileFacetKind,
  LearnerProfileFacetMap,
  LearnerProfileFacets,
} from './claim-registry.ts';
import {
  assertValidLearnerProfileClaim,
  type LearnerProfileClaimId,
} from './claims.ts';

/**
 * Serializable, persistence-agnostic model of one learner.
 *
 * @example
 * ```ts
 * const profile: LearnerProfile = {
 *   schemaVersion: 1,
 *   revision: 1,
 *   facets: {
 *     knowledge: [{
 *       id: 'knowledge-aramaic',
 *       kind: 'knowledge',
 *       statement: 'Struggles to read unfamiliar Aramaic passages.',
 *       confidence: 0.85,
 *       importance: 0.9,
 *       updatedAt: '2026-09-17T14:32:00.000Z',
 *     }],
 *   },
 * };
 * ```
 */
export interface LearnerProfile {
  readonly schemaVersion: 1;
  /** Monotonically increases whenever a claim is added, changed, or removed. */
  readonly revision: number;
  readonly facets: LearnerProfileFacets;
}

/** Create a profile with no claims yet about the learner. */
export function createLearnerProfile(): LearnerProfile {
  return {
    schemaVersion: 1,
    revision: 0,
    facets: {},
  };
}

/** Add an atomic claim without replacing other claims in its category. */
export function addLearnerProfileClaim<Kind extends LearnerProfileFacetKind>(
  profile: LearnerProfile,
  claim: LearnerProfileClaimFor<Kind>,
): LearnerProfile {
  assertValidLearnerProfileClaim(claim);
  const claims = profile.facets[claim.kind] ?? [];
  if (claims.some((existing) => existing.id === claim.id)) {
    throw new Error(`${claim.kind} claim "${claim.id}" already exists`);
  }

  return {
    ...profile,
    revision: profile.revision + 1,
    facets: {
      ...profile.facets,
      [claim.kind]: [...claims, { ...claim }],
    },
  };
}

/** Replace one existing claim, identified within its facet category. */
export function updateLearnerProfileClaim<Kind extends LearnerProfileFacetKind>(
  profile: LearnerProfile,
  claim: LearnerProfileClaimFor<Kind>,
): LearnerProfile {
  assertValidLearnerProfileClaim(claim);
  const claims = profile.facets[claim.kind] ?? [];
  if (!claims.some((existing) => existing.id === claim.id)) {
    throw new Error(`${claim.kind} claim "${claim.id}" does not exist`);
  }

  return {
    ...profile,
    revision: profile.revision + 1,
    facets: {
      ...profile.facets,
      [claim.kind]: claims.map((existing) => (existing.id === claim.id ? { ...claim } : existing)),
    },
  };
}

/** Read all claims in one facet category with their kind-specific type. */
export function getLearnerProfileClaims<Kind extends LearnerProfileFacetKind>(
  profile: LearnerProfile,
  kind: Kind,
): LearnerProfileFacetMap[Kind] {
  return profile.facets[kind] ?? [];
}

/** Remove one claim without disturbing the remaining profile snapshot. */
export function removeLearnerProfileClaim(
  profile: LearnerProfile,
  kind: LearnerProfileFacetKind,
  claimId: LearnerProfileClaimId,
): LearnerProfile {
  const claims = profile.facets[kind] ?? [];
  const remainingClaims = claims.filter((claim) => claim.id !== claimId);
  if (remainingClaims.length === claims.length) return profile;

  const facets: LearnerProfileFacets = {
    ...profile.facets,
    [kind]: remainingClaims,
  };

  return {
    ...profile,
    revision: profile.revision + 1,
    facets,
  };
}
