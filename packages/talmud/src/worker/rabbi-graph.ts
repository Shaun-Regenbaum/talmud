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

// Build indices at module load. We map every name form we can think of to
// the slug; multiple forms can point to the same slug (canonical, Hebrew,
// normalized canonical).
interface IndexBuilt {
  nameToSlug: Map<string, string>; // normalized name → slug
  heToSlug: Map<string, string>; // Hebrew name → slug
  slugToCanonical: Map<string, string>; // slug → canonical name (display)
}

function buildIndex(): IndexBuilt {
  const nameToSlug = new Map<string, string>();
  const heToSlug = new Map<string, string>();
  const slugToCanonical = new Map<string, string>();
  for (const [slug, node] of Object.entries(DATA.nodes)) {
    slugToCanonical.set(slug, node.canonical);
    const normCanonical = normalizeName(node.canonical);
    if (!nameToSlug.has(normCanonical)) nameToSlug.set(normCanonical, slug);
    // Also index the slug itself as a normalized name (slug → name form).
    const slugAsName = slug.replace(/-/g, ' ').replace(/\((\w+)\)/g, '$1');
    if (!nameToSlug.has(slugAsName)) nameToSlug.set(slugAsName, slug);
    if (node.canonicalHe) {
      // Normalize: trim, strip parenthetical disambiguators ("רבי יוחנן (1)").
      const cleanHe = node.canonicalHe.replace(/\s*\(\d+\)\s*$/, '').trim();
      if (cleanHe && !heToSlug.has(cleanHe)) heToSlug.set(cleanHe, slug);
    }
  }
  return { nameToSlug, heToSlug, slugToCanonical };
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

  // 3. Hebrew match.
  if (!slug && nameHe) {
    const cleanHe = nameHe.replace(/\s*\(\d+\)\s*$/, '').trim();
    slug = INDEX.heToSlug.get(cleanHe) ?? null;
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
      if (nodeNorm === norm || nodeNorm.startsWith(norm + ' ')) {
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
    else if (c.startsWith(norm + ' ')) prefix.add(slug); // short form ("Rav Kahana" → "Rav Kahana (II)")
  }
  const ix = INDEX.nameToSlug.get(norm);
  if (ix) exact.add(ix);
  if (nameHe) {
    const cleanHe = nameHe.replace(/\s*\(\d+\)\s*$/, '').trim();
    const he = INDEX.heToSlug.get(cleanHe);
    if (he) exact.add(he);
  }
  return exact.size ? [...exact] : [...prefix];
}

export type ResolveBasis = 'unique' | 'relational' | 'generation' | 'ambiguous' | 'none';
export interface ResolvedRabbi {
  slug: string | null;
  basis: ResolveBasis;
}

/**
 * Registry-FIRST rabbi resolution with relational homonym disambiguation.
 *
 *  - 0 registry candidates → null ('none'): we don't invent a rabbi.
 *  - 1 candidate          → it ('unique').
 *  - >1 (a homonym)       → disambiguate by DAF EVIDENCE: score each candidate
 *    by how many of the co-occurring rabbis on the daf sit in its registry
 *    teacher/student/colleague edges, and pick the unique best ('relational').
 *    e.g. the Rav Kahana who sits next to Rav resolves to the Kahana whose
 *    edges include Rav. If relational gives no clear winner, fall back to a
 *    generation match ONLY if it singles out one candidate; otherwise return
 *    null ('ambiguous') rather than guess. Precision over a confident-wrong id.
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
  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const slug of cands) {
    const node = DATA.nodes[slug];
    if (!node) continue;
    const nbrs = new Set<string>([
      ...(node.teachers ?? []),
      ...(node.students ?? []),
      ...(node.colleagues ?? []),
    ]);
    let score = 0;
    for (const cs of coSlugs) if (nbrs.has(cs)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = slug;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  if (best && bestScore > 0 && !tie) return { slug: best, basis: 'relational' };

  if (opts?.generation) {
    const genMatch = cands.filter((s) => DATA.nodes[s]?.generation === opts.generation);
    if (genMatch.length === 1) return { slug: genMatch[0], basis: 'generation' };
  }
  return { slug: null, basis: 'ambiguous' };
}

export interface GroundedRabbi {
  name: string;
  slug: string | null;
  canonical: string | null;
  generation: string | null;
  genSource: ResolveBasis;
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
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
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
  const node = DATA.nodes[slug];
  if (!node) return null;

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
