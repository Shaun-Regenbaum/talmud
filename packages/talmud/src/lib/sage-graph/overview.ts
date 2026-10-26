/** The sage network as a whole: the checked connections, and how much of the study is still open. */

export interface OverviewNode {
  id: string;
  label: string;
  labelHe: string | null;
  generation: string | null;
  /** True for a person in the registry. False for a name seen in one passage only. */
  named: boolean;
}

export interface OverviewEdge {
  a: string;
  b: string;
  mode: string;
  /** What the text says happened: stated, occurred, established, failed, detail_disputed. */
  outcome: string;
  ref: string;
}

export interface SageOverview {
  revision: string;
  createdAt: string;
  change: string;
  stats: {
    passages: number;
    passagesWithConnections: number;
    connections: number;
    connectionsStatedOnly: number;
    nodes: number;
    nodesNamed: number;
    nodesWithEra: number;
    components: number;
    largestComponent: number;
    nameMentions: number;
    nameMentionsPlaced: number;
    nameMentionsPending: number;
    proposalsWaiting: number;
    groupsProposed: number;
    identitiesAccepted: number;
    assignmentsSupported: number;
    assignmentsUncertain: number;
    erasReviewed: number;
    withheld: number;
    worksWithConnections: number;
  };
  works: { work: string; connections: number }[];
  nodes: OverviewNode[];
  edges: OverviewEdge[];
}

export interface OverviewInput {
  revision: string;
  createdAt: string;
  change: string;
  counts: { kind: string; decision: string | null; n: number }[];
  /** Raw payloads of the graph_node and connection records. */
  nodePayloads: unknown[];
  edgePayloads: unknown[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export type Era = 'tanna' | 'amora-ey' | 'amora-bavel' | 'other' | 'unknown';

/** Which stretch of history a generation id belongs to, for colouring. */
export function eraOf(generation: string | null): Era {
  if (!generation) return 'unknown';
  if (generation.startsWith('tanna')) return 'tanna';
  if (generation.startsWith('amora-ey')) return 'amora-ey';
  if (generation.startsWith('amora-bavel')) return 'amora-bavel';
  return 'other';
}

/** "Sanhedrin 33a:6" and "Jerusalem Talmud Bava Batra 8:8:2" both name their work. */
export function workOf(ref: string): string {
  return ref.replace(/\s+\d+[ab]?(?::\d+)*$/, '');
}

function parseNode(raw: unknown): OverviewNode | null {
  const p = raw as Record<string, unknown> | null;
  const id = str(p?.id);
  const label = str(p?.label);
  if (!p || !id || !label) return null;
  return {
    id,
    label,
    labelHe: str(p.labelHe),
    generation: str(p.generation),
    named: p.identityResolved === true,
  };
}

function parseEdge(raw: unknown): (OverviewEdge & { passageId: string | null }) | null {
  const p = raw as Record<string, unknown> | null;
  const a = str(p?.a);
  const b = str(p?.b);
  if (!p || !a || !b) return null;
  return {
    a,
    b,
    mode: str(p.mode) ?? 'stated',
    outcome: str(p.outcome) ?? 'stated',
    ref: str(p.ref) ?? '',
    passageId: str(p.passageId),
  };
}

function components(ids: Iterable<string>, edges: { a: string; b: string }[]): number[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(x, root);
    parent.set(root, root);
    return root;
  };
  for (const id of ids) find(id);
  for (const e of edges) parent.set(find(e.a), find(e.b));
  const sizes = new Map<string, number>();
  for (const id of parent.keys()) {
    const root = find(id);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return [...sizes.values()].sort((x, y) => y - x);
}

export function buildSageOverview(input: OverviewInput): SageOverview {
  const count = (kind: string, decision?: string[]) =>
    input.counts
      .filter((c) => c.kind === kind && (!decision || decision.includes(c.decision ?? '')))
      .reduce((sum, c) => sum + c.n, 0);
  const allNodes = new Map<string, OverviewNode>();
  for (const raw of input.nodePayloads) {
    const node = parseNode(raw);
    if (node) allNodes.set(node.id, node);
  }
  // A connection whose end is not a known node cannot be drawn. Drop it rather than guess.
  const parsed = input.edgePayloads
    .map(parseEdge)
    .filter(
      (e): e is NonNullable<typeof e> => e !== null && allNodes.has(e.a) && allNodes.has(e.b),
    );
  const connected = new Set(parsed.flatMap((e) => [e.a, e.b]));
  const nodes = [...allNodes.values()].filter((n) => connected.has(n.id));
  const sizes = components(connected, parsed);
  const byWork = new Map<string, number>();
  for (const e of parsed) byWork.set(workOf(e.ref), (byWork.get(workOf(e.ref)) ?? 0) + 1);
  const all = [...allNodes.values()];
  const mentions = count('name_occurrence');
  const pending = count('name_occurrence', ['page_placement_pending']);
  return {
    revision: input.revision,
    createdAt: input.createdAt,
    change: input.change,
    stats: {
      passages: count('passage'),
      passagesWithConnections: new Set(parsed.map((e) => e.passageId ?? e.ref)).size,
      connections: parsed.length,
      connectionsStatedOnly: parsed.filter((e) => e.outcome === 'stated').length,
      nodes: all.length,
      nodesNamed: all.filter((n) => n.named).length,
      nodesWithEra: all.filter((n) => n.generation).length,
      components: sizes.length,
      largestComponent: sizes[0] ?? 0,
      nameMentions: mentions,
      nameMentionsPlaced: mentions - pending,
      nameMentionsPending: pending,
      proposalsWaiting: count('identity_proposal', ['needs_review']),
      groupsProposed: count('identity_group', ['proposed']),
      identitiesAccepted: count('accepted_identity'),
      assignmentsSupported: count('identity_assignment', ['supported']),
      assignmentsUncertain: count('identity_assignment', ['uncertain']),
      erasReviewed: count('era_assessment'),
      withheld: count('withheld'),
      worksWithConnections: byWork.size,
    },
    works: [...byWork]
      .map(([work, connections]) => ({ work, connections }))
      .sort((x, y) => y.connections - x.connections || x.work.localeCompare(y.work)),
    nodes,
    edges: parsed.map(({ passageId: _passageId, ...edge }) => edge),
  };
}
