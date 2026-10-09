import { describe, expect, it, vi } from 'vitest';
import { keyForRabbiEnriched } from '../src/worker/cache-keys';
import { readEnrichedForPerson } from '../src/worker/routes/rabbi-admin';
import saved from './fixtures/merged-sage-biographies.json';

// Records captured from the public production biography endpoint.
function cacheWith(records: Record<string, unknown>) {
  const get = vi.fn(async (key: string) => (records[key] ? JSON.stringify(records[key]) : null));
  const put = vi.fn();
  return { cache: { get, put } as unknown as KVNamespace, get, put };
}

describe('biographies stored under reviewed duplicate IDs', () => {
  it('serves the existing Shimon biography through either person ID without writing it', async () => {
    const old = 'rabbi-shimon-bar-abba';
    const canonical = 'rabbi-shimon-b-abba';
    const { cache, put } = cacheWith({ [keyForRabbiEnriched(old)]: saved[old] });
    const result = await readEnrichedForPerson(cache, canonical);
    expect(result).toEqual({
      sourceSlug: old,
      record: { ...saved[old], slug: canonical, generation: null },
    });
    expect(await readEnrichedForPerson(cache, old)).toEqual(result);
    expect(put).not.toHaveBeenCalled();
  });
  it('returns the retained record before looking under an old ID', async () => {
    const canonical = 'rabbi-shimon-b-lakish';
    const { cache, get, put } = cacheWith({ [keyForRabbiEnriched(canonical)]: saved[canonical] });
    expect(await readEnrichedForPerson(cache, 'rabbi-shimon-b-lakish-2')).toEqual({
      sourceSlug: canonical,
      record: saved[canonical],
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });
});
