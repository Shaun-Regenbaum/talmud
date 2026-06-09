import { describe, expect, it } from 'vitest';
import { keyForEnrichment, normalizeQualifier, qualifierHash } from '../src/worker/cache-keys';

const ENRICHMENT_LOCAL = {
  id: 'argument-move.qa',
  cache_version: '1',
  scope: 'local' as const,
};

const ENRICHMENT_GLOBAL = {
  id: 'rabbi.bio',
  cache_version: '4',
  scope: 'global' as const,
};

describe('keyForEnrichment qualifier dimension', () => {
  it('produces the legacy key shape when no qualifier is supplied', () => {
    const k = keyForEnrichment(ENRICHMENT_LOCAL, 'move_42', { tractate: 'Berakhot', page: '3b' });
    expect(k).toBe('enrich:argument-move.qa:1:move_42:berakhot:3b');
  });

  it('appends :q_<hash> when a qualifier is supplied (local scope)', async () => {
    const q = await qualifierHash('Why does the verse need to say from neshef to neshef?');
    const k = keyForEnrichment(
      ENRICHMENT_LOCAL,
      'move_42',
      { tractate: 'Berakhot', page: '3b' },
      q,
    );
    expect(k).toBe(`enrich:argument-move.qa:1:move_42:berakhot:3b:q_${q}`);
  });

  it('appends :q_<hash> for global-scope enrichments too', async () => {
    const q = await qualifierHash('Who taught Abaye?');
    const k = keyForEnrichment(ENRICHMENT_GLOBAL, 'abaye', undefined, q);
    expect(k).toBe(`enrich:rabbi.bio:4:abaye:q_${q}`);
  });

  it('same input twice yields the same key (deterministic)', async () => {
    const q1 = await qualifierHash('Same question.');
    const q2 = await qualifierHash('Same question.');
    expect(q1).toBe(q2);
    const k1 = keyForEnrichment(ENRICHMENT_LOCAL, 'm', { tractate: 't', page: 'p' }, q1);
    const k2 = keyForEnrichment(ENRICHMENT_LOCAL, 'm', { tractate: 't', page: 'p' }, q2);
    expect(k1).toBe(k2);
  });

  it('different questions yield different keys', async () => {
    const q1 = await qualifierHash('Why this?');
    const q2 = await qualifierHash('Why that?');
    expect(q1).not.toBe(q2);
    const k1 = keyForEnrichment(ENRICHMENT_LOCAL, 'm', { tractate: 't', page: 'p' }, q1);
    const k2 = keyForEnrichment(ENRICHMENT_LOCAL, 'm', { tractate: 't', page: 'p' }, q2);
    expect(k1).not.toBe(k2);
  });

  it('normalizes cosmetic whitespace + casing so equivalent questions share a key', async () => {
    const q1 = await qualifierHash('   Why DOES it work?  ');
    const q2 = await qualifierHash('why does it work?');
    expect(q1).toBe(q2);
    expect(normalizeQualifier('   Why DOES it work?  ')).toBe('why does it work?');
  });
});
