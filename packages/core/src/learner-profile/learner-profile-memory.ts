import { assertValidLearnerMemory, type LearnerMemory } from './learner-memory.ts';

/** A memory stored in a learner profile, with an application-assigned ID.
 *
 * @example
 * ```ts
 * import { LearnerMemoryCategory } from './learner-memory.ts';
 *
 * const memory: LearnerProfileMemory = {
 *   id: '1',
 *   category: 'knowledge',
 *   statement: 'Understands the basic structure of a sugya.',
 *   confidence: 0.85,
 *   updatedAt: '2026-09-22T12:00:00.000Z',
 * };
 * ```
 */
export interface LearnerProfileMemory extends LearnerMemory {
  readonly id: string;
}

/** Validate a canonical decimal ID for a non-negative integer. */
export function assertValidMemoryId(id: string): void {
  if (typeof id !== 'string' || !/^(0|[1-9][0-9]*)$/.test(id)) {
    throw new Error('memory id must be a non-negative integer string');
  }
}

/** Validate a stored profile memory, including its application-assigned ID. */
export function assertValidLearnerProfileMemory(memory: LearnerProfileMemory): void {
  assertValidMemoryId(memory.id);
  assertValidLearnerMemory(memory);
}

/** Build a stored memory using an ID assigned by the containing profile. */
export function buildLearnerProfileMemory(
  memory: LearnerMemory,
  id: string,
): LearnerProfileMemory {
  const storedMemory = { ...memory, id };
  assertValidLearnerProfileMemory(storedMemory);

  return storedMemory;
}
