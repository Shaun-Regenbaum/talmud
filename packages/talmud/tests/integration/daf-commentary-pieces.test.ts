import { describe, it, expect } from 'vitest';
import { BASE_URL, getJson } from './helpers';

/**
 * /api/daf Rashi/Tosafot piece count regression guard.
 *
 * Sefaria's v1 `/api/texts/` endpoint silently flattens Talmud commentary
 * (stored as `string[][]`, one inner array per gemara segment) to just the
 * first segment — typically 2 pieces out of dozens. The renderer's
 * `wrapPieces` then drops the rest of the Rashi/Tosafot column when pieces
 * is non-empty, so a regression to v1 manifests as wholesale missing
 * commentary text (the bug that originally surfaced on Chullin 21a).
 *
 * These tests hit the live worker and assert that pieces counts on a few
 * known-busy dafim are well above the v1-truncated 2 — they will fail loud
 * if anything in the fetch path regresses to v1's flattening behavior.
 */
interface DafResponse {
  rashi?: { hebrew: string; pieces?: string[] };
  tosafot?: { hebrew: string; pieces?: string[] };
}

describe(`integration: /api/daf commentary pieces (against ${BASE_URL})`, () => {
  // Sample dafim chosen for having many Rashi/Tosafot lemmas. The original
  // regression was caught on Chullin 21a — kept here as the canonical case.
  // Berakhot 2a and Shabbat 2a are high-traffic openings with dense
  // commentary, so they're sensitive to upstream Sefaria shape changes.
  const cases: Array<{ tractate: string; page: string; minRashi: number; minTosafot: number }> = [
    { tractate: 'Chullin',  page: '21a', minRashi: 10, minTosafot: 3 },
    { tractate: 'Berakhot', page: '2a',  minRashi: 10, minTosafot: 3 },
    { tractate: 'Shabbat',  page: '2a',  minRashi: 10, minTosafot: 3 },
  ];

  for (const { tractate, page, minRashi, minTosafot } of cases) {
    it(`returns at least ${minRashi} Rashi / ${minTosafot} Tosafot pieces for ${tractate} ${page}`, async () => {
      const data = await getJson<DafResponse>(
        `/api/daf/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
      );

      // The bug shape: 0-2 pieces with full-length `hebrew` from HebrewBooks.
      // We check both fields so a regression that swaps from "missing
      // pieces" to "missing hebrew" still trips.
      expect(data.rashi, 'rashi block should be present').toBeDefined();
      expect(data.tosafot, 'tosafot block should be present').toBeDefined();

      const rashiPieces = data.rashi?.pieces ?? [];
      const tosafotPieces = data.tosafot?.pieces ?? [];

      expect(
        rashiPieces.length,
        `Rashi piece count on ${tractate} ${page} — v1 truncation would give ≤2`,
      ).toBeGreaterThanOrEqual(minRashi);
      expect(
        tosafotPieces.length,
        `Tosafot piece count on ${tractate} ${page} — v1 truncation would give ≤1`,
      ).toBeGreaterThanOrEqual(minTosafot);

      // Sanity: no piece is empty (flattenPieces filters them).
      expect(rashiPieces.every((p) => p.length > 0)).toBe(true);
      expect(tosafotPieces.every((p) => p.length > 0)).toBe(true);
    });
  }
});
