import { describe, expect, it } from 'vitest';
import {
  addLearnerProfileClaim,
  createLearnerProfile,
  getLearnerProfileClaims,
  removeLearnerProfileClaim,
  updateLearnerProfileClaim,
} from '../src/learner-profile/profile.ts';

describe('createLearnerProfile', () => {
  it('creates an empty, versioned profile', () => {
    expect(createLearnerProfile()).toEqual({
      schemaVersion: 1,
      revision: 0,
      facets: {},
    });
  });
});

describe('addLearnerProfileClaim', () => {
  it('keeps multiple independent claims in the same facet category', () => {
    const withHalacha = addLearnerProfileClaim(createLearnerProfile(), {
      id: 'knowledge-halacha',
      kind: 'knowledge',
      statement: 'Has a solid understanding of practical Halacha.',
      confidence: 0.9,
      importance: 0.8,
      updatedAt: '2026-09-17T14:30:00.000Z',
    });

    const profile = addLearnerProfileClaim(withHalacha, {
      id: 'knowledge-aramaic',
      kind: 'knowledge',
      statement: 'Struggles to read unfamiliar Aramaic passages.',
      confidence: 0.85,
      importance: 0.9,
      updatedAt: '2026-09-17T14:32:00.000Z',
    });

    expect(profile).toEqual({
      schemaVersion: 1,
      revision: 2,
      facets: {
        knowledge: [
          {
            id: 'knowledge-halacha',
            kind: 'knowledge',
            statement: 'Has a solid understanding of practical Halacha.',
            confidence: 0.9,
            importance: 0.8,
            updatedAt: '2026-09-17T14:30:00.000Z',
          },
          {
            id: 'knowledge-aramaic',
            kind: 'knowledge',
            statement: 'Struggles to read unfamiliar Aramaic passages.',
            confidence: 0.85,
            importance: 0.9,
            updatedAt: '2026-09-17T14:32:00.000Z',
          },
        ],
      },
    });
    expect(withHalacha.facets.knowledge).toHaveLength(1);
  });

  it('rejects a duplicate claim ID within the same facet category', () => {
    const profile = addLearnerProfileClaim(createLearnerProfile(), {
      id: 'knowledge-halacha',
      kind: 'knowledge',
      statement: 'Understands practical Halacha.',
      confidence: 0.9,
      importance: 0.8,
      updatedAt: '2026-09-17T14:30:00.000Z',
    });

    expect(() =>
      addLearnerProfileClaim(profile, {
        id: 'knowledge-halacha',
        kind: 'knowledge',
        statement: 'Understands practical Halacha well.',
        confidence: 0.95,
        importance: 0.8,
        updatedAt: '2026-09-17T14:40:00.000Z',
      }),
    ).toThrowError('knowledge claim "knowledge-halacha" already exists');
  });

  it('rejects a blank claim ID', () => {
    expect(() =>
      addLearnerProfileClaim(createLearnerProfile(), {
        id: '   ',
        kind: 'knowledge',
        statement: 'Understands practical Halacha.',
        confidence: 0.9,
        importance: 0.8,
        updatedAt: '2026-09-17T14:30:00.000Z',
      }),
    ).toThrowError('claim id must not be blank');
  });

  it.each([
    ['confidence', 1.01, 0.5],
    ['importance', 0.8, Number.NaN],
  ] as const)('rejects an invalid %s score', (score, confidence, importance) => {
    expect(() =>
      addLearnerProfileClaim(createLearnerProfile(), {
        id: `invalid-${score}`,
        kind: 'knowledge',
        statement: 'A claim with an invalid score.',
        confidence,
        importance,
        updatedAt: '2026-09-17T14:45:00.000Z',
      }),
    ).toThrowError(`${score} must be a finite number between 0 and 1`);
  });

  it('stores a snapshot instead of retaining the caller-owned claim object', () => {
    const claim = {
      id: 'knowledge-aramaic',
      kind: 'knowledge' as const,
      statement: 'Struggles with Aramaic.',
      confidence: 0.8,
      importance: 0.9,
      updatedAt: '2026-09-17T14:32:00.000Z',
    };
    const profile = addLearnerProfileClaim(createLearnerProfile(), claim);

    claim.statement = 'Has mastered Aramaic.';

    expect(profile.facets.knowledge?.[0]?.statement).toBe('Struggles with Aramaic.');
  });
});

