/**
 * @fileoverview The statement spine — ONE graph that folds the per-section
 * VOICES diagram and the DIALECTIC move-flow into a single source of truth.
 *
 * Today a section renders three bespoke ways (a voice-dispute map, a dialectic
 * move-flow, or a narrative), chosen by a gate. But a section is really just an
 * ordered sequence of STATEMENTS (the `argument-move` marks), and the voices
 * graph is an OVERLAY on that sequence: it says which statements oppose / support
 * each other. So:
 *
 *   - NODE  = a statement (an argument-move): its role, speaker, text anchor.
 *   - LINK  = a relation between two statements. Two provenances:
 *       · `source: 'role'`   — derived deterministically from move role + order
 *         (an objection opposes the claim before it; a resolution resolves the
 *         open question; an answer responds to the question). Precision-first,
 *         no model.
 *       · `source: 'voices'` — the per-section `argument.voices` edges, mapped
 *         DOWN from voice granularity onto the statements those voices speak.
 *
 * The same graph degenerates by TOPOLOGY, which is what lets one renderer
 * replace three: a linear sugya is a straight chain (the old DIALECTIC flow); a
 * מחלוקת branches where two named statements `oppose` (the old VOICES map); a
 * story is a chain of beats (the old narrative). `dispute` says which.
 *
 * `dispute` reuses the anti-hallucination rule from typing/profile.ts: an
 * opposition only counts when BOTH ends are NAMED speakers (`rabbiNames`
 * non-empty). An anonymous Stam section can't host a real מחלוקת, so a stray
 * `opposes` edge there is a model fabrication and must not branch the spine.
 *
 * Pure + DOM-free + env-free → lives in src/lib, unit-tested, and runs on either
 * side (the worker builds it as the canonical artifact the #spine view pulls;
 * the sidebar will later pull the same shape instead of re-deriving three views).
 *
 * TWO BUILDERS, same node + link model:
 *   - `buildStatementSpine`  — PER SECTION (the shipped behaviour). One-slot
 *     trackers: a move links only to the single most-recent claim / open / question.
 *   - `buildDafSpine`        — DAF-GLOBAL (the exploration). Walks ALL the daf's
 *     moves in reading order with a STACK of open moves, so an answer can resolve
 *     a non-adjacent question and an objection in one section can attach to the
 *     claim it actually challenges in another. A faint `continues` backbone links
 *     consecutive moves so nothing floats. This is the render-only ($0) fix for
 *     technical sugyot whose dialectic is fragmented one-move-per-section, where a
 *     section-local walk has nothing to connect. See Sandbox/2026-06-16-edge-exploration.
 */

/** The dialectical role of a statement (mirrors the `argument-move` role enum;
 *  left open to a string so an unknown role from an older cache still renders). */
export type StatementRole =
  | 'opening'
  | 'question'
  | 'answer'
  | 'objection'
  | 'rejection'
  | 'supporting-evidence'
  | 'resolution'
  | 'digression'
  | 'shift'
  | 'other'
  | (string & {});

/** Relation between two statements. A subset of the unified `LinkRelation`
 *  vocabulary plus the move-local `responds-to` / `opposes` that live below
 *  coord granularity (which is exactly why they never became Links). */
export type StatementRelation =
  | 'continues'
  | 'responds-to'
  | 'opposes'
  | 'supports'
  | 'resolves'
  | 'cites';

export interface StatementNode {
  /** The move id (`{sectionStart}-{sectionEnd}_{order}`); falls back to the order. */
  id: string;
  /** Position within the section (moveOrder), used for the linear backbone. */
  order: number;
  role: StatementRole;
  /** The voice label as the move carries it (e.g. "Rabbi Yochanan", "Stam"). */
  speaker: string;
  /** Resolved named speakers; empty for anonymous Stam / "the Gemara" moves. */
  rabbiNames: string[];
  /** True when this statement has a named speaker — the dispute gate's per-node leg. */
  named: boolean;
  /** Position side ("A" | "B" | "support-A" | …) from the voices graph, when the
   *  speaker matched a voice. Drives which limb a branching renderer places it on. */
  side?: string;
  excerpt?: string;
  summary?: string;
  /** Text anchor — the segment range, for click-to-highlight in the reader. */
  startSegIdx: number;
  endSegIdx: number;
  /** Finer in-segment token range (when the move carries it), so highlighting a
   *  statement lands on its exact words rather than the whole segment. */
  tokenStart?: number;
  tokenEnd?: number;
}

