// Rabbi static dataset (rabbi-places.json) + the name/Hebrew -> entry resolver.
// Neutral module: RABBI_PLACES and the resolvers are used across index.ts (the
// rabbi routes, the rabbi mark path, and the daf payload), so they live here to
// avoid cycling through the entry file. Pure data + pure functions — no Bindings,
// no run engine. This is the foundation the rabbi identity/enrichment layer sits on.

import rabbiPlacesData from '../lib/data/rabbi-places.json';

export type Movement = 'bavel->israel' | 'israel->bavel' | 'both' | null;

export interface RabbiPlacesEntry {
  canonical: string;
  canonicalHe?: string | null;
  aliases: string[];
  places: string[];
  region: 'israel' | 'bavel' | null;
  numSources?: number | null;
  generation?: string | null;
  moved?: Movement;
  bio?: string | null;
  bioSource?: 'sefaria' | 'wikipedia' | null;
  image?: string | null;
  wiki?: string | null;
  /** Set on entries NOT from the Sefaria scrape — e.g. AI-researched additions
   *  for sages missing from Sefaria's PersonTopic export. Audit trail; also lets
   *  a future build-rabbi-places.py regen know which entries to re-merge. */
  provenance?: string | null;
}

export interface RabbiPlacesFile {
  generatedAt: string;
  source: string;
  cityRegions: Record<string, 'israel' | 'bavel'>;
  rabbis: Record<string, RabbiPlacesEntry>;
  aliasIndex: Record<string, string>;
}

export const RABBI_PLACES = rabbiPlacesData as unknown as RabbiPlacesFile;

export interface RabbiResolution {
  slug: string;
  entry: RabbiPlacesEntry;
}

// Normalize a Hebrew name for resolver indexing/lookup: strip nikkud +
// cantillation, drop parenthetical disambiguators (`רב (שם אמורא)` ->
// `רב`), strip punctuation, collapse whitespace.
function normalizeHeForResolve(s: string): string {
  return (
    s
      .replace(/[֑-ׇ]/g, '')
      .replace(/\([^)]*\)/g, ' ') // remove parenthetical groups entirely
      .replace(/\[[^\]]*\]/g, ' ') // same for square-bracket groups
      // Geresh title shorthand: the daf/mark emits "ר' חייא" but the dataset stores
      // the full "רבי חייא", so the apostrophe form must expand to רבי BEFORE the
      // punctuation strip below (which would otherwise leave a bare "ר" token that
      // never matches). Parity with rabbi-graph's normalizeHeName — the two Hebrew
      // resolvers had drifted, leaving the production path (resolveRabbi -> the
      // unknown-rabbi backlog) missing every "ר' X" that the graph path resolved.
      // Anchored at start. Applied to BOTH sides (query + the BY_CANONICAL_HE
      // build): all but one dataset canonicalHe are full forms (no-op); the lone
      // geresh entry, רַ' אבהו, folds to רבי אבהו with no collision, so both ר' אבהו
      // and רבי אבהו now resolve to rabbi-abahu. Unambiguous: ר' conventionally
      // abbreviates רבי (Rav is spelled out רב). Gershayim pairs (ר"מ / ר"נ) stay
      // out — they need context, handled by the upstream expandAbbreviations layer.
      .replace(/^ר['׳]\s+/, 'רבי ')
      .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// Precomputed: normalized canonicalHe -> slug. Used to resolve from the Hebrew
// form in the daf text, which is more reliable than the model's English
// rendering (Gemma occasionally emits "Rabbah" for Hebrew רבא = Rava).
const BY_CANONICAL_HE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [slug, r] of Object.entries(RABBI_PLACES.rabbis)) {
    if (!r.canonicalHe) continue;
    const key = normalizeHeForResolve(r.canonicalHe);
    if (key && !out[key]) out[key] = slug;
  }
  return out;
})();

export function resolveRabbiByHe(rawHe: string): RabbiResolution | null {
  if (!rawHe) return null;
  const key = normalizeHeForResolve(rawHe);
  if (!key) return null;
  const slug = BY_CANONICAL_HE[key];
  if (slug) {
    const entry = RABBI_PLACES.rabbis[slug];
    if (entry) return { slug, entry };
  }
  return null;
}

export function resolveRabbiByName(raw: string): RabbiResolution | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  const direct = RABBI_PLACES.aliasIndex[key];
  if (direct) {
    const entry = RABBI_PLACES.rabbis[direct];
    if (entry) return { slug: direct, entry };
  }
  // Patronymic fallback ("Rabbi Eliezer b. Yose" -> "Rabbi Eliezer"). Risky
  // for names like "Rabbah b. Rav Huna" that reduce to bare "Rabbah" (which
  // the aliasIndex points at a DIFFERENT rabbi). Gate on: the stripped form
  // must not start with a bare single-word title whose aliasIndex target
  // canonical differs meaningfully from the input. In practice we accept the
  // fallback ONLY when the stripped key has > 1 token after the title (e.g.
  // "Rabbi Eliezer" — two tokens — is OK; bare "Rabbah" is not).
  const stripped = key
    .replace(/\s+\b(b\.|ben|bar)\s+.+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped !== key) {
    const tokens = stripped.split(' ');
    const isBareTitle = tokens.length < 2;
    if (!isBareTitle) {
      const s = RABBI_PLACES.aliasIndex[stripped];
      if (s) {
        const entry = RABBI_PLACES.rabbis[s];
        if (entry) return { slug: s, entry };
      }
    }
  }
  return null;
}

/**
 * Resolve a rabbi mention to a dataset entry. Hebrew form (if provided) is
 * authoritative — it comes verbatim from the daf text. English is consulted
 * only when Hebrew gives no match.
 */
export function resolveRabbi(name: string, nameHe?: string | null): RabbiResolution | null {
  if (nameHe) {
    const he = resolveRabbiByHe(nameHe);
    if (he) return he;
  }
  return resolveRabbiByName(name);
}
