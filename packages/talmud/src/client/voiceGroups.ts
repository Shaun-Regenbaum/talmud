/**
 * Collective / anonymous voices that show up in argument prose but aren't
 * individual rabbis with biographical entries — "Sages", "Tanna Kamma",
 * "Stam", etc. The sidebar renders them through the same rabbi-card path
 * by synthesizing a minimal IdentifiedRabbi with a static descriptive bio.
 *
 * Keys are normalized (lowercase, honorific-stripped) so lookups stay
 * tolerant of LLM phrasing variants.
 */
import type { IdentifiedRabbi } from './dafContext';

export interface VoiceGroup {
  name: string;
  nameHe: string;
  bio: string;
}

export const VOICE_GROUPS: Record<string, VoiceGroup> = {
  sages: {
    name: 'The Sages (Chakhamim)',
    nameHe: 'חכמים',
    bio: "The collective rabbinic majority. In Mishnaic disputes, the Sages (חכמים) typically denote the position that disagrees with the named Tanna; halacha usually follows them unless the dispute is explicitly settled otherwise. The label refers to no single person — it's the consensus voice of the tannaitic generation in question.",
  },
  chakhamim: {
    name: 'The Sages (Chakhamim)',
    nameHe: 'חכמים',
    bio: 'The collective rabbinic majority. In Mishnaic disputes, the Sages (חכמים) typically denote the position that disagrees with the named Tanna; halacha usually follows them unless the dispute is explicitly settled otherwise.',
  },
  'tanna kamma': {
    name: 'Tanna Kamma',
    nameHe: 'תנא קמא',
    bio: "Tanna Kamma (תנא קמא, 'the first Tanna') — the anonymous opening voice of a Mishnah, whose view is presumed normative and majority unless a named dissenter is explicitly upheld. Often functionally identical with the Sages later in the same Mishnah.",
  },
  rabbanan: {
    name: 'Rabbanan (the Rabbis)',
    nameHe: 'רבנן',
    bio: "Rabbanan (רבנן) — the Aramaic collective for 'the Rabbis', the majority rabbinic voice in baraitot and amoraic discourse. Like Chakhamim, denotes the consensus position rather than any single named authority.",
  },
  rabbis: {
    name: 'The Rabbis',
    nameHe: 'רבנן',
    bio: 'The collective rabbinic voice — the majority position in tannaitic and amoraic disputes when no single authority is named.',
  },
  stam: {
    name: 'Stam (anonymous Gemara)',
    nameHe: 'סתם',
    bio: "Stam (סתם) — the anonymous editorial voice of the Gemara, attributed to the redactors (savora'im / late amora'im) who shaped the sugya's argument structure. The Stam asks questions, raises objections, frames answers, and resolves disputes without naming itself; modern Talmud scholarship reads it as a distinct compositional layer above the named tannaitic and amoraic dicta.",
  },
  "gemara's question": {
    name: "The Gemara's question",
    nameHe: 'קושיית הגמרא',
    bio: "An anonymous question raised by the Stam (the Gemara's editorial voice). Not attributed to any named sage — it functions as a structural pivot that opens the sugya's discussion or interrogates a position before the next move answers it.",
  },
  gemara: {
    name: 'The Gemara (Stam)',
    nameHe: 'גמרא',
    bio: 'The anonymous editorial voice of the Talmud — see Stam.',
  },
  'beit hillel': {
    name: 'Beit Hillel',
    nameHe: 'בית הלל',
    bio: 'Beit Hillel (בית הלל) — the school of Hillel, the dominant tannaitic legal school in late Second Temple and early post-Destruction halacha. Almost always followed in practice against Beit Shammai.',
  },
  'beit shammai': {
    name: 'Beit Shammai',
    nameHe: 'בית שמאי',
    bio: 'Beit Shammai (בית שמאי) — the school of Shammai, generally the stricter halachic school, contemporaneous with Beit Hillel. Their position is recorded but almost always overruled in practice.',
  },
};

const ALIAS_KEYS: Record<string, string> = {
  sage: 'sages',
  'the sages': 'sages',
  chachamim: 'chakhamim',
  hakhamim: 'chakhamim',
  'first tanna': 'tanna kamma',
  tk: 'tanna kamma',
  'gemara questions': "gemara's question",
  'gemara asks': "gemara's question",
  'the gemara': 'gemara',
  'school of hillel': 'beit hillel',
  'school of shammai': 'beit shammai',
  'house of hillel': 'beit hillel',
  'house of shammai': 'beit shammai',
};

function normalizeVoiceKey(s: string): string {
  return s.replace(/[.'"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Look up a collective voice by display name. Returns null when the
 *  name doesn't match a known group — caller falls back to the regular
 *  per-rabbi resolution chain. */
export function resolveVoiceGroup(query: string): VoiceGroup | null {
  if (!query) return null;
  const key = normalizeVoiceKey(query);
  if (VOICE_GROUPS[key]) return VOICE_GROUPS[key];
  const aliased = ALIAS_KEYS[key];
  if (aliased && VOICE_GROUPS[aliased]) return VOICE_GROUPS[aliased];
  return null;
}

/** Synthesize an IdentifiedRabbi from a VoiceGroup so the existing rabbi
 *  sidebar (the rabbi recipe card) renders it. Generation is 'unknown' and places /
 *  geography are empty — collective voices have no individual biography.
 *  The bio paragraph is the descriptive text from VOICE_GROUPS. */
export function voiceGroupToRabbi(g: VoiceGroup): IdentifiedRabbi {
  return {
    slug: null,
    name: g.name,
    nameHe: g.nameHe,
    generation: 'unknown' as IdentifiedRabbi['generation'],
    region: null,
    places: [],
    moved: null,
    bio: g.bio,
    image: null,
    wiki: null,
  };
}

/** Display names that the prose matcher should always treat as candidates
 *  even when no LLM mark has emitted them. */
export function voiceGroupNames(): string[] {
  const names = new Set<string>();
  for (const g of Object.values(VOICE_GROUPS)) names.add(g.name);
  // Also include the "short" trigger names so e.g. plain "Sages" matches
  // in prose, then resolves to the canonical "The Sages (Chakhamim)" entry.
  names.add('Sages');
  names.add('Tanna Kamma');
  names.add('Rabbanan');
  names.add('Beit Hillel');
  names.add('Beit Shammai');
  return Array.from(names);
}
