import { describe, expect, it } from 'vitest';
import { MAX_EXAMPLES, summarizeSageLinks } from '../src/lib/sage-graph/sage-links';
import fixture from './fixtures/sage-links-abaye-real.json';

// The fixture is every confirmed link of Abaye in the production store on 3 Nov 2026 (real rows).
const rows = fixture.rows;

describe('summarizeSageLinks', () => {
  const links = summarizeSageLinks('abaye', rows);

  it('counts each passage once per partner and relation', () => {
    const total = links.reduce((sum, l) => sum + l.passages, 0);
    const unique = new Set(rows.map((r) => `${r.ref}|${r.s}|${r.o}|${r.relation}`)).size;
    expect(total).toBe(unique);
  });

  it('puts the most-evidenced link first and keeps the direction', () => {
    expect(links[0].passages).toBeGreaterThanOrEqual(links[1].passages);
    const asksRava = links.find((l) => l.partner === 'rava' && l.relation === 'asks');
    const answeredByRava = links.find((l) => l.partner === 'rava' && l.relation === 'answers');
    expect(asksRava?.role).toBe('subject');
    expect(answeredByRava?.role).toBe('object');
  });

  it('shows a disagreement once, whichever side it was read from', () => {
    const opposes = links.filter((l) => l.relation === 'opposes');
    const partners = opposes.map((l) => l.partner);
    expect(new Set(partners).size).toBe(partners.length);
    for (const l of opposes) expect(l.role).toBe('both');
  });

  it('keeps a few quoted examples, each with a passage', () => {
    for (const l of links) {
      expect(l.examples.length).toBeLessThanOrEqual(MAX_EXAMPLES);
      for (const e of l.examples) expect(e.ref).toMatch(/\d+[ab]/);
    }
  });

  it('ignores rows that are not about this sage', () => {
    expect(summarizeSageLinks('nobody-here', rows)).toEqual([]);
  });
});
