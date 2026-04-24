import { createMemo, For, Show, type JSX } from 'solid-js';
import { GENERATIONS, GENERATION_BY_ID, type GenerationId } from './generations';
import rabbiHierarchyData from '../lib/data/rabbi-hierarchy.json';

interface RabbiLite {
  slug?: string | null;
  name: string;
  nameHe: string;
  generation: GenerationId;
}

interface HierarchyNode {
  canonical: string;
  canonicalHe: string | null;
  generation: string;
  region: string | null;
  hasBio: boolean;
  teachers: string[];
  students: string[];
  colleagues: string[];
}

interface HierarchyFile {
  generatedAt: string | null;
  totalNodes: number;
  processedNodes: number;
  nodesWithEdges: number;
  nodes: Record<string, HierarchyNode>;
}

const HIERARCHY = rabbiHierarchyData as unknown as HierarchyFile;

// Generation rows rendered top-to-bottom (chronological). Group amora-ey
// and amora-bavel by numeric index into a single row since their eras
// overlap and the timeline treats them equivalently.
interface Row { id: string; label: string; era: string; color: string; genIds: GenerationId[] }

const ROWS: Row[] = (() => {
  const out: Row[] = [];
  const zugim = GENERATION_BY_ID['zugim'];
  out.push({ id: 'zugim', label: zugim.label, era: zugim.era, color: zugim.color, genIds: ['zugim'] });
  for (let i = 1; i <= 6; i++) {
    const g = GENERATION_BY_ID[`tanna-${i}` as GenerationId];
    out.push({ id: `tanna-${i}`, label: `Tanna ${i}`, era: g.era, color: g.color, genIds: [`tanna-${i}` as GenerationId] });
  }
  for (let i = 1; i <= 5; i++) {
    const ey = GENERATION_BY_ID[`amora-ey-${i}` as GenerationId];
    const bavel = GENERATION_BY_ID[`amora-bavel-${i}` as GenerationId];
    out.push({
      id: `amora-${i}`,
      label: `Amora ${i}`,
      era: ey?.era ?? bavel?.era ?? '',
      color: bavel?.color ?? ey.color,
      genIds: [`amora-ey-${i}` as GenerationId, `amora-bavel-${i}` as GenerationId],
    });
  }
  for (let i = 6; i <= 8; i++) {
    const b = GENERATION_BY_ID[`amora-bavel-${i}` as GenerationId];
    out.push({ id: `amora-${i}`, label: `Amora ${i}`, era: b.era, color: b.color, genIds: [`amora-bavel-${i}` as GenerationId] });
  }
  const savora = GENERATION_BY_ID['savora'];
  out.push({ id: 'savora', label: savora.label, era: savora.era, color: savora.color, genIds: ['savora'] });
  return out;
})();

interface RabbiTreeStripProps {
  rabbis: RabbiLite[];
  onOpenRabbiSlug: (slug: string) => void;
  onHighlightRabbi: (name: string | null) => void;
  hoveredRabbi: string | null;
  activeRabbi: string | null;
}

