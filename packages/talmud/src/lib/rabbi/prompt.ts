/**
 * System prompt + input builders for the unified rabbi enrichment LLM call.
 * The LLM consumes (local rabbi data, optional Sefaria topic graph) and emits
 * one LLMRabbiOutput record. The worker validates and stamps provenance.
 */

export const RABBI_ENRICH_SYSTEM_PROMPT = `You are a scholar of Talmudic and rabbinic history producing one structured biographical record for ONE sage. Output STRICT JSON only — no prose, no markdown fences.

Input arrives in three blocks: IDENTITY (slug + name + local-data fields), SEFARIA GRAPH (structured edges from Sefaria's topic system, when present), and BIO (English biographical text). Use all three.

GROUNDING RULES (strict):
- Edges in the SEFARIA GRAPH block are CONFIRMED FACTS. Include every Sefaria edge in the corresponding output array verbatim with source="sefaria" and copy the tfidf weight into "weight". Do NOT drop, rename, or contradict them.
- You MAY add additional teachers/students/family/opposed/influences from the BIO when the bio supports them. Mark these source="llm" with a confidence weight 0.0–1.0 (default 0.5).
- For unresolved names (no known slug), set slug=null and put the name in "name".
- Do NOT invent relationships not supported by Sefaria or the bio.

OUTPUT SHAPE (every field required, even when empty/null):

{
  "slug": "<echo input slug>",
  "canonical": { "en": "Sefaria-style English (Rabbi/Rav, b./bar)", "he": "Hebrew" },
  "aliases": ["..."],
  "generation": "Sefaria gen code like T4, A2, Z5 (Tanna, Amora, Zugot, Gaon, Savora) or null",
  "region": "israel" | "bavel" | "mixed" | null,
  "academy": "sura"|"pumbedita"|"nehardea"|"mehoza"|"naresh"|"mata-mehasya"|"tiberias"|"caesarea"|"sepphoris"|"yavneh"|"usha"|"lod"|"bnei-brak"|"jerusalem"|"other"|null,
  "birthYear": <integer CE, negative for BCE, or null>,
  "deathYear": <integer CE, negative for BCE, or null>,
  "places": ["..."],
  "bio": { "en": "≤800 chars, third-person prose, no headings", "he": "Hebrew mirror of bio.en" },
  "prominence": <number copied from Sefaria numSources, or null>,
  "orientation": "mystical" | "practical" | "mixed" | "unknown",
  "characteristics": ["halakhist"|"aggadist"|"mystic"|"exegete"|"communal-leader"|"head-of-academy"|"judge"|"miracle-worker"|"ascetic"|"poet"|"translator", ...],
  "primaryTeacher": "<slug from teachers[] with highest weight, else null>",
  "primaryStudent": "<slug from students[] with highest weight, else null>",
  "teachers": [{ "slug": "...|null", "name": "...", "weight": <number|null>, "source": "sefaria"|"llm" }],
  "students": [{ same shape }],
  "contemporaries": ["<slug>", ...],
  "family": [{ "slug": "...|null", "name": "...", "weight": <number|null>, "source": "sefaria"|"llm", "relation": "<see below>" }],
  "opposed": [{ same edge shape }],
  "influences": [{ same edge shape }],
  "events": ["<slug>", ...],
  "refs": { "sefariaSlug": "...", "enWiki": "...", "heWiki": "...", "je": "...", "wikidata": "..." },
  "image": { "url": "...", "caption": "..." } | null
}

CLOSED ENUMS (case-sensitive; do not invent values):

family.relation must be one of:
  father, mother, spouse, son, daughter,
  brother, sister, uncle, aunt, nephew, niece,
  grandfather, grandmother, grandson, granddaughter,
  father-in-law, mother-in-law, son-in-law, daughter-in-law, brother-in-law, sister-in-law,
  cousin, ancestor, descendant, other.

orientation: mystical, practical, mixed, unknown.
region: israel, bavel, mixed.
academy: see allowed list above.

NORMALIZATION:
- canonical.en uses Sefaria spellings: "Rabbi" for Eretz-Yisrael Tannaim/Amoraim, "Rav" for Babylonian Amoraim, "b." for "ben", ASCII only.
- bio.en ≤800 chars, plain prose. If both Sefaria and Wikipedia bios are provided, synthesize one coherent paragraph faithful to both; do not invent facts.
- bio.he is the Hebrew counterpart, same content.
- characteristics is an open tag bag — use lowercase, hyphenated tags. Prefer the listed examples but coin new ones if a clear bio attribute is missing from the list.
- For Sefaria edges, "weight" copies the tfidf number from input verbatim (e.g., 57.99). For LLM-added edges, use 0.0–1.0.
- prominence is the integer Sefaria numSources value verbatim (e.g., 10477), or null if not provided. NOT a normalized 0–1 score.
- primaryTeacher/primaryStudent: the SLUG of the entry in teachers[]/students[] whose "weight" value is numerically largest. Compare numbers as numbers (57.99 > 27.67 > 11.81). Sefaria-source weights (raw tfidf, often >10) rank ABOVE LLM-source weights (0–1) by raw value. If teachers[] is empty or every weight is null, set primaryTeacher to null.
- "events" is a flat array of event slugs (when SEFARIA GRAPH lists participates-in edges, copy those slug values).
- refs: include only fields you have evidence for; omit unknown fields entirely.
- image: include only if a Sefaria image URL was provided in input; otherwise null.

ACADEMY: set whenever the IDENTITY 'places' field, the BIO, or well-attested tradition associates the sage with one of the listed academies/towns. Map common name variants to enum values: "Bnei Brak"→"bnei-brak", "Tzipori"/"Sepphoris"→"sepphoris", "Pum Nahara"/"Pumbedita"→"pumbedita", "Mata Mehasya"→"mata-mehasya". Use null only when no academy is supportable.

DATES: populate birthYear and deathYear whenever the bio gives an explicit year, OR when the sage's traditional dates are well-attested in standard rabbinic chronology (Iggeret Rav Sherira Gaon, Seder HaDorot). Years are integer CE (positive) or BCE (negative). Examples: Rabbi Akiva ~50 to ~135, Hillel ~110 BCE to ~10 CE, Rav Ashi ~352 to ~427. Be conservative: if uncertain by more than a generation, use null. If only one of the two dates is known, set the other to null.

CAPS: teachers ≤30, students ≤30, family ≤25, opposed ≤15, influences ≤15, events ≤10, contemporaries ≤30, characteristics ≤8.

If a field has no information, return [] for arrays, null for nullable scalars, "" for required strings (canonical.en/he, bio.en/he must always be non-empty if any data exists). NEVER omit a field.`;

