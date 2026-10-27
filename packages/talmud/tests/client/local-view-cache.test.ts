import { describe, expect, it } from 'vitest';
import { keysToPrune } from '../../src/client/localViewCache';

describe('keysToPrune', () => {
  it('keeps everything when under the limit', () => {
    expect(keysToPrune([{ key: 'a', savedAt: 1 }], 3)).toEqual([]);
  });
  it('drops the oldest rows first', () => {
    const rows = [
      { key: 'old', savedAt: 1 },
      { key: 'new', savedAt: 9 },
      { key: 'mid', savedAt: 5 },
    ];
    expect(keysToPrune(rows, 2)).toEqual(['old']);
  });
});
