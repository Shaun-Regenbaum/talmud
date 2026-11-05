import { describe, expect, it } from 'vitest';
import { localDay, yomiRedirectUrl } from '../src/worker/yomi-redirect';

describe('localDay', () => {
  it('uses the visitor timezone', () => {
    const t = new Date('2026-11-05T23:30:00Z');
    expect(localDay(t, 'UTC')).toEqual({ year: 2026, month: 11, day: 5 });
    expect(localDay(t, 'Asia/Jerusalem')).toEqual({ year: 2026, month: 11, day: 6 });
  });
  it('falls back to UTC on a bad zone', () => {
    expect(localDay(new Date('2026-11-05T12:00:00Z'), 'Nope/Zone').day).toBe(5);
  });
});

describe('yomiRedirectUrl', () => {
  it('leaves a visit that already names a daf alone', async () => {
    expect(
      await yomiRedirectUrl(new Request('https://talmud.dev/?tractate=Shabbat&page=2a')),
    ).toBeNull();
    expect(await yomiRedirectUrl(new Request('https://talmud.dev/?page=5b'))).toBeNull();
  });
});
