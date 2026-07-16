/**
 * Non-sage "person" topics that ride along in the Sefaria-derived registry —
 * kabbalistic concepts (Partzuf, Sefira, …), liturgical texts (Hallel), and
 * biblical figures whose bare Hebrew collides with a sage's name (Mordechai;
 * Hallel's הלל collides with Hillel in the standalone-name allowlist, which is
 * how a liturgical text ended up in the #sages browser AND made bare "Hillel"
 * a fake homonym for the resolver).
 *
 * One predicate, used by BOTH the sages index (what the browser shows) and the
 * resolver's candidate index (who a daf name can denote).
 */

const NON_SAGE_SLUGS = new Set([
  'hallel',
  'mordekhai',
  'mordechai1',
  'blessings',
  'blessings-(halakhah)',
]);

export function isNonSageTopic(slug: string, canonicalHe?: string | null): boolean {
  return NON_SAGE_SLUGS.has(slug) || (canonicalHe ?? '').includes('קבלה');
}
