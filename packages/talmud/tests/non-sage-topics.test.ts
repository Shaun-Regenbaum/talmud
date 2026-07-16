import { describe, expect, it } from 'vitest';
import { isNonSageTopic } from '../src/lib/nonSageTopics';
import { rabbiCandidates, resolveRabbiSlug } from '../src/worker/rabbi-graph';

describe('isNonSageTopic', () => {
  it('flags liturgy, kabbalah concepts, and biblical name-colliders', () => {
    expect(isNonSageTopic('hallel', 'הַלֵּל')).toBe(true);
    expect(isNonSageTopic('partzuf', 'פַּרְצוּף (קבלה)')).toBe(true);
    expect(isNonSageTopic('mordekhai', 'מרדכי')).toBe(true);
    expect(isNonSageTopic('hillel', 'הלל')).toBe(false);
    expect(isNonSageTopic('rava', 'רבא')).toBe(false);
  });
});

describe('resolver excludes non-sage topics', () => {
  it('bare Hillel is UNIQUE again — the liturgical Hallel no longer makes it a fake homonym', () => {
    const cands = rabbiCandidates('Hillel', 'הלל');
    expect(cands).toEqual(['hillel']);
    expect(resolveRabbiSlug('Hillel', 'הלל')).toEqual({ slug: 'hillel', basis: 'unique' });
  });

  it('a non-sage topic never resolves from a daf name', () => {
    // DELIBERATE: names reach the resolver only after the AI asserted them as
    // a PERSON, and a person written הלל is Hillel — the transliteration
    // "Hallel" identifies with the sage, not with the (excluded) liturgy topic.
    expect(rabbiCandidates('Hallel', 'הַלֵּל')).toEqual(['hillel']);
    expect(rabbiCandidates('Partzuf')).toEqual([]);
  });
});
