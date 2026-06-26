/**
 * @fileoverview Merge a daf's per-section `argument.voices` graphs into ONE
 * daf-wide voice network: rabbis (and collective voices) as nodes, their
 * argumentative relations (opposes / supports / responds-to / cites / resolves)
 * as edges, accumulated across every section of the daf.
 *
 * Each section's `argument.voices` is a section-LOCAL dispute graph (who argues
 * with whom WITHIN that section). The #voices page stitches them: a voice that
 * speaks in three sections is ONE node carrying all three; a relation seen in
 * two sections carries both. The result reads the whole daf as a single
 * conversation, and is the seed for the eventual Talmud-wide rabbi network
 * (aggregate these per-daf graphs across Shas).
 *
 * Pure + DOM-free (so it's unit-testable). `deriveVoiceEdges` repairs each
 * section's edge directions / drops malformed edges BEFORE the merge, so even
 * pre-transform cached graphs stitch correctly.
 */
import { type ArgumentEdge, type ArgumentVoicesData, deriveVoiceEdges } from './voices';

export type VoiceRelationKind = ArgumentEdge['kind'];

/**
 * How the caller classifies a voice name. Injected as a callback so this module
 * stays free of the client generation / voice-group tables — the page supplies
 * the real classifier (rabbi-mark generations + `resolveVoiceGroup`), a test
 * supplies a fake.
 */
export interface VoiceClass {
  /** Generation id (from the rabbi mark) for node coloring; undefined when the
   *  voice isn't a registered rabbi — a collective voice, or a name the rabbi
   *  mark didn't catch. */
  generation?: string;
  /** True for an anonymous / collective voice (Stam, Sages, Tanna Kamma, …) —
   *  rendered without a generation stripe. */
  collective: boolean;
}

export interface SectionVoicesInput {
  /** Section title (the `argument.synthesis` instance label). */
  title: string;
  /** Raw `deps_resolved['argument.voices']` for the section (repaired here). */
  voices: ArgumentVoicesData | null | undefined;
}

export interface DafVoiceNode {
  /** Conventional English name — the dedup key across sections. */
  name: string;
  nameHe?: string;
  generation?: string;
  collective: boolean;
  /** Section titles where this voice speaks, in first-appearance order. */
  sections: string[];
  /** Distinct roles this voice plays across the daf (originator, respondent, …). */
  roles: string[];
}

export interface DafVoiceEdge {
  from: string;
  to: string;
  kind: VoiceRelationKind;
  /** Section titles where this relation occurs. */
  sections: string[];
  /** First note seen for the relation (e.g. "cites baraita"). */
  note?: string;
}

export interface DafVoiceGraph {
  nodes: DafVoiceNode[];
  edges: DafVoiceEdge[];
  /** Per-section breakdown (repaired), in daf order — the detail / audit view. */
  sections: { title: string; voices: ArgumentVoicesData }[];
}

function pushUnique(arr: string[], v: string): void {
  if (v && !arr.includes(v)) arr.push(v);
}

/**
 * Stitch the per-section voice graphs into one daf-wide graph. Nodes are keyed
 * by conventional English `name` (the prompt emits a stable form per voice), so
 * the same rabbi across sections collapses to one node carrying every section,
 * role, and relation. Insertion order is daf order (first appearance), which the
 * renderer reads top-to-bottom.
 */
export function buildDafVoiceGraph(
  sections: SectionVoicesInput[],
  classify: (name: string) => VoiceClass,
): DafVoiceGraph {
  const nodes = new Map<string, DafVoiceNode>();
  const edges = new Map<string, DafVoiceEdge>();
  const outSections: { title: string; voices: ArgumentVoicesData }[] = [];

  for (const sec of sections) {
    const raw = sec.voices;
    if (!raw || !Array.isArray(raw.voices)) continue;
    const repaired = deriveVoiceEdges({
      voices: raw.voices,
      edges: Array.isArray(raw.edges) ? raw.edges : [],
    }) as ArgumentVoicesData;
    outSections.push({ title: sec.title, voices: repaired });

    // Voices first (all registered), so the edge pass below can reject an edge
    // whose endpoint never appeared as a node in any section.
    for (const v of repaired.voices) {
      const name = (v?.name ?? '').trim();
      if (!name) continue;
      let node = nodes.get(name);
      if (!node) {
        const cls = classify(name);
        node = {
          name,
          nameHe: v.nameHe?.trim() || undefined,
          generation: cls.generation,
          collective: cls.collective,
          sections: [],
          roles: [],
        };
        nodes.set(name, node);
      }
      if (!node.nameHe && v.nameHe?.trim()) node.nameHe = v.nameHe.trim();
      pushUnique(node.sections, sec.title);
      if (typeof v.role === 'string' && v.role) pushUnique(node.roles, v.role);
    }

    for (const e of repaired.edges) {
      const from = (e?.from ?? '').trim();
      const to = (e?.to ?? '').trim();
      if (!from || !to || from === to) continue;
      if (!nodes.has(from) || !nodes.has(to)) continue;
      // JSON-encode the triple so names carrying spaces can't collide
      // ("A" + "B C" vs "A B" + "C").
      const key = JSON.stringify([from, to, e.kind]);
      let edge = edges.get(key);
      if (!edge) {
        edge = { from, to, kind: e.kind, sections: [], note: e.note?.trim() || undefined };
        edges.set(key, edge);
      }
      pushUnique(edge.sections, sec.title);
      if (!edge.note && e.note?.trim()) edge.note = e.note.trim();
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], sections: outSections };
}
