/**
 * What the unreviewed machine readings hold, for the sages overview. Names are the words as the reading
 * wrote them. Nothing here says two names are one sage, so a pair is a count of passages, not of people.
 */

export interface MachineRows {
  /** The focal ref of each machine reading, for example "Arakhin 2a:11". */
  readings: string[];
  /** Kept people, counted by form. */
  peopleByForm: { form: string; n: number }[];
  /** Kept connections, counted by relation and broad type. */
  connectionsByKind: { relation: string; broadType: string; n: number }[];
  /** Name pairs as written, counted by relation. Left in the order the reading gave them. */
  pairs: { a: string; b: string; relation: string; n: number }[];
  /** Items held back, with the reason, grouped. */
  held: { reason: string; n: number }[];
}

export interface MachineSummary {
  revisions: Record<string, string | null>;
  readings: number;
  works: { work: string; readings: number }[];
  people: { total: number; byForm: Record<string, number> };
  connections: {
    total: number;
    byType: Record<string, number>;
    byRelation: { relation: string; n: number }[];
  };
  held: { reason: string; n: number }[];
  pairs: { a: string; b: string; relation: string; n: number; symmetric: boolean }[];
}

const SYMMETRIC = new Set(['spouse_of', 'sibling_of']);

/** "Arakhin 2a:11" -> "Arakhin". The page and line are dropped. */
export function workOf(ref: string): string {
  return ref.replace(/\s+\d+[ab]?(?::.*)?$/, '').trim() || ref;
}

export function summarizeMachine(
  parts: { revision: string | null; name: string; rows: MachineRows }[],
  pairLimit = 30,
): MachineSummary {
  const out: MachineSummary = {
    revisions: {},
    readings: 0,
    works: [],
    people: { total: 0, byForm: {} },
    connections: { total: 0, byType: {}, byRelation: [] },
    held: [],
    pairs: [],
  };
  const works = new Map<string, number>();
  const relations = new Map<string, number>();
  const held = new Map<string, number>();
  const pairs = new Map<string, MachineSummary['pairs'][number]>();
  for (const { name, revision, rows } of parts) {
    out.revisions[name] = revision;
    out.readings += rows.readings.length;
    for (const ref of rows.readings) works.set(workOf(ref), (works.get(workOf(ref)) ?? 0) + 1);
    for (const p of rows.peopleByForm) {
      out.people.total += p.n;
      out.people.byForm[p.form] = (out.people.byForm[p.form] ?? 0) + p.n;
    }
    for (const c of rows.connectionsByKind) {
      out.connections.total += c.n;
      out.connections.byType[c.broadType] = (out.connections.byType[c.broadType] ?? 0) + c.n;
      relations.set(c.relation, (relations.get(c.relation) ?? 0) + c.n);
    }
    for (const p of rows.pairs) {
      const symmetric = SYMMETRIC.has(p.relation);
      const [x, y] = symmetric && p.b < p.a ? [p.b, p.a] : [p.a, p.b];
      const key = JSON.stringify([x, y, p.relation]);
      const found = pairs.get(key);
      if (found) found.n += p.n;
      else pairs.set(key, { a: x, b: y, relation: p.relation, n: p.n, symmetric });
    }
    for (const h of rows.held) held.set(h.reason, (held.get(h.reason) ?? 0) + h.n);
  }
  out.works = [...works]
    .map(([work, readings]) => ({ work, readings }))
    .sort((p, q) => q.readings - p.readings || p.work.localeCompare(q.work));
  out.connections.byRelation = [...relations]
    .map(([relation, n]) => ({ relation, n }))
    .sort((p, q) => q.n - p.n || p.relation.localeCompare(q.relation));
  out.held = [...held]
    .map(([reason, n]) => ({ reason, n }))
    .sort((p, q) => q.n - p.n || p.reason.localeCompare(q.reason));
  out.pairs = [...pairs.values()]
    .sort(
      (p, q) =>
        q.n - p.n ||
        p.a.localeCompare(q.a) ||
        p.b.localeCompare(q.b) ||
        p.relation.localeCompare(q.relation),
    )
    .slice(0, pairLimit);
  return out;
}
