import { describe, expect, it } from 'vitest';
import { costPausedProducerId, parsePausedProducers } from '../src/worker/index';

// Cost control: the PAUSED_PRODUCERS env var holds back a configured set of
// expensive producers on cold reader loads (the /api/run gate returns the shared
// AI-paused banner envelope; the queue consumer skips background warms). This
// pins the parsing + match semantics so the gate can't silently drift.
describe('PAUSED_PRODUCERS — cost-control producer pause', () => {
  const env = {
    PAUSED_PRODUCERS: 'tidbit.essay, daf-background.concepts ,rishonim.synthesis',
  };

  it('parses a comma/space-separated list, trimming blanks', () => {
    expect(parsePausedProducers(env)).toEqual(
      new Set(['tidbit.essay', 'daf-background.concepts', 'rishonim.synthesis']),
    );
  });

  it('matches a paused enrichment id', () => {
    expect(costPausedProducerId(env, { enrichment_id: 'tidbit.essay' })).toBe('tidbit.essay');
    expect(costPausedProducerId(env, { enrichment_id: 'daf-background.concepts' })).toBe(
      'daf-background.concepts',
    );
  });

  it('prefers enrichment_id over mark_id', () => {
    expect(
      costPausedProducerId(env, { mark_id: 'rabbi', enrichment_id: 'rishonim.synthesis' }),
    ).toBe('rishonim.synthesis');
  });

  it('returns null for a producer not in the list', () => {
    expect(costPausedProducerId(env, { enrichment_id: 'argument.synthesis' })).toBeNull();
    expect(costPausedProducerId(env, { mark_id: 'rabbi' })).toBeNull();
  });

  it('returns null / empty when nothing is configured (default = full generation)', () => {
    expect(parsePausedProducers({}).size).toBe(0);
    expect(parsePausedProducers({ PAUSED_PRODUCERS: '' }).size).toBe(0);
    expect(costPausedProducerId({}, { enrichment_id: 'tidbit.essay' })).toBeNull();
  });
});