/* ---------- Input shapes ------------------------------------------------- */

export interface LocalRabbiInput {
  slug: string;
  canonical: string;
  canonicalHe: string | null;
  aliases: string[];
  region: string | null;
  generation: string | null;
  places: string[];
  bio: string | null;
  bioSource: 'sefaria' | 'wikipedia' | null;
  wiki: string | null;
}

export interface SefariaEdgeInput {
  topic: string;
  weight: number | null;
}

export interface SefariaInput {
  subclass: string | null;
  generation: string | null;
  numSources: number | null;
  titles: Array<{ text: string; lang: 'en' | 'he' }>;
  description: { en: string; he: string };
  refs: {
    enWiki?: string;
    heWiki?: string;
    je?: string;
    wikidata?: string;
  };
  image: { url: string; caption: string | null } | null;
  edges: {
    learnedFrom: SefariaEdgeInput[];
    taught: SefariaEdgeInput[];
    family: Array<SefariaEdgeInput & { relation: string }>;
    opposed: SefariaEdgeInput[];
    correspondedWith: SefariaEdgeInput[];
    memberOf: SefariaEdgeInput[];
    participatesIn: SefariaEdgeInput[];
    relatedTo: SefariaEdgeInput[];
  };
}

/** Build the user message for the unified enrichment call. */
export function buildRabbiEnrichUserMessage(input: {
  local: LocalRabbiInput;
  sefaria: SefariaInput | null;
}): string {
  const { local, sefaria } = input;

  const lines: string[] = [];

  lines.push('=== IDENTITY ===');
  lines.push(`slug:        ${local.slug}`);
  lines.push(`canonical:   ${local.canonical}`);
  lines.push(`canonicalHe: ${local.canonicalHe ?? '(none)'}`);
  lines.push(`region:      ${local.region ?? 'unknown'}`);
  lines.push(`generation:  ${local.generation ?? 'unknown'}`);
  lines.push(`places:      ${local.places.join(', ') || '(none)'}`);
  lines.push(`aliases:     ${local.aliases.slice(0, 10).join(' | ') || '(none)'}`);
  if (local.wiki) lines.push(`heWiki:      ${local.wiki}`);

  if (sefaria) {
    lines.push('');
    lines.push('=== SEFARIA GRAPH ===');
    lines.push(`subclass:    ${sefaria.subclass ?? '(none)'}`);
    lines.push(`generation:  ${sefaria.generation ?? '(none)'}`);
    lines.push(`numSources:  ${sefaria.numSources ?? '(none)'}`);

    const enTitles = sefaria.titles.filter((t) => t.lang === 'en').map((t) => t.text);
    const heTitles = sefaria.titles.filter((t) => t.lang === 'he').map((t) => t.text);
    if (enTitles.length) lines.push(`titles_en:   ${enTitles.join(' | ')}`);
    if (heTitles.length) lines.push(`titles_he:   ${heTitles.join(' | ')}`);

    if (sefaria.refs.enWiki) lines.push(`enWiki:      ${sefaria.refs.enWiki}`);
    if (sefaria.refs.heWiki) lines.push(`heWiki:      ${sefaria.refs.heWiki}`);
    if (sefaria.refs.je) lines.push(`je:          ${sefaria.refs.je}`);
    if (sefaria.refs.wikidata) lines.push(`wikidata:    ${sefaria.refs.wikidata}`);
    if (sefaria.image) lines.push(`image:       ${sefaria.image.url}`);

    lines.push('');
    lines.push('-- Sefaria edges (CONFIRMED — include each in output with source="sefaria") --');
    appendEdges(lines, 'teachers (learned-from)', sefaria.edges.learnedFrom);
    appendEdges(lines, 'students (taught)', sefaria.edges.taught);
    appendFamily(lines, sefaria.edges.family);
    appendEdges(lines, 'opposed', sefaria.edges.opposed);
    appendEdges(lines, 'influences (corresponded-with)', sefaria.edges.correspondedWith);
    appendEdges(lines, 'events (participates-in)', sefaria.edges.participatesIn);
    appendEdges(lines, 'member-of', sefaria.edges.memberOf);
    appendEdges(lines, 'related-to (weak)', sefaria.edges.relatedTo);

    if (sefaria.description.en) {
      lines.push('');
      lines.push('-- Sefaria bio (en) --');
      lines.push(sefaria.description.en);
    }
    if (sefaria.description.he) {
      lines.push('');
      lines.push('-- Sefaria bio (he) --');
      lines.push(sefaria.description.he);
    }
  } else {
    lines.push('');
    lines.push('=== SEFARIA GRAPH ===');
    lines.push('(no Sefaria topic data; rely on BIO)');
  }

  if (local.bio) {
    lines.push('');
    lines.push(`=== BIO (${local.bioSource ?? 'unknown'}) ===`);
    lines.push(local.bio);
  }

  lines.push('');
  lines.push('Now produce the JSON record for this sage.');

  return lines.join('\n');
}

function appendEdges(out: string[], label: string, edges: SefariaEdgeInput[]): void {
  if (!edges.length) {
    out.push(`${label}: (none)`);
    return;
  }
  out.push(`${label}:`);
  for (const e of edges) {
    out.push(`  - ${e.topic}  (weight=${formatWeight(e.weight)})`);
  }
}

function appendFamily(
  out: string[],
  edges: Array<SefariaEdgeInput & { relation: string }>,
): void {
  if (!edges.length) {
    out.push('family: (none)');
    return;
  }
  out.push('family:');
  for (const e of edges) {
    out.push(`  - ${e.topic}  (relation=${e.relation}, weight=${formatWeight(e.weight)})`);
  }
}

function formatWeight(w: number | null): string {
  if (w === null) return 'null';
  return w.toFixed(2);
}
