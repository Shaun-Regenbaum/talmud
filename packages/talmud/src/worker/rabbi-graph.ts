/**
 * Static rabbi relationship graph lookup. Uses src/lib/data/rabbi-hierarchy.json
 * (1301 nodes, 368 with curated edges, sourced from Sefaria's rabbi graph)
 * as the source of truth for rabbi.relationships, replacing the LLM call
 * for the majority of well-attested figures.
 *
 * Flow:
 *   1. Build name → slug indices at module load (canonical, canonicalHe,
 *      normalized-canonical, normalized-aliases).
 *   2. lookupRelationships(name, nameHe?, generation?) returns a structured
 *      RelationshipsData (teachers/students/debatePartners/family) when:
 *      - the rabbi is found in the graph, AND
 *      - the node has at least one edge (teacher or student).
 *      Otherwise returns null and the caller falls through to LLM.
 *   3. Family entries are derived from the rabbi's name patronymic
 *      (the graph's `family` field is always null), since patronymics like
 *      "Mar bar Ravina" / "Rav Acha b. Abaye" carry direct nominal evidence
 *      of the parent.
 *
 * Slug resolution: each teachers/students/colleagues entry is a slug; we
 * resolve back to the canonical name via the node table. Slugs we can't
 * resolve (graph references a node we don't have) are dropped silently.
 */

import hierarchyData from '../lib/data/rabbi-hierarchy.json';

interface HierarchyNode {
  canonical: string;
  canonicalHe?: string | null;
  generation: string;
  region?: string | null;
  hasBio?: boolean;
  teachers?: string[];
  students?: string[];
  colleagues?: string[];
  unresolved?: {
    teachers?: string[];
    students?: string[];
    colleagues?: string[];
  };
  /** Set on AI-researched nodes added outside the admin relationship pipeline. */
  provenance?: string;
}

interface HierarchyData {
  generatedAt?: string;
  totalNodes?: number;
  processedNodes?: number;
  nodesWithEdges?: number;
  nodes: Record<string, HierarchyNode>;
}

const DATA = hierarchyData as unknown as HierarchyData;

// Structured output shapes — must match the rabbi.relationships LLM schema
// so the same parsed payload flows through the synthesis dep + the client
// RabbiLineageTree consumer.
export interface RelationshipPerson {
  name: string;
  primary: boolean;
  note: string;
}
export interface DebatePartner {
  name: string;
  note: string;
}
export interface FamilyMember {
  name: string;
  relation: string;
}
export interface RelationshipsData {
  teachers: RelationshipPerson[];
  students: RelationshipPerson[];
  debatePartners: DebatePartner[];
  family: FamilyMember[];
  prose: string;
}

/** Normalize a name for fuzzy lookup. Lowercase, strip brackets +
 *  punctuation, collapse patronymic markers ("bar", "ben", "b.", "son of",
 *  "bereih d'", "brei d'rav", "breih d'") to a single canonical "bar"
 *  token. Idempotent — repeated calls yield the same result. */
