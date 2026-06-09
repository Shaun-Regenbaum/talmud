import { describe, expect, it } from 'vitest';
import { loadNotice, type PrefetchProgress } from '../src/client/dafPrefetch';

const base: PrefetchProgress = {
  dafKey: 'Shabbat:126a',
  total: 10,
  done: 0,
  currentLabel: null,
  paused: false,
  failed: 0,
};

describe('loadNotice — daf-load bar notice', () => {
  it('returns null when nothing is wrong', () => {
    expect(loadNotice(base)).toBeNull();
  });

  it('surfaces a pause the moment any task is budget-paused (takes precedence over failures)', () => {
    expect(loadNotice({ ...base, paused: true })).toBe('paused');
    expect(loadNotice({ ...base, paused: true, failed: 9 })).toBe('paused');
  });

  it('stays quiet on one or two transient failures, then flags a systemic failure', () => {
    expect(loadNotice({ ...base, failed: 1 })).toBeNull();
    expect(loadNotice({ ...base, failed: 2 })).toBeNull();
    expect(loadNotice({ ...base, failed: 3 })).toBe('failed');
  });
});
