import { describe, expect, it } from 'vitest';
import rabbiPlaces from '../src/lib/data/rabbi-places.json';
import type { EntityPiece } from '../src/lib/registry/entity';

// Guards the assumption GET /api/entity/rabbi/:slug relies on: rabbis is
// slug-keyed, each entry carries a canonical name (used to read the per-name
// global enrichment cache keys).
describe('entity piece — rabbi slug resolution', () => {
  const data = rabbiPlaces as unknown as {
    rabbis: Record<string, { canonical: string; canonicalHe?: string | null }>;
  };

  it('rabbis is a non-empty slug → entry map with canonical names', () => {
    const slugs = Object.keys(data.rabbis);
    expect(slugs.length).toBeGreaterThan(100);
    for (const slug of slugs.slice(0, 50)) {
      expect(typeof data.rabbis[slug].canonical).toBe('string');
      expect(data.rabbis[slug].canonical.length).toBeGreaterThan(0);
    }
  });

  it('a known slug resolves to its canonical name (the endpoint key path)', () => {
    const entry = data.rabbis['rabbi-yochanan-b-napacha'];
    expect(entry).toBeDefined();
    expect(entry.canonical).toContain('Yochanan');
    // The EntityPiece the endpoint would build for it.
    const piece: EntityPiece = {
      type: 'rabbi',
      id: 'rabbi-yochanan-b-napacha',
      name: entry.canonical,
      nameHe: entry.canonicalHe ?? undefined,
      pieces: { identity: null, relationships: null, geography: null },
    };
    expect(piece.type).toBe('rabbi');
    expect(piece.id).toBe('rabbi-yochanan-b-napacha');
    expect(Object.keys(piece.pieces)).toEqual(['identity', 'relationships', 'geography']);
  });
});
