/** A finite number from zero through one, validated by learner-memory operations. */
export type UnitScore = number;

/** Supported learner-memory categories. */
export enum LearnerMemoryCategory {
  Knowledge = 'knowledge',
}

/**
 * One ID-free atomic statement about a learner.
 *
 * @example
 * ```ts
 * const memory: LearnerMemory = {
 *   category: 'knowledge',
 *   statement: 'Understands the basic structure of a sugya.',
 *   confidence: 0.85,
 *   updatedAt: '2026-09-22T12:00:00.000Z',
 * };
 * ```
 */
export interface LearnerMemory {
  readonly category: LearnerMemoryCategory;
  /** Natural language statement encompassing the learner memory. */
  readonly statement: string;
  /** How confidently the application should rely on this statement. */
  readonly confidence: UnitScore;
  /** ISO-8601 timestamp supplied by the caller that observed the update. */
  readonly updatedAt: string;
}

function assertCategory(name: 'category', value: LearnerMemoryCategory): void {
  if (!Object.values(LearnerMemoryCategory).includes(value)) {
    throw new Error('unsupported learner memory category');
  }
}

function assertStatement(name: 'statement', value: string): void {
  if (value.trim().length === 0) {
    throw new Error('memory statement must not be blank');
  }
}

function assertUnitScore(name: 'confidence', value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1`);
  }
}

/** Validate fields shared by extracted and stored learner memories. */
export function assertValidLearnerMemory(memory: LearnerMemory): void {
  assertCategory('category', memory.category);
  assertStatement('statement', memory.statement);
  assertUnitScore('confidence', memory.confidence);
}

/** Build one ID-free learner memory from its interface fields. */
export function buildLearnerMemory(
  category: LearnerMemoryCategory,
  statement: string,
  confidence: UnitScore,
  updatedAt: string,
): LearnerMemory {
  const memory = { category, statement, confidence, updatedAt };
  assertValidLearnerMemory(memory);

  return memory;
}
