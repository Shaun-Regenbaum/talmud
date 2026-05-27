import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';

// Cache keys are derived from (id, cache_version) — see src/worker/cache-keys.ts.
// The Phase C generation-factory refactor (makeLeaf / makeSynthesis) must emit
// the exact same enrichments with the exact same cache_version, or it silently
// invalidates every cached enrichment. This snapshot is that guard: it locks the
// id@cache_version set across the whole catalog. If the refactor changes it, the
// diff is the blast radius — review it deliberately, don't just `-u`.
describe('CODE_ENRICHMENTS cache identity', () => {
  it('id@cache_version set is stable', () => {
    const pairs = CODE_ENRICHMENTS.map((e) => `${e.id}@${e.cache_version}`).sort();
    expect(pairs).toMatchSnapshot();
  });

  it('every enrichment has a non-empty id and cache_version', () => {
    for (const e of CODE_ENRICHMENTS) {
      expect(e.id, 'id').toBeTruthy();
      expect(e.cache_version, `cache_version for ${e.id}`).toBeTruthy();
    }
  });
});
