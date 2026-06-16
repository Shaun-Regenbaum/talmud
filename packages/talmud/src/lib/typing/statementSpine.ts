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

/**
 * Fold a section's moves + voices into one statement spine. Pure + deterministic
 * given its inputs (the only non-determinism — the voices graph — is an input,
 * already repaired by `deriveVoiceEdges`). See the file header for the model.
 */
export function buildStatementSpine(input: {
  moves: readonly StatementMoveLike[];
  voices?: VoicesGraphLike | null;
}): StatementSpine {
  const { moves, voices } = input;

  // 1. Nodes, in reading order (moveOrder, then segment start, then input order).
  const nodes: StatementNode[] = moves
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

  // 2. Side assignment: a voice's position side ("A"/"B"/…) onto its statements.
  if (Array.isArray(voices?.voices)) {
    for (const v of voices.voices) {
      const name = str(v?.name);
      const side = str(v?.side);
      if (!name || !side) continue;
      for (const n of nodes) if (nodeSpeaksFor(n, name)) n.side = n.side ?? side;
    }
  }

  const links: StatementLink[] = [];
  const seen = new Set<string>();
  const addLink = (l: StatementLink): void => {
    if (l.from === l.to) return; // a statement never links to itself
    const key = `${l.from}|${l.to}|${l.relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(l);
  };

  // 3. Voices overlay FIRST — it is the authoritative signal (the model's actual
  //    voice analysis), so when it and the deterministic role-rule agree on an
  //    opposition the voices-sourced link wins the dedup ("AI keeps final say").
  //    Map each voice edge onto its speakers' representative statements. `opposes`
  //    is gated on BOTH ends being named (anti-hallucination — a Stam-vs-Stam
  //    "dispute" is a fabrication and never branches the spine).
  if (Array.isArray(voices?.edges)) {
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
          !isAnonymousVoice(fromName) &&
          !isAnonymousVoice(toName) &&
          fromNode.named &&
          toNode.named;
        if (!bothNamed) continue;
      }
      addLink({ from: fromNode.id, to: toNode.id, relation, source: 'voices' });
    }
  }

  // 4. Role-derived links (deterministic, no model) fill the gaps the voices
  //    graph didn't express. Walk in order, tracking the most recent claim and
  //    the most recent open question/objection. addLink dedupes, so an opposition
  //    the voices overlay already drew stays voices-sourced.
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

  // 5. A real מחלוקת = an opposition between two named statements.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dispute = links.some(
    (l) => l.relation === 'opposes' && !!byId.get(l.from)?.named && !!byId.get(l.to)?.named,
  );

  return { nodes, links, dispute };
}
