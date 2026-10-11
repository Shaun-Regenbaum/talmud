import { assertValidLearnerMemory, LearnerMemoryCategory, type LearnerMemory } from './learner-memory.ts';
import {
  buildLearnerProfileMemory,
  type LearnerProfileMemory,
} from './learner-profile-memory.ts';

/**
 * A serializable collection of the learner's memories.
 *
 * @example
 * ```ts
 * const profile: LearnerProfile = {
 *   schemaVersion: 1,
 *   revision: 1,
 *   nextMemoryId: 2,
 *   memories: [{
 *     id: '1',
 *     category: 'knowledge',
 *     statement: 'Understands the basic structure of a sugya.',
 *     confidence: 0.85,
 *     updatedAt: '2026-09-22T12:00:00.000Z',
 *   }],
 * };
 * ```
 */
export interface LearnerProfile {
  schemaVersion: number;
  /** Increases whenever a memory is added, changed, or removed. */
  revision: number;
  /** Next profile-owned ID sequence; advances only when a memory is added. */
  nextMemoryId: number;
  /** Stored memories share one list; each memory carries its own category. */
  memories: LearnerProfileMemory[];
}

/** Throw if a proposed memory ID is already present in this profile. */
export function assertUniqueMemoryId(profile: LearnerProfile, id: string): void {
  if (profile.memories.some((entry) => entry.id === id)) {
    throw new Error(`learner profile memory ID "${id}" already exists`);
  }
}

/** Create an empty profile with optional version and revision values. */
export function createLearnerProfile(schemaVersion = 1, revision = 0): LearnerProfile {
  return { schemaVersion, revision, nextMemoryId: 1, memories: [] };
}

/** Add a memory to the profile and return its stored form. */
export function addLearnerProfileMemory(
  profile: LearnerProfile,
  memory: LearnerMemory,
): LearnerProfileMemory {
  assertValidLearnerMemory(memory);

  const id = `${profile.nextMemoryId}`;
  assertUniqueMemoryId(profile, id);

  const storedMemory = buildLearnerProfileMemory(memory, id);
  profile.memories = [...profile.memories, storedMemory];
  profile.nextMemoryId += 1;
  profile.revision += 1;

  return storedMemory;
}

/** Update one stored memory by ID and return it, preserving its ID. */
export function updateLearnerProfileMemory(
  profile: LearnerProfile,
  id: string,
  memory: LearnerMemory,
): LearnerProfileMemory | undefined {
  if (!getLearnerProfileMemoryById(profile, id)) {
    return undefined;
  }

  const storedMemory = buildLearnerProfileMemory(memory, id);
  profile.memories = profile.memories.map((entry) =>
    entry.id === id ? storedMemory : entry,
  );
  profile.revision += 1;

  return storedMemory;
}

/** Read all stored memories. */
export function getLearnerProfileMemories(profile: LearnerProfile): readonly LearnerProfileMemory[] {
  return profile.memories;
}

/** Read stored memories in one category. */
export function getLearnerProfileMemoriesByCategory(
  profile: LearnerProfile,
  category: LearnerMemoryCategory,
): readonly LearnerProfileMemory[] {
  return profile.memories.filter((memory) => memory.category === category);
}

/** Get one stored memory by its profile-assigned ID. */
export function getLearnerProfileMemoryById(
  profile: LearnerProfile,
  id: string,
): LearnerProfileMemory | undefined {
  const index = profile.memories.findIndex((entry) => entry.id === id);

  return index < 0 ? undefined : profile.memories[index];
}

/** Remove one stored memory by ID. */
export function removeLearnerProfileMemory(profile: LearnerProfile, id: string): LearnerProfile | undefined {
  if (!getLearnerProfileMemoryById(profile, id)) return undefined;

  profile.memories = profile.memories.filter((memory) => memory.id !== id);
  profile.revision += 1;

  return profile;
}
