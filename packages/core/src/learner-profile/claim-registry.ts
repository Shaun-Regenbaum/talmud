// Extension point: add each claim alias and its facet-map entry together.
import type { LearnerProfileClaim } from './claims.ts';

export type KnowledgeClaim = LearnerProfileClaim<'knowledge'>;
export type InterestClaim = LearnerProfileClaim<'interests'>;

/** Add future facet kinds here to extend the profile's typed claim registry. */
export interface LearnerProfileFacetMap {
  readonly knowledge: readonly KnowledgeClaim[];
  readonly interests: readonly InterestClaim[];
}

export type LearnerProfileFacetKind = keyof LearnerProfileFacetMap;

export type LearnerProfileClaimFor<Kind extends LearnerProfileFacetKind> =
  LearnerProfileFacetMap[Kind][number];

export type LearnerProfileFacets = {
  readonly [Kind in LearnerProfileFacetKind]?: LearnerProfileFacetMap[Kind];
};
