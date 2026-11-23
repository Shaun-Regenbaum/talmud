import { describe, expect, it } from 'vitest';
import {
  LearnerMemoryCategory,
  type LearnerMemory,
} from '../../src/learner-profile/learner-memory.ts';
import type { LearnerProfileMemory } from '../../src/learner-profile/learner-profile-memory.ts';
import {
  addLearnerProfileMemory,
  assertUniqueMemoryId,
  createLearnerProfile,
  getLearnerProfileMemories,
  getLearnerProfileMemoriesByCategory,
  getLearnerProfileMemoryById,
  removeLearnerProfileMemory,
  updateLearnerProfileMemory,
} from '../../src/learner-profile/learner-profile.ts';

const observedAt = '2026-09-22T12:00:00.000Z';

function knowledgeMemory(statement = 'Understands the structure of a sugya.'): LearnerMemory {
  return {
    category: LearnerMemoryCategory.Knowledge,
    statement,
    confidence: 0.8,
    updatedAt: observedAt,
  };
}

describe('createLearnerProfile', () => {
  it('creates an empty profile with default version, revision, and next ID', () => {
    expect(createLearnerProfile()).toEqual({
      schemaVersion: 1,
      revision: 0,
      nextMemoryId: 1,
      memories: [],
    });
  });

  it('accepts a custom version and revision without changing the first memory ID', () => {
    const profile = createLearnerProfile(2, 7);

    expect(profile.schemaVersion).toBe(2);
    expect(profile.revision).toBe(7);
    expect(addLearnerProfileMemory(profile, knowledgeMemory()).id).toBe('1');
    expect(profile.revision).toBe(8);
  });
});

describe('assertUniqueMemoryId', () => {
  it('accepts an ID not yet used by the profile', () => {
    const profile = createLearnerProfile();
    addLearnerProfileMemory(profile, knowledgeMemory());

    expect(() => assertUniqueMemoryId(profile, '2')).not.toThrow();
  });

  it('rejects an ID already used by the profile', () => {
    const profile = createLearnerProfile();
    addLearnerProfileMemory(profile, knowledgeMemory());

    expect(() => assertUniqueMemoryId(profile, '1')).toThrow(
      'learner profile memory ID "1" already exists',
    );
  });
});

describe('addLearnerProfileMemory', () => {
  it('stores the memory, assigns consecutive IDs, and advances revision', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(
      profile,
      knowledgeMemory('Recognizes common Aramaic terms.'),
    );

    expect(first).toEqual({ ...knowledgeMemory(), id: '1' });
    expect(second.id).toBe('2');
    expect(profile.memories).toEqual([first, second]);
    expect(profile.nextMemoryId).toBe(3);
    expect(profile.revision).toBe(2);
  });

  it('does not reuse an ID after a memory is removed', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    removeLearnerProfileMemory(profile, first.id);
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Knows the opening blessing.'));

    expect(second.id).toBe('2');
  });

  it.each([
    {
      field: 'category',
      change: { category: 'unknown' as LearnerMemoryCategory },
      error: 'unsupported learner memory category',
    },
    {
      field: 'statement',
      change: { statement: '  ' },
      error: 'memory statement must not be blank',
    },
    {
      field: 'confidence',
      change: { confidence: 1.1 },
      error: 'confidence must be a finite number between 0 and 1',
    },
    {
      field: 'non-finite confidence',
      change: { confidence: Number.NaN },
      error: 'confidence must be a finite number between 0 and 1',
    },
  ])('rejects an invalid $field without changing the profile', ({ change, error }) => {
    const profile = createLearnerProfile();

    expect(() => addLearnerProfileMemory(profile, { ...knowledgeMemory(), ...change })).toThrow(
      error,
    );
    expect(profile).toEqual(createLearnerProfile());
  });

  it('rejects a generated ID that is already present without changing the profile', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    profile.nextMemoryId = 1;

    expect(() => addLearnerProfileMemory(profile, knowledgeMemory('Understands Rashi.'))).toThrow(
      'learner profile memory ID "1" already exists',
    );
    expect(profile.memories).toEqual([first]);
    expect(profile.revision).toBe(1);
    expect(profile.nextMemoryId).toBe(1);
  });

  it('rejects an invalid generated ID without changing the profile', () => {
    const profile = createLearnerProfile();
    profile.nextMemoryId = -1;

    expect(() => addLearnerProfileMemory(profile, knowledgeMemory())).toThrow(
      'memory id must be a non-negative integer string',
    );
    expect(profile.memories).toEqual([]);
    expect(profile.revision).toBe(0);
    expect(profile.nextMemoryId).toBe(-1);
  });
});