// Strip showing where the rabbis on the current daf sit in the chain of
// tradition. Each generation row lists the daf's rabbis; when the precompute
// has populated src/lib/data/rabbi-hierarchy.json with teacher/student
// edges, the strip also surfaces each daf-rabbi's immediate teachers and
// students (dimmed) so the local tree fragment is visible. Without edges
// the strip degrades to a chronological list grouped by generation.
export function RabbiTreeStrip(props: RabbiTreeStripProps): JSX.Element {
  const hasEdges = HIERARCHY.nodesWithEdges > 0;

  // Group current-daf rabbis by their generation.
  const byGen = createMemo(() => {
    const map = new Map<GenerationId, RabbiLite[]>();
    for (const r of props.rabbis) {
      const list = map.get(r.generation) ?? [];
      list.push(r);
      map.set(r.generation, list);
    }
    return map;
  });

  // Collect linked rabbis (teachers + students + colleagues of any
  // current-daf rabbi). Each entry keyed by slug, value includes which
  // daf-rabbi slug it relates to and what kind of relationship.
  const linked = createMemo(() => {
    const result = new Map<string, { slug: string; canonical: string; generation: string; kind: 'teacher' | 'student' | 'colleague' }>();
    if (!hasEdges) return result;
    const onDaf = new Set<string>();
    for (const r of props.rabbis) if (r.slug) onDaf.add(r.slug);
    for (const slug of onDaf) {
      const node = HIERARCHY.nodes[slug];
      if (!node) continue;
      for (const tSlug of node.teachers) {
        if (onDaf.has(tSlug)) continue;
        const t = HIERARCHY.nodes[tSlug];
        if (t && !result.has(tSlug)) result.set(tSlug, { slug: tSlug, canonical: t.canonical, generation: t.generation, kind: 'teacher' });
      }
      for (const sSlug of node.students) {
        if (onDaf.has(sSlug)) continue;
        const s = HIERARCHY.nodes[sSlug];
        if (s && !result.has(sSlug)) result.set(sSlug, { slug: sSlug, canonical: s.canonical, generation: s.generation, kind: 'student' });
      }
      for (const cSlug of node.colleagues) {
        if (onDaf.has(cSlug)) continue;
        const c = HIERARCHY.nodes[cSlug];
        if (c && !result.has(cSlug)) result.set(cSlug, { slug: cSlug, canonical: c.canonical, generation: c.generation, kind: 'colleague' });
      }
    }
    return result;
  });

  const linkedByGen = createMemo(() => {
    const map = new Map<string, Array<{ slug: string; canonical: string; kind: 'teacher' | 'student' | 'colleague' }>>();
    for (const e of linked().values()) {
      const list = map.get(e.generation) ?? [];
      list.push({ slug: e.slug, canonical: e.canonical, kind: e.kind });
      map.set(e.generation, list);
    }
    return map;
  });

  return (
    <section
      style={{
        background: '#fcfcf9',
        border: '1px solid #e7e5de',
        'border-radius': '6px',
        padding: '0.6rem 0.7rem',
        'font-size': '0.8rem',
      }}
    >
      <header
        style={{
          display: 'flex',
          'align-items': 'baseline',
          'justify-content': 'space-between',
          'margin-bottom': '0.5rem',
        }}
      >
        <h3 style={{ margin: 0, 'font-size': '0.8rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#666' }}>
          Chain of tradition
        </h3>
        <Show when={!hasEdges}>
          <span style={{ color: '#999', 'font-size': '0.65rem' }} title="Run `bun run build-rabbi-hierarchy` to populate edges">
            no edges
          </span>
        </Show>
      </header>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.15rem' }}>
        <For each={ROWS}>
          {(row) => {
            const genRabbis = () => row.genIds.flatMap((g) => byGen().get(g) ?? []);
            const genLinked = () => row.genIds.flatMap((g) => linkedByGen().get(g) ?? []);
            const hasAny = () => genRabbis().length > 0 || genLinked().length > 0;
            return (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '10px 1fr',
                  gap: '0.35rem',
                  'align-items': 'start',
                  opacity: hasAny() ? 1 : 0.35,
                  padding: '0.15rem 0',
                  'border-bottom': '1px dotted #eee',
                }}
              >
                <span
                  title={`${row.label} · ${row.era}`}
                  style={{
                    width: '10px',
                    height: '10px',
                    'border-radius': '2px',
                    background: row.color,
                    'margin-top': '0.15rem',
                  }}
                />
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.1rem', 'min-width': 0 }}>
                  <div style={{ color: '#999', 'font-size': '0.65rem' }}>{row.label}</div>
                  <Show when={hasAny()}>
                    <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.2rem 0.35rem' }}>
                      <For each={genRabbis()}>
                        {(r) => (
                          <button
                            type="button"
                            onMouseEnter={() => props.onHighlightRabbi(r.name)}
                            onMouseLeave={() => props.onHighlightRabbi(null)}
                            onClick={() => { if (r.slug) props.onOpenRabbiSlug(r.slug); }}
                            disabled={!r.slug}
                            style={{
                              padding: '0.1rem 0.3rem',
                              'font-size': '0.72rem',
                              'line-height': 1.2,
                              border: '1px solid #d6d3d1',
                              'border-radius': '3px',
                              background: props.activeRabbi === r.name ? row.color : (props.hoveredRabbi === r.name ? '#fff7e6' : '#fff'),
                              color: props.activeRabbi === r.name ? '#fff' : '#222',
                              cursor: r.slug ? 'pointer' : 'default',
                              'text-align': 'start',
                              'font-family': 'inherit',
                            }}
                            title={r.slug ? 'Open bio' : 'No bio available'}
                          >
                            {r.name}
                          </button>
                        )}
                      </For>
                      <For each={genLinked()}>
                        {(e) => (
                          <button
                            type="button"
                            onClick={() => props.onOpenRabbiSlug(e.slug)}
                            style={{
                              padding: '0.05rem 0.25rem',
                              'font-size': '0.68rem',
                              'line-height': 1.2,
                              border: '1px dashed #d6d3d1',
                              'border-radius': '3px',
                              background: '#fafaf7',
                              color: '#888',
                              cursor: 'pointer',
                              'text-align': 'start',
                              'font-family': 'inherit',
                            }}
                            title={`${e.kind} of a rabbi on this daf`}
                          >
                            <span style={{ 'font-size': '0.58rem', 'margin-right': '0.15rem' }}>
                              {e.kind === 'teacher' ? '▲' : e.kind === 'student' ? '▼' : '○'}
                            </span>
                            {e.canonical}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={!hasEdges}>
        <p style={{ 'margin-top': '0.5rem', 'font-size': '0.65rem', color: '#999', 'line-height': 1.35 }}>
          Teacher/student edges are precomputed from bios. Run <code>bun run build-rabbi-hierarchy</code> to populate.
        </p>
      </Show>
    </section>
  );
}