describe('updateLearnerProfileClaim', () => {
  it('replaces only the matching claim and increments the revision', () => {
    const original = addLearnerProfileClaim(createLearnerProfile(), {
      id: 'knowledge-aramaic',
      kind: 'knowledge',
      statement: 'Struggles with Aramaic.',
      confidence: 0.8,
      importance: 0.9,
      updatedAt: '2026-09-17T14:32:00.000Z',
    });

    const updated = updateLearnerProfileClaim(original, {
      id: 'knowledge-aramaic',
      kind: 'knowledge',
      statement: 'Can read common Aramaic vocabulary but struggles with unfamiliar passages.',
      confidence: 0.9,
      importance: 0.9,
      updatedAt: '2026-09-18T10:00:00.000Z',
    });

    expect(updated.revision).toBe(2);
    expect(updated.facets.knowledge?.[0]?.statement).toBe(
      'Can read common Aramaic vocabulary but struggles with unfamiliar passages.',
    );
    expect(original.facets.knowledge?.[0]?.statement).toBe('Struggles with Aramaic.');
  });

  it('rejects an update when the claim ID does not exist', () => {
    expect(() =>
      updateLearnerProfileClaim(createLearnerProfile(), {
        id: 'knowledge-missing',
        kind: 'knowledge',
        statement: 'A claim that was never added.',
        confidence: 0.8,
        importance: 0.5,
        updatedAt: '2026-09-18T10:00:00.000Z',
      }),
    ).toThrowError('knowledge claim "knowledge-missing" does not exist');
  });
});

describe('getLearnerProfileClaims', () => {
  it('returns the requested category or an empty list when it is absent', () => {
    const profile = addLearnerProfileClaim(createLearnerProfile(), {
      id: 'interest-history',
      kind: 'interests',
      statement: 'Is interested in Jewish history.',
      confidence: 1,
      importance: 0.7,
      updatedAt: '2026-09-17T14:35:00.000Z',
    });

    expect(getLearnerProfileClaims(profile, 'interests')).toEqual(profile.facets.interests);
    expect(getLearnerProfileClaims(profile, 'knowledge')).toEqual([]);
  });
});

describe('removeLearnerProfileClaim', () => {
  it('removes only the identified claim and increments the revision', () => {
    const withHalacha = addLearnerProfileClaim(createLearnerProfile(), {
      id: 'knowledge-halacha',
      kind: 'knowledge',
      statement: 'Understands practical Halacha.',
      confidence: 0.9,
      importance: 0.8,
      updatedAt: '2026-09-17T14:30:00.000Z',
    });
    const original = addLearnerProfileClaim(withHalacha, {
      id: 'knowledge-aramaic',
      kind: 'knowledge',
      statement: 'Struggles with unfamiliar Aramaic passages.',
      confidence: 0.85,
      importance: 0.9,
      updatedAt: '2026-09-17T14:32:00.000Z',
    });

    const updated = removeLearnerProfileClaim(original, 'knowledge', 'knowledge-halacha');

    expect(updated.revision).toBe(3);
    expect(updated.facets.knowledge?.map((claim) => claim.id)).toEqual(['knowledge-aramaic']);
    expect(original.facets.knowledge).toHaveLength(2);
  });

  it('is an idempotent no-op when the claim ID is absent', () => {
    const original = createLearnerProfile();

    expect(removeLearnerProfileClaim(original, 'knowledge', 'knowledge-missing')).toBe(original);
  });
});
