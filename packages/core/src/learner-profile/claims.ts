// Stable primitive: register new learner-profile claim kinds in claim-registry.ts.
/** A finite number from zero through one, validated by profile operations. */
export type UnitScore = number;

/** Stable identity for one independently managed profile claim. */
export type LearnerProfileClaimId = string;

/**
 * One atomic statement about a learner within a profile facet category.
 *
 * @example
 * ```ts
 * const claim: LearnerProfileClaim<'knowledge'> = {
 *   id: 'knowledge-aramaic',
 *   kind: 'knowledge',
 *   statement: 'Struggles to read unfamiliar Aramaic passages.',
 *   confidence: 0.85,
 *   importance: 0.9,
 *   updatedAt: '2026-09-17T14:32:00.000Z',
 * };
 * ```
 */
export interface LearnerProfileClaim<Kind extends string> {
  readonly id: LearnerProfileClaimId;
  readonly kind: Kind;
  readonly statement: string;
  /** How confidently the application should rely on this statement. */
  readonly confidence: UnitScore;
  /** How strongly this claim should influence personalization. */
  readonly importance: UnitScore;
  /** ISO-8601 timestamp supplied by the caller that observed the update. */
  readonly updatedAt: string;
}

function assertUnitScore(name: 'confidence' | 'importance', value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1`);
  }
}

/** Validate the invariants shared by every profile claim kind. */
export function assertValidLearnerProfileClaim<Kind extends string>(
  claim: LearnerProfileClaim<Kind>,
): void {
  if (claim.id.trim().length === 0) {
    throw new Error('claim id must not be blank');
  }
  assertUnitScore('confidence', claim.confidence);
  assertUnitScore('importance', claim.importance);
}