export interface StatementLink {
  /** Source node id. */
  from: string;
  /** Target node id. */
  to: string;
  relation: StatementRelation;
  /** Where the link came from — a deterministic role derivation, or the
   *  (LLM-produced) voices graph mapped down to statements. */
  source: 'role' | 'voices';
  note?: string;
}

export interface StatementSpine {
  nodes: StatementNode[];
  links: StatementLink[];
  /** True when ≥1 `opposes` link holds between two NAMED statements — a real
   *  מחלוקת. A branching (voices) overlay renders only then; otherwise the spine
   *  is a linear progression (dialectic) or a narrative chain. */
  dispute: boolean;
}

/** Minimal `argument-move` shape this builder needs (a structural subset of the
 *  mark instance — keeps the builder decoupled from the full mark type). */
export interface StatementMoveLike {
  startSegIdx: number;
  endSegIdx: number;
  fields: {
    id?: unknown;
    moveOrder?: unknown;
    role?: unknown;
    voice?: unknown;
    rabbiNames?: unknown;
    excerpt?: unknown;
    summary?: unknown;
    tokenStart?: unknown;
    tokenEnd?: unknown;
  };
}

/** Minimal `argument.voices` shape — `voices` carry a `side`, `edges` carry the
 *  opposition. Pass the post-`deriveVoiceEdges` graph (directions repaired). */
