import { describe, expect, it } from 'vitest';
import { reviewedEraShape } from '../src/worker/reviewed-rabbi';
import saved from './fixtures/reviewed-kahana-era.json';

const era = saved.sourceProfile.era;

describe('reviewed era validation', () => {
  it('preserves the saved Kahana period and its source', () => {
    expect(reviewedEraShape.parse(era)).toEqual(era);
  });

  it.each([
    { start: era.end },
    { end: era.start - 1 },
    { start: 200.5 },
    { end: Number.POSITIVE_INFINITY },
    { label: ' ' },
    { labelHe: '' },
    { source: { ...era.source, title: ' ' } },
    { source: { ...era.source, url: 'http://www.jewishencyclopedia.com/articles/3896' } },
    { source: { ...era.source, url: 'https://' } },
  ])('rejects a corrupted saved era: %j', (corruption) => {
    expect(reviewedEraShape.safeParse({ ...era, ...corruption }).success).toBe(false);
  });
});