function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[[\]]/g, '') // strip square brackets used as disambiguators
      .replace(/\s+son\s+of\s+/g, ' bar ')
      .replace(/\s+bereih\s+d'?/g, ' bar ')
      .replace(/\s+breih\s+d'?(rav\s+)?/g, ' bar ')
      .replace(/\s+brei\s+d'?(rav\s+)?/g, ' bar ')
      .replace(/\s+b\.\s+/g, ' bar ')
      .replace(/\s+ben\s+/g, ' bar ')
      .replace(/[.,'"`’]/g, '')
      .replace(/\s+/g, ' ')
      // Collapse the chet/heh transliteration variants: "ch" → "h". Graph
      // uses "Nahman" / "Yitzhak" / "Hiyya"; LLM emits "Nachman" / "Yitzchak"
      // / "Chiyya". Both refer to the same ח-spelled name. Done last so it
      // doesn't interfere with the patronymic markers above.
      .replace(/ch/g, 'h')
      .trim()
  );
}

/** Known aliases / stage names → canonical slug. Hand-curated for the
 *  short-form names readers actually type/say but which the graph stores
 *  under more formal canonical entries. Add entries as misses surface. */
// Keys are POST-normalization (lowercased, "ch" → "h", patronymic-collapsed).
const ALIASES: Record<string, string> = {
  'reish lakish': 'rabbi-shimon-b-lakish',
  'resh lakish': 'rabbi-shimon-b-lakish',
  // The graph carries a duplicate "Rabbi Shimon b. Lakish" node (slug …-2,
  // canonicalHe ריש לקיש) — the full English form always means THE Reish
  // Lakish, so pin it rather than treating the data quirk as a homonym.
  'rabbi shimon bar lakish': 'rabbi-shimon-b-lakish',
  'rabbi yohanan': 'rabbi-yochanan-b-napacha',
  'rabbi yohanan bar nappaha': 'rabbi-yochanan-b-napacha',
  rabbah: 'rabbah-b-nachmani',
  'rabbah bar nahmani': 'rabbah-b-nachmani',
  'rav nahman': 'rav-nachman-b-yaakov',
  'rav nahman bar yaakov': 'rav-nachman-b-yaakov',
  rebbi: 'rabbi-yehudah-hanasi',
  'rabbi yehuda hanasi': 'rabbi-yehudah-hanasi',
  'rabbi yehudah ha nasi': 'rabbi-yehudah-hanasi',
};

/** Extract the patronymic-named parent from a rabbi name, if any.
 *  Returns the parent's name in display form. Handles:
 *    "Mar bar Ravina" → "Ravina"
 *    "Rabbi Acha b. Abaye" → "Abaye"
 *    "Rav Yosef ben Chama" → "Chama"
 *    "Mar son of Ravina" → "Ravina"
 *    "Mar Bereih deRavna" → "Ravna"
 *    "Rabbah brei d'Rav Huna" → "Rav Huna"
 *  Returns null if no patronymic marker is found.
 */
function extractPatronymic(name: string): string | null {
  const trimmed = name.trim();
  const patterns: RegExp[] = [
    /\s+son\s+of\s+(.+)$/i,
    /\s+bereih\s+d['e]?(.+)$/i,
    /\s+breih\s+d'?(rav\s+.+)$/i,
    /\s+breih\s+d'?(.+)$/i,
    /\s+brei\s+d'?(rav\s+.+)$/i,
    /\s+brei\s+d'?(.+)$/i,
    /\s+bar\s+(.+)$/i,
    /\s+b\.\s+(.+)$/i,
    /\s+ben\s+(.+)$/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      // Re-capitalize first letter unless it's already a title-cased word.
      const parent = m[1].trim();
      if (parent.length === 0) continue;
      // Skip if the captured "parent" is a known non-patronymic suffix
      // like "Kappara" (Bar Kappara) — those are stage names, not patronymics.
      // For our use case, false-positives are acceptable: the LLM-derived
      // synthesis will also pick up the wrong thing and the user will see
      // it consistently.
      return parent;
    }
  }
  return null;
}

/** Normalize a HEBREW name for index keys + lookups: strip nikkud/cantillation,
 *  drop a trailing digit disambiguator ("רבי יוחנן (1)" → "רבי יוחנן"), expand
 *  the geresh title shorthand ("ר' ירמיה" → "רבי ירמיה" — the daf's most common
 *  form, which the previous exact-string lookup silently missed), strip
 *  punctuation, collapse whitespace. Idempotent. */
function normalizeHeName(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '') // nikkud + cantillation
    .replace(/\s*\(\d+\)\s*$/, '') // trailing digit disambiguator
    .replace(/^ר['׳]\s+/, 'רבי ') // geresh title shorthand → full title
    .replace(/[.,:;?!"'״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build indices at module load. We map every name form we can think of to
// the slug; multiple forms can point to the same slug (canonical, Hebrew,
// normalized canonical).
interface HeHit {
  slug: string;
  /** false when this key only exists because we stripped a "(N)" homonym
   *  disambiguator off the stored canonicalHe — the bare Hebrew form is then
   *  registry-AMBIGUOUS by Sefaria's own naming, not a unique pin. */
  pinned: boolean;
}
interface IndexBuilt {
  nameToSlug: Map<string, string>; // normalized name → slug
  heIndex: Map<string, HeHit[]>; // normalized Hebrew name → ALL bearers
  slugToCanonical: Map<string, string>; // slug → canonical name (display)
}

function buildIndex(): IndexBuilt {
  const nameToSlug = new Map<string, string>();
  const heIndex = new Map<string, HeHit[]>();
  const slugToCanonical = new Map<string, string>();
  for (const [slug, node] of Object.entries(DATA.nodes)) {
    slugToCanonical.set(slug, node.canonical);
    const normCanonical = normalizeName(node.canonical);
    if (!nameToSlug.has(normCanonical)) nameToSlug.set(normCanonical, slug);
    // Also index the slug itself as a normalized name (slug → name form).
    const slugAsName = slug.replace(/-/g, ' ').replace(/\((\w+)\)/g, '$1');
    if (!nameToSlug.has(slugAsName)) nameToSlug.set(slugAsName, slug);
    if (node.canonicalHe) {
      const cleanHe = normalizeHeName(node.canonicalHe);
      if (cleanHe) {
        const pinned = !/\(\d+\)\s*$/.test(node.canonicalHe.trim());
        const hits = heIndex.get(cleanHe);
        if (hits) hits.push({ slug, pinned });
        else heIndex.set(cleanHe, [{ slug, pinned }]);
      }
    }
  }
  return { nameToSlug, heIndex, slugToCanonical };
}

const INDEX = buildIndex();

/** Find a node by name (English or Hebrew). When generation is supplied,
 *  prefer the slug whose generation matches. Returns slug or null. Internal —
 *  callers use resolveRabbiSlug / groundRabbiNames (registry-first + relational);
 *  findSlug is the single-best context resolver those build on. */
function findSlug(name: string, nameHe?: string, generation?: string): string | null {
  // 1. Hand-curated alias table — short-form names like "Reish Lakish".
  const norm = normalizeName(name);
  if (ALIASES[norm]) return ALIASES[norm];

  // 2. Exact normalized English match.
  let slug = INDEX.nameToSlug.get(norm) ?? null;

  // 3. Hebrew match (single-best: prefer a pinned bearer, else the first).
  if (!slug && nameHe) {
    const hits = INDEX.heIndex.get(normalizeHeName(nameHe)) ?? [];
    slug = (hits.find((h) => h.pinned) ?? hits[0])?.slug ?? null;
  }

  // 4. Prefix match scoped by generation. Useful when the input is shorter
  //    than the canonical (e.g. "Rabbi Elazar" → "Rabbi Elazar b. Pedat"
  //    when generation=amora-ey-2). Walk every node; pick the first whose
  //    canonical STARTS WITH the normalized input AND whose generation
  //    matches. Returns null when there's no generation hint (ambiguity is
  //    safer fallthrough to LLM disambiguation).
  if (!slug && generation) {
    for (const [s, node] of Object.entries(DATA.nodes)) {
      if (node.generation !== generation) continue;
      const nodeNorm = normalizeName(node.canonical);
      if (nodeNorm === norm || nodeNorm.startsWith(`${norm} `)) {
        slug = s;
        break;
      }
    }
  }

  return slug;
}

/** Resolve a slug to its display canonical name, falling back to the
 *  slug itself (re-humanized) when not found. */
export function slugToName(slug: string): string {
  return INDEX.slugToCanonical.get(slug) ?? slug.replace(/-/g, ' ');
}

export function generationOf(slug: string): string | null {
  return DATA.nodes[slug]?.generation ?? null;
}

// Every (normalizedCanonical, slug) pair, built once — for enumerating ALL
// registry nodes a name could refer to (homonym candidate set), not just the
// first match findSlug returns.
const NORM_INDEX: { norm: string; slug: string }[] = Object.entries(DATA.nodes).map(
  ([slug, n]) => ({ norm: normalizeName(n.canonical), slug }),
);

/** ALL registry nodes a name could denote. For a homonym like "Rav Kahana"
 *  this returns every Kahana node (Rav Kahana (II), Rav Kahana of Pum Nahara,
 *  …); for an unambiguous name, one. An alias short-form pins its one canonical
 *  target (aliases encode the intended default). Empty = not in the registry. */
export function rabbiCandidates(name: string, nameHe?: string): string[] {
  const norm = normalizeName(name);
  if (ALIASES[norm]) return [ALIASES[norm]];
  // A name that EXACTLY equals a node's canonical names that rabbi specifically
  // ("Rav" → the node "Rav", not every "Rav X"). Exact wins over prefix
  // extensions — otherwise bare "Rav"/"Shmuel" become homonyms of their whole
  // descendant family and relational scoring mis-picks a minor one.
  const exact = new Set<string>();
  const prefix = new Set<string>();
  for (const { norm: c, slug } of NORM_INDEX) {
    if (c === norm) exact.add(slug);
    else if (c.startsWith(`${norm} `)) prefix.add(slug); // short form ("Rav Kahana" → "Rav Kahana (II)")
  }
  const ix = INDEX.nameToSlug.get(norm);
  if (ix) exact.add(ix);
  // Hebrew form. A pinned single bearer is as good as an English exact. But a
  // bearer whose stored canonicalHe carried a "(N)" homonym disambiguator
  // ("רב כהנא (2)") must NOT pin the bare form — Sefaria numbered it precisely
  // because the bare Hebrew is ambiguous; treating that stripped key as exact
  // is how "Rav Kahana" silently collapsed to rav-kahana-(ii) and got stamped
  // amora-ey-1. Such hits only JOIN the candidate set.
  const heOpen = new Set<string>();
  if (nameHe) {
    const hits = INDEX.heIndex.get(normalizeHeName(nameHe)) ?? [];
    if (hits.length === 1 && hits[0].pinned) exact.add(hits[0].slug);
    else for (const h of hits) heOpen.add(h.slug);
  }
  if (exact.size) return [...exact];
  for (const s of heOpen) prefix.add(s);
  return [...prefix];
}

/** A homonym candidate, summarized for the AI-pin prompt: the registry's
 *  canonical name, generation tier, region, and the (name-resolved) edges that
 *  tell the model who this particular bearer studied with / disputed. The
 *  edges are the deciding signal — the famous "Rabbi Shimon" (bar Yochai) is
 *  the one whose teacher is Rabbi Akiva. */
export interface RabbiCandidateSummary {
  slug: string;
  canonical: string;
  generation: string | null;
  region: string | null;
  teachers: string[];
  students: string[];
  colleagues: string[];
}

/** Summarize each homonym candidate for the disambiguation prompt. Edge slugs
 *  are resolved to display names; an empty list means the registry node has no
 *  curated edges. */
export function rabbiCandidateSummaries(name: string, nameHe?: string): RabbiCandidateSummary[] {
  const names = (slugs: string[] | undefined): string[] => (slugs ?? []).map((s) => slugToName(s));
  return rabbiCandidates(name, nameHe).map((slug) => {
    const n = DATA.nodes[slug];
    return {
      slug,
      canonical: n?.canonical ?? slugToName(slug),
      generation: n?.generation ?? null,
      region: n?.region ?? null,
      teachers: names(n?.teachers),
      students: names(n?.students),
      colleagues: names(n?.colleagues),
    };
  });
}

export type ResolveBasis = 'unique' | 'relational' | 'generation' | 'ambiguous' | 'none';
export interface ResolvedRabbi {
  slug: string | null;
  basis: ResolveBasis;
}

/** A relational win must beat the runner-up by this many shared edges. A
 *  1-edge "win" is exactly what incidental co-presence produces (e.g. Rav
 *  appearing in another sugya on the daf handed Rav Kahana to the early
 *  Kahana), so a bare margin of one is treated as thin evidence. */
const RELATIONAL_MARGIN = 2;

/**
 * Registry-FIRST rabbi resolution with relational homonym disambiguation.
 *
 *  - 0 registry candidates → null ('none'): we don't invent a rabbi.
 *  - 1 candidate          → it ('unique').
 *  - >1 (a homonym)       → disambiguate by DAF EVIDENCE: score each candidate
 *    by how many of the co-occurring rabbis on the daf sit in its registry
 *    teacher/student/colleague edges. A candidate wins 'relational' only when
 *    its score clears the runner-up by RELATIONAL_MARGIN — a single shared
 *    edge is routinely incidental co-presence on a multi-sugya daf, not
 *    identification. On a candidate set that itself SPANS generations (the
 *    dangerous case: picking decides the era), a margin-clearing win is
 *    additionally vetoed when it CONTRADICTS the LLM's local generation read
 *    — daf-level co-occurrence can pile famous-name edges onto the wrong
 *    bearer (Shabbat 21b: Rav+Rava+R. Yochanan all sit in the conflated
 *    rav-kahana-(ii) node's edges), while the model at least read the sugya.
 *    Below the margin, the LLM's generation guess may still single out one
 *    candidate ('generation'), but ONLY when the relational evidence
 *    corroborates it (the gen-matched candidate sits at the top of the
 *    relational scores with score > 0) or the candidate set doesn't span
 *    generations at all. Two independent signals must AGREE; conflicting or
 *    thin evidence returns null ('ambiguous') — generation 'unknown' is the
 *    honest output, not a confident-wrong era.
 */
export function resolveRabbiSlug(
  name: string,
  nameHe?: string,
  opts?: { coRabbis?: readonly string[]; generation?: string },
): ResolvedRabbi {
  const cands = rabbiCandidates(name, nameHe);
  if (cands.length === 0) return { slug: null, basis: 'none' };
  if (cands.length === 1) return { slug: cands[0], basis: 'unique' };

  const candSet = new Set(cands);
  const coSlugs = new Set<string>();
  for (const co of opts?.coRabbis ?? []) {
    const s = findSlug(co); // single best for context names
    if (s && !candSet.has(s)) coSlugs.add(s);
  }
  const scoreOf = new Map<string, number>();
  for (const slug of cands) {
    const node = DATA.nodes[slug];
    if (!node) {
      scoreOf.set(slug, 0);
      continue;
    }
    const nbrs = new Set<string>([
      ...(node.teachers ?? []),
      ...(node.students ?? []),
      ...(node.colleagues ?? []),
    ]);
    let score = 0;
    for (const cs of coSlugs) if (nbrs.has(cs)) score++;
    scoreOf.set(slug, score);
  }
  const ranked = [...scoreOf.entries()].sort((a, b) => b[1] - a[1]);
  const [topSlug, topScore] = ranked[0];
  const runnerScore = ranked[1]?.[1] ?? 0;
  const genSpan = new Set(
    cands.map((s) => DATA.nodes[s]?.generation).filter((g): g is string => Boolean(g)),
  ).size;
  const llmGen = opts?.generation && opts.generation !== 'unknown' ? opts.generation : null;
  // Margin requirement (also subsumes the old tie check: a tie at the top
  // means margin 0) + the era-consistency veto: on a cross-generation set, a
  // relational win that contradicts the LLM's local generation read is
  // conflicting evidence, not identification.
  if (topScore > 0 && topScore >= runnerScore + RELATIONAL_MARGIN) {
    const eraConsistent = genSpan <= 1 || !llmGen || DATA.nodes[topSlug]?.generation === llmGen;
    if (eraConsistent) return { slug: topSlug, basis: 'relational' };
  } else if (llmGen) {
    const genMatch = cands.filter((s) => DATA.nodes[s]?.generation === llmGen);
    if (genMatch.length === 1) {
      // Below the margin the LLM's per-daf generation guess is exactly the
      // overclaim this path exists to correct — so on a cross-generation set
      // the guess only stands when the relational evidence, however thin,
      // points at the SAME candidate.
      const corroborated = topScore > 0 && (scoreOf.get(genMatch[0]) ?? 0) === topScore;
      if (genSpan <= 1 || corroborated) return { slug: genMatch[0], basis: 'generation' };
    }
  }
  return { slug: null, basis: 'ambiguous' };
}

export interface GroundedRabbi {
  name: string;
  slug: string | null;
  canonical: string | null;
  generation: string | null;
  genSource: ResolveBasis;
  /** Registry candidate count for the name — >1 means a homonym. Lets the
   *  client say "N rabbis share this name" when the basis is 'ambiguous'. */
  homonyms: number;
}

/**
 * THE one rabbi-resolution entry point, used by BOTH ways rabbis attach to the
 * text — the direct rabbi mark and the through-arguments voices. Resolves each
 * name registry-first with relational homonym disambiguation off the combined
 * cast (the items themselves + any extra co-occurring `context`), and returns a
 * uniform grounded record:
 *   - slug/canonical: null when not in the registry ('none') or an unpinnable
 *     homonym ('ambiguous') — we never invent or confidently-mis-pick a rabbi.
 *   - generation: the authoritative registry era when resolved; 'unknown' for an
 *     ambiguous homonym (neutral, not a confident-wrong guess); else the input.
 *   - genSource: provenance (unique | relational | generation | ambiguous | none).
 */
export function groundRabbiNames(
  items: readonly { name: string; nameHe?: string; generation?: string }[],
  context: readonly string[] = [],
): GroundedRabbi[] {
  const cast = [...items.map((i) => i.name), ...context];
  return items.map((it) => {
    const { slug, basis } = resolveRabbiSlug(it.name, it.nameHe, {
      coRabbis: cast.filter((n) => n.toLowerCase() !== it.name.toLowerCase()),
      generation: it.generation,
    });
    const generation = slug
      ? (generationOf(slug) ?? it.generation ?? null)
      : basis === 'ambiguous'
        ? 'unknown'
        : (it.generation ?? null);
    return {
      name: it.name,
      slug,
      canonical: slug ? slugToName(slug) : null,
      generation,
      genSource: basis,
      homonyms: rabbiCandidates(it.name, it.nameHe).length,
    };
  });
}

/**
 * Ground a rabbi MARK's instances in place via groundRabbiNames (the daf's own
 * cast is the relational context). Stamps slug + canonical + genSource and
 * rewrites generation (authoritative registry era, or 'unknown' for an
 * unpinnable homonym so the era color is neutral, not a confident-wrong guess).
 * Mutates and returns `parsed`.
 */
export function groundRabbiInstances(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const insts = (parsed as { instances?: unknown }).instances;
  if (!Array.isArray(insts)) return parsed;
  const fieldsOf = (i: unknown): Record<string, unknown> | null =>
    i &&
    typeof i === 'object' &&
    (i as { fields?: unknown }).fields &&
    typeof (i as { fields?: unknown }).fields === 'object'
      ? (i as { fields: Record<string, unknown> }).fields
      : null;
  const targets: {
    f: Record<string, unknown>;
    item: { name: string; nameHe?: string; generation?: string };
  }[] = [];
  for (const inst of insts) {
    const f = fieldsOf(inst);
    if (!f) continue;
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!name) continue;
    targets.push({
      f,
      item: {
        name,
        nameHe: typeof f.nameHe === 'string' ? f.nameHe : undefined,
        generation: typeof f.generation === 'string' ? f.generation : undefined,
      },
    });
  }
  const grounded = groundRabbiNames(targets.map((t) => t.item));
  grounded.forEach((g, i) => {
    const f = targets[i].f;
    f.genSource = g.genSource;
    // Candidate count, stamped only for homonyms — the client renders
    // "generation uncertain — N rabbis share this name" off it when the
    // basis is 'ambiguous'. Additive field; instances aren't strict-validated.
    if (g.homonyms > 1) f.homonyms = g.homonyms;
    if (g.slug) {
      f.slug = g.slug;
      f.canonical = g.canonical;
    }
    if (g.generation) f.generation = g.generation;
  });
  return parsed;
}

/** Build family entries from the rabbi's name patronymic. The graph
 *  doesn't carry family data; the patronymic is direct nominal evidence
 *  of the parent. */
function deriveFamily(name: string): FamilyMember[] {
  const parent = extractPatronymic(name);
  if (!parent) return [];
  return [{ name: parent, relation: 'father' }];
}

/** Build prose summary describing the relationships, in the same style
 *  the LLM was emitting. Synthesis consumes this string. */
function buildProse(
  node: HierarchyNode,
  teachers: RelationshipPerson[],
  students: RelationshipPerson[],
  debatePartners: DebatePartner[],
  family: FamilyMember[],
): string {
  const parts: string[] = [];
  if (teachers.length > 0) {
    const tNames = teachers
      .slice(0, 3)
      .map((t) => t.name)
      .join(', ');
    parts.push(`Studied under ${tNames}`);
  }
  if (students.length > 0) {
    const sNames = students
      .slice(0, 3)
      .map((s) => s.name)
      .join(', ');
    parts.push(`taught ${sNames}`);
  }
  if (debatePartners.length > 0) {
    const cNames = debatePartners
      .slice(0, 2)
      .map((c) => c.name)
      .join(', ');
    parts.push(`frequently paired with ${cNames}`);
  }
  if (family.length > 0) {
    parts.push(`his ${family[0].relation} was ${family[0].name}`);
  }
  if (parts.length === 0) return `${node.canonical} (${node.generation}).`;
  // Capitalize first letter.
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase() + sentence.slice(1)}.`;
}

export interface LookupResult {
  /** Source so we can tell the LLM-fallback path from the graph hit. */
  source: 'graph';
  /** Slug of the matched node — useful for debugging/logging. */
  slug: string;
  data: RelationshipsData;
}

/**
 * Try to resolve the rabbi's relationships from the static graph. Returns
 * null when:
 *   - The rabbi isn't found by name or Hebrew name
 *   - The found node has no edges (teachers + students both empty)
 *   - The graph data is sparse enough that the LLM is likely to do better
 *
 * Caller should fall through to LLM in those cases.
 */
export function lookupRelationships(
  name: string,
  nameHe?: string,
  generation?: string,
): LookupResult | null {
  const slug = findSlug(name, nameHe, generation);
  if (!slug) return null;
  return lookupRelationshipsBySlug(slug, name);
}

/**
 * Same as lookupRelationships but keyed DIRECTLY by a known registry slug —
 * the path for mark instances grounding already pinned (their `fields.slug`).
 * Skips name resolution entirely: a name lookup is first-wins and homonym-
 * blind, so re-resolving a grounded instance by name can land on a different
 * same-name bearer. `displayName` (the daf's English form) feeds the
 * patronymic family derivation; defaults to the node's canonical name.
 */
export function lookupRelationshipsBySlug(slug: string, displayName?: string): LookupResult | null {
  const node = DATA.nodes[slug];
  if (!node) return null;
  const name = displayName || node.canonical;

  // Cap each list at a sane number. Sefaria's graph can record 15-50+
  // students/colleagues for prolific sages (Rava has 22 students; R.
  // Yochanan has 57); rendering them all in the sidebar tree drowns the
  // visualization. Top-N gives users the canonical relationships at a
  // glance; "show all" in the UI can pull more from the cached payload
  // if we ever raise the cap.
  const MAX_TEACHERS = 6;
  const MAX_STUDENTS = 8;
  const MAX_COLLEAGUES = 5;
  const teacherSlugs = (node.teachers ?? []).slice(0, MAX_TEACHERS);
  const studentSlugs = (node.students ?? []).slice(0, MAX_STUDENTS);
  const colleagueSlugs = (node.colleagues ?? []).slice(0, MAX_COLLEAGUES);

  // Skip if the node has no real edges. We could return an empty result +
  // a derived family, but the caller can do better via LLM with a prior.
  if (teacherSlugs.length === 0 && studentSlugs.length === 0) return null;

  // Mark first 1-2 as primary (graph order is not strict, but earlier
  // entries tend to be the canonical ones per the build script).
  const teachers: RelationshipPerson[] = teacherSlugs.map((s, i) => ({
    name: slugToName(s),
    primary: i < 2,
    note: '',
  }));
  const students: RelationshipPerson[] = studentSlugs.map((s, i) => ({
    name: slugToName(s),
    primary: i < 2,
    note: '',
  }));
  const debatePartners: DebatePartner[] = colleagueSlugs.map((s) => ({
    name: slugToName(s),
    note: '',
  }));

  // Patronymic-derived family.
  const family = deriveFamily(name);
  // Avoid duplicating father if they're already in teachers as primary.
  const filteredFamily = family.filter(
    (f) => !teachers.some((t) => t.name.toLowerCase() === f.name.toLowerCase()),
  );

  // Also pull in unresolved teachers/students by display name. These are
  // figures the graph knew about by name but couldn't slug-resolve.
  for (const unresolvedTeacher of node.unresolved?.teachers ?? []) {
    if (!teachers.some((t) => t.name === unresolvedTeacher)) {
      teachers.push({ name: unresolvedTeacher, primary: false, note: '' });
    }
  }
  for (const unresolvedStudent of node.unresolved?.students ?? []) {
    if (!students.some((s) => s.name === unresolvedStudent)) {
      students.push({ name: unresolvedStudent, primary: false, note: '' });
    }
  }

  const prose = buildProse(node, teachers, students, debatePartners, filteredFamily);

  return {
    source: 'graph',
    slug,
    data: {
      teachers,
      students,
      debatePartners,
      family: filteredFamily,
      prose,
    },
  };
}

/** Diagnostic — coverage stats for the loaded graph. */
export function graphStats(): {
  totalNodes: number;
  nodesWithEdges: number;
  processedNodes: number;
} {
  return {
    totalNodes: DATA.totalNodes ?? Object.keys(DATA.nodes).length,
    nodesWithEdges: DATA.nodesWithEdges ?? 0,
    processedNodes: DATA.processedNodes ?? 0,
  };
}