export interface VoicesGraphLike {
  voices?: { name?: unknown; side?: unknown }[];
  edges?: { from?: unknown; to?: unknown; kind?: unknown }[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
const norm = (s: string): string => s.toLowerCase();

/** A voice name that denotes the anonymous voice, never a named disputant. */
function isAnonymousVoice(name: string): boolean {
  const n = norm(name);
  return (
    !n ||
    n === 'stam' ||
    n.includes('gemara') ||
    n.includes('stam') ||
    n === 'the gemara' ||
    n === 'anonymous'
  );
}

/** Does a statement node speak for voice `voiceName`? Matches the move's voice
 *  label or any of its named speakers, case-insensitively. */
function nodeSpeaksFor(node: StatementNode, voiceName: string): boolean {
  const want = norm(voiceName);
  if (!want) return false;
  if (norm(node.speaker) === want) return true;
  return node.rabbiNames.some((r) => norm(r) === want);
}

/** Map a voice name to a representative statement (the FIRST in reading order that
 *  speaks for it). The opening statement of a position is the natural endpoint
 *  for an opposition edge. null when no statement matches the voice. */
function representativeNode(nodes: StatementNode[], voiceName: string): StatementNode | null {
  for (const n of nodes) if (nodeSpeaksFor(n, voiceName)) return n;
  return null;
}

const VOICE_TO_STATEMENT: Record<string, StatementRelation> = {
  opposes: 'opposes',
  supports: 'supports',
  resolves: 'resolves',
  cites: 'cites',
  'responds-to': 'responds-to',
};

/** A role that asserts a position (a claim something can object to / resolve). */
function isClaim(role: string): boolean {
  return role === 'opening' || role === 'answer' || role === 'supporting-evidence';
}
/** A role that opens something a later move can resolve. */
function isOpen(role: string): boolean {
  return role === 'question' || role === 'objection';
}

/** Build the statement nodes from a set of moves, in reading order (moveOrder,
 *  then segment start, then input order). Shared by both builders so they never
 *  drift on the node shape. */
function buildStatementNodes(moves: readonly StatementMoveLike[]): StatementNode[] {
  return moves
    .map((m, i) => {
      const f = m.fields ?? {};
      const order = typeof f.moveOrder === 'number' ? f.moveOrder : i;
      const rabbiNames = strArr(f.rabbiNames);
      const id = str(f.id) || `${m.startSegIdx}-${m.endSegIdx}_${order}`;
      return {
        id,
        order,
        role: (str(f.role) || 'other') as StatementRole,
        speaker: str(f.voice),
        rabbiNames,
        named: rabbiNames.length > 0,
        excerpt: str(f.excerpt) || undefined,
        summary: str(f.summary) || undefined,
        startSegIdx: m.startSegIdx,
        endSegIdx: m.endSegIdx,
        tokenStart: typeof f.tokenStart === 'number' ? f.tokenStart : undefined,
        tokenEnd: typeof f.tokenEnd === 'number' ? f.tokenEnd : undefined,
        _i: i,
      };
    })
    .sort((a, b) => a.order - b.order || a.startSegIdx - b.startSegIdx || a._i - b._i)
    .map(({ _i, ...n }) => n);
}

/** Assign each voice's position side ("A"/"B"/…) onto the statements it speaks. */
function applyVoiceSides(nodes: StatementNode[], voices?: VoicesGraphLike | null): void {
  if (!Array.isArray(voices?.voices)) return;
  for (const v of voices.voices) {
    const name = str(v?.name);
    const side = str(v?.side);
    if (!name || !side) continue;
    for (const n of nodes) if (nodeSpeaksFor(n, name)) n.side = n.side ?? side;
  }
}

/** Map the voices graph's edges onto statement links via each voice's
 *  representative statement. `opposes` is gated on BOTH ends being named
 *  (anti-hallucination). Scoped to `nodes` (the section it belongs to). */
function applyVoiceEdges(
  nodes: StatementNode[],
  voices: VoicesGraphLike | null | undefined,
  addLink: (l: StatementLink) => void,
): void {
  if (!Array.isArray(voices?.edges)) return;
  for (const e of voices.edges) {
    const relation = VOICE_TO_STATEMENT[str(e?.kind)];
    if (!relation) continue;
    const fromName = str(e?.from);
    const toName = str(e?.to);
    if (!fromName || !toName) continue;
    const fromNode = representativeNode(nodes, fromName);
    const toNode = representativeNode(nodes, toName);
    if (!fromNode || !toNode) continue; // voice with no statement here → drop
    if (relation === 'opposes') {
      const bothNamed =
        !isAnonymousVoice(fromName) && !isAnonymousVoice(toName) && fromNode.named && toNode.named;
      if (!bothNamed) continue;
    }
    addLink({ from: fromNode.id, to: toNode.id, relation, source: 'voices' });
  }
}

function makeAddLink(links: StatementLink[]): (l: StatementLink) => void {
  const seen = new Set<string>();
  return (l: StatementLink) => {
    if (l.from === l.to) return; // a statement never links to itself
    const key = `${l.from}|${l.to}|${l.relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(l);
  };
}

function computeDispute(nodes: StatementNode[], links: StatementLink[]): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return links.some(
    (l) => l.relation === 'opposes' && !!byId.get(l.from)?.named && !!byId.get(l.to)?.named,
  );
}

/**
 * Fold a section's moves + voices into one statement spine. Pure + deterministic
 * given its inputs (the only non-determinism — the voices graph — is an input,
 * already repaired by `deriveVoiceEdges`). See the file header for the model.
 *
 * PER-SECTION (shipped) walk: single-slot trackers — a move links only to the
 * single most-recent claim / open / question. Unchanged behaviour.
 */
export function buildStatementSpine(input: {
  moves: readonly StatementMoveLike[];
  voices?: VoicesGraphLike | null;
}): StatementSpine {
  const { moves, voices } = input;
  const nodes = buildStatementNodes(moves);
  applyVoiceSides(nodes, voices);

  const links: StatementLink[] = [];
  const addLink = makeAddLink(links);

  // Voices overlay FIRST — the authoritative signal (AI keeps final say); when it
  // and a deterministic role-rule agree, the voices-sourced link wins the dedup.
  applyVoiceEdges(nodes, voices, addLink);

  // Role-derived links (deterministic) fill the gaps, tracking the SINGLE most
  // recent claim / open / question.
  let lastClaim: StatementNode | null = null;
  let lastOpen: StatementNode | null = null;
  let lastQuestion: StatementNode | null = null;
  for (const n of nodes) {
    if ((n.role === 'objection' || n.role === 'rejection') && lastClaim) {
      addLink({ from: n.id, to: lastClaim.id, relation: 'opposes', source: 'role' });
    }
    if (n.role === 'resolution' && lastOpen) {
      addLink({ from: n.id, to: lastOpen.id, relation: 'resolves', source: 'role' });
    }
    if (n.role === 'answer' && lastQuestion) {
      addLink({ from: n.id, to: lastQuestion.id, relation: 'responds-to', source: 'role' });
    }
    if (isClaim(n.role)) lastClaim = n;
    if (isOpen(n.role)) lastOpen = n;
    if (n.role === 'question') lastQuestion = n;
  }

  return { nodes, links, dispute: computeDispute(nodes, links) };
}

/** A daf's section, as `buildDafSpine` consumes it: the section's moves and its
 *  (already-repaired) voices graph. Voices stay SECTION-scoped — a voice edge only
 *  maps onto statements within its own section — while the role walk goes global. */
export interface DafSection {
  moves: readonly StatementMoveLike[];
  voices?: VoicesGraphLike | null;
}

/** Largest segment gap allowed between a move and the antecedent it links to.
 *  The stack already picks the nearest UNRESOLVED open/claim, which is the real
 *  precision mechanism; this is a backstop so a long-dead open move on the stack
 *  can't attract a far-away answer across half the daf (precision over recall —
 *  a float beats a wrong arrow). Generous: dialectic rarely reaches back further. */
const MAX_ANTECEDENT_GAP = 14;

/**
 * DAF-GLOBAL statement spine: the exploration's "whole-page" build. Concatenates
 * every section's statements into one reading-ordered sequence and walks it with a
 * STACK of open moves + claims, so:
 *   - an `answer` responds to the nearest still-open question (possibly several
 *     moves / sections back), popping it;
 *   - a `resolution` resolves the nearest still-open question/objection, popping it;
 *   - an `objection`/`rejection` `opposes` the nearest open claim;
 *   - `supporting-evidence` `supports` the nearest open claim;
 *   - a faint `continues` backbone links each move to its predecessor UNLESS a
 *     typed edge already connects that pair — so nothing floats, but typed edges
 *     read as the signal.
 * Voices overlay is applied per section FIRST (authoritative); a typed role edge
 * never overwrites it. A cross-move antecedent beyond MAX_ANTECEDENT_GAP segments
 * is skipped (precision backstop). Pure + deterministic.
 */
export function buildDafSpine(sections: readonly DafSection[]): StatementSpine {
  const links: StatementLink[] = [];
  const addLink = makeAddLink(links);

  // Per-section nodes so the voices overlay scopes correctly, then concatenate.
  const all: StatementNode[] = [];
  for (const sec of sections) {
    const nodes = buildStatementNodes(sec.moves);
    applyVoiceSides(nodes, sec.voices);
    applyVoiceEdges(nodes, sec.voices, addLink);
    all.push(...nodes);
  }
  // Global reading order across the whole daf.
  all.sort(
    (a, b) => a.startSegIdx - b.startSegIdx || a.endSegIdx - b.endSegIdx || a.order - b.order,
  );

  // The segment gap between two (possibly multi-segment) ranges: 0 if they touch
  // or overlap, else the distance between their nearest edges. (The earlier
  // double-Math.abs form was wrong — it rejected adjacent/overlapping ranges.)
  const withinGap = (a: StatementNode, b: StatementNode): boolean => {
    const gap =
      a.startSegIdx > b.endSegIdx
        ? a.startSegIdx - b.endSegIdx
        : b.startSegIdx > a.endSegIdx
          ? b.startSegIdx - a.endSegIdx
          : 0;
    return gap <= MAX_ANTECEDENT_GAP;
  };

  // Stack-based role walk over the whole daf. `openStack` holds unresolved
  // questions/objections (most-recent last); `claimStack` holds claims.
  const openStack: StatementNode[] = [];
  const claimStack: StatementNode[] = [];
  const popNearest = (
    stack: StatementNode[],
    n: StatementNode,
    pred: (m: StatementNode) => boolean,
  ): StatementNode | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (pred(stack[i]) && withinGap(n, stack[i])) {
        return stack.splice(i, 1)[0];
      }
    }
    return null;
  };
  const peekNearest = (stack: StatementNode[], n: StatementNode): StatementNode | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (withinGap(n, stack[i])) return stack[i];
    }
    return null;
  };

  // Abandon any open move OLDER than `kept`: answering/resolving a question means
  // the discussion has moved past everything before it, so a still-dangling older
  // question must not be grabbed by a later unit's answer (the parallel-units
  // false-positive: e.g. bava kamma 3a §5's unanswered "toladah of regel?" question
  // was being caught by §6's second answer about bor).
  const dropOlderThan = (kept: StatementNode): void => {
    for (let i = openStack.length - 1; i >= 0; i--) {
      if (openStack[i].startSegIdx < kept.startSegIdx) openStack.splice(i, 1);
    }
  };

  for (const n of all) {
    if (n.role === 'answer') {
      const q = popNearest(openStack, n, (m) => m.role === 'question');
      if (q) {
        addLink({ from: n.id, to: q.id, relation: 'responds-to', source: 'role' });
        dropOlderThan(q);
      }
    } else if (n.role === 'resolution') {
      const o = popNearest(openStack, n, () => true);
      if (o) addLink({ from: n.id, to: o.id, relation: 'resolves', source: 'role' });
      // A resolution CLOSES the sub-discussion. Clear both stacks so the next unit
      // starts fresh — without this, on a "parallel units" sugya (each verse /
      // category its own objection→answer→resolution) every following objection
      // mechanically grabbed the PREVIOUS unit's claim and a stale open lingered to
      // catch a later answer, manufacturing a cascade of false cross-section edges
      // (the precision audit's dominant failure). Precision over recall.
      openStack.length = 0;
      claimStack.length = 0;
    } else if (n.role === 'objection' || n.role === 'rejection') {
      const c = peekNearest(claimStack, n);
      if (c) addLink({ from: n.id, to: c.id, relation: 'opposes', source: 'role' });
    } else if (n.role === 'supporting-evidence') {
      const c = peekNearest(claimStack, n);
      if (c) addLink({ from: n.id, to: c.id, relation: 'supports', source: 'role' });
    }
    if (isOpen(n.role)) openStack.push(n);
    if (isClaim(n.role)) claimStack.push(n);
  }

  // A typed (non-continues) link already drawn between two nodes, either direction
  // — so the backbone doesn't double a pair the dialectic already connects. Built
  // AFTER the role walk so it includes the role-derived links, not just voices.
  const typedPair = new Set<string>();
  for (const l of links) {
    typedPair.add(`${l.from}|${l.to}`);
    typedPair.add(`${l.to}|${l.from}`);
  }

  // Continues backbone: consecutive moves, unless a typed edge already links them.
  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1];
    const cur = all[i];
    if (typedPair.has(`${cur.id}|${prev.id}`)) continue;
    addLink({ from: cur.id, to: prev.id, relation: 'continues', source: 'role' });
  }

  return { nodes: all, links, dispute: computeDispute(all, links) };
}

/** A daf section with its segment range + index, so cross-section links can be
 *  attributed back to the sections they connect. */
export interface DafSectionRanged extends DafSection {
  index: number;
  startSegIdx: number;
  endSegIdx: number;
}

/** Relations lifted to the section grain. ONLY the question→answer relations
 *  (`responds-to`) and resolution relations (`resolves`) — these are the ones a
 *  precision audit found reliable across sections (they consume their antecedent
 *  off the open-stack, so they can't pile up). Cross-section `opposes` / `supports`
 *  are DELIBERATELY excluded: on a "parallel units" sugya they fired ~70% false
 *  (an objection grabbing the previous unit's claim). Revisit once the walk and a
 *  topical-engagement check make them reliable. `continues` is excluded too (the
 *  daf order already shows "the next section"). */
const LIFTED_CROSS_SECTION: ReadonlySet<StatementRelation> = new Set<StatementRelation>([
  'responds-to',
  'resolves',
]);

/** A section→section connection derived from the statement dialectic: a cross-
 *  section question→answer / resolution link lifted to the section grain. The
 *  `argument-overview.flow` AI producer often returns NO section edges on a long
 *  technical sugya even though one section plainly answers/resolves another; these
 *  deterministic, role-derived edges fill that silence so the map connects the
 *  boxes instead of showing a disconnected row. Deduped by (fromSection,
 *  toSection, relation). The consumer maps `relation` onto its FlowConnection kind
 *  and merges these UNDER the AI flow (AI keeps final say on any pair it covers). */
export function crossSectionStatementFlow(
  sections: readonly DafSectionRanged[],
): { fromSection: number; toSection: number; relation: StatementRelation }[] {
  const daf = buildDafSpine(sections);
  const byId = new Map(daf.nodes.map((n) => [n.id, n]));
  const sectionOf = (id: string): number => {
    const n = byId.get(id);
    if (!n) return -1;
    const hit = sections.find(
      (s) => n.startSegIdx >= s.startSegIdx && n.startSegIdx <= s.endSegIdx,
    );
    return hit ? hit.index : -1;
  };
  const out: { fromSection: number; toSection: number; relation: StatementRelation }[] = [];
  const seen = new Set<string>();
  for (const l of daf.links) {
    if (!LIFTED_CROSS_SECTION.has(l.relation)) continue; // only the reliable relations
    const fromSection = sectionOf(l.from);
    const toSection = sectionOf(l.to);
    if (fromSection < 0 || toSection < 0 || fromSection === toSection) continue;
    const key = `${fromSection}|${toSection}|${l.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fromSection, toSection, relation: l.relation });
  }
  return out;
}
