/**
 * Pure shaping for the #network ego view: group the wire edges from
 * GET /api/rabbi-network/:slug (one per (from,to,kind)) into one row per
 * neighboring sage, with per-(kind,direction) chips and a merged daf sample.
 * DOM-free — unit-tested in tests/ego-network.test.ts.
 */

export interface EgoWireEdge {
  from: string;
  to: string;
  kind: string;
  weight: number;
  strict: number;
  dafs: string[];
  direction: 'out' | 'in';
  other: { slug: string; name: string; generation: string | null };
}

export interface EgoWire {
  type: 'rabbi';
  id: string;
  builtAt: number;
  dapim: number;
  node: {
    name: string;
    generation: string | null;
    sections: number;
    dafs: string[];
    curatedEdges?: number;
  };
  edges: EgoWireEdge[];
}

export interface EgoChip {
  kind: string;
  direction: 'out' | 'in';
  weight: number;
  strict: number;
}

export interface EgoRow {
  other: { slug: string; name: string; generation: string | null };
  chips: EgoChip[];
  totalWeight: number;
  totalStrict: number;
  dafs: string[];
}

const ROW_DAF_CAP = 18;

/** One row per neighbor, strongest first; chips sorted by weight within. */
export function groupEgoEdges(edges: readonly EgoWireEdge[]): EgoRow[] {
  const rows = new Map<string, EgoRow>();
  for (const e of edges) {
    if (!e?.other?.slug) continue;
    let row = rows.get(e.other.slug);
    if (!row) {
      row = { other: e.other, chips: [], totalWeight: 0, totalStrict: 0, dafs: [] };
      rows.set(e.other.slug, row);
    }
    row.chips.push({ kind: e.kind, direction: e.direction, weight: e.weight, strict: e.strict });
    row.totalWeight += e.weight;
    row.totalStrict += e.strict;
    for (const d of e.dafs) {
      if (row.dafs.length >= ROW_DAF_CAP) break;
      if (!row.dafs.includes(d)) row.dafs.push(d);
    }
  }
  const out = [...rows.values()];
  for (const r of out) r.chips.sort((a, b) => b.weight - a.weight);
  out.sort((a, b) => b.totalWeight - a.totalWeight || b.totalStrict - a.totalStrict);
  return out;
}

/** "Berakhot 2a" -> { tractate: "Berakhot", page: "2a" } (last space splits). */
export function splitDafLabel(label: string): { tractate: string; page: string } | null {
  const i = label.lastIndexOf(' ');
  if (i <= 0 || i === label.length - 1) return null;
  return { tractate: label.slice(0, i), page: label.slice(i + 1) };
}