describe('updateLearnerProfileMemory', () => {
  it('replaces the selected memory while preserving its ID and advancing revision', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Reads Rashi.'));
    const replacement = knowledgeMemory('Can identify the main argument.');

    const updated: LearnerProfileMemory | undefined = updateLearnerProfileMemory(
      profile,
      first.id,
      replacement,
    );
    expect(updated).toEqual({ ...replacement, id: first.id });
    expect(profile.memories).toEqual([{ ...replacement, id: first.id }, second]);
    expect(profile.nextMemoryId).toBe(3);
    expect(profile.revision).toBe(3);
  });

  it('returns undefined for a missing ID without changing the profile', () => {
    const profile = createLearnerProfile();

    expect(updateLearnerProfileMemory(profile, '99', knowledgeMemory())).toBeUndefined();
    expect(profile).toEqual(createLearnerProfile());
  });

  it.each([
    {
      field: 'category',
      change: { category: 'unknown' as LearnerMemoryCategory },
      error: 'unsupported learner memory category',
    },
    {
      field: 'statement',
      change: { statement: ' ' },
      error: 'memory statement must not be blank',
    },
    {
      field: 'confidence',
      change: { confidence: -0.1 },
      error: 'confidence must be a finite number between 0 and 1',
    },
  ])('rejects an invalid replacement $field without changing the profile', ({ change, error }) => {
    const profile = createLearnerProfile();
    const original = addLearnerProfileMemory(profile, knowledgeMemory());

    expect(() =>
      updateLearnerProfileMemory(profile, original.id, { ...knowledgeMemory(), ...change }),
    ).toThrow(error);
    expect(profile.memories).toEqual([original]);
    expect(profile.revision).toBe(1);
  });
});

describe('getLearnerProfileMemories', () => {
  it('returns all stored memories', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Reads Rashi.'));

    expect(getLearnerProfileMemories(profile)).toEqual([first, second]);
  });
});

describe('getLearnerProfileMemoriesByCategory', () => {
  it('returns memories matching the required category', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Reads Rashi.'));

    expect(getLearnerProfileMemoriesByCategory(profile, LearnerMemoryCategory.Knowledge)).toEqual([
      first,
      second,
    ]);
  });

  it('returns an empty list when no memories match', () => {
    expect(
      getLearnerProfileMemoriesByCategory(createLearnerProfile(), LearnerMemoryCategory.Knowledge),
    ).toEqual([]);
  });
});

describe('getLearnerProfileMemoryById', () => {
  it('finds the requested memory', () => {
    const profile = createLearnerProfile();
    addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Reads Rashi.'));

    expect(getLearnerProfileMemoryById(profile, second.id)).toEqual(second);
  });

  it('returns undefined for an unknown ID', () => {
    expect(getLearnerProfileMemoryById(createLearnerProfile(), '99')).toBeUndefined();
  });
});

describe('removeLearnerProfileMemory', () => {
  it('removes only the requested memory and advances revision', () => {
    const profile = createLearnerProfile();
    const first = addLearnerProfileMemory(profile, knowledgeMemory());
    const second = addLearnerProfileMemory(profile, knowledgeMemory('Reads Rashi.'));

    expect(removeLearnerProfileMemory(profile, first.id)).toBe(profile);
    expect(profile.memories).toEqual([second]);
    expect(profile.nextMemoryId).toBe(3);
    expect(profile.revision).toBe(3);
  });

  it('returns undefined for a missing ID without changing the profile', () => {
    const profile = createLearnerProfile();

    expect(removeLearnerProfileMemory(profile, '99')).toBeUndefined();
    expect(profile).toEqual(createLearnerProfile());
  });
});
