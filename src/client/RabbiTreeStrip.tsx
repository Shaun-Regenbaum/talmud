import { createMemo, createSignal, createEffect, For, Show, onCleanup, type JSX } from 'solid-js';
import { GENERATION_BY_ID, type GenerationId } from './generations';
import rabbiHierarchyData from '../lib/data/rabbi-hierarchy.json';

interface RabbiLite {
  slug?: string | null;
  name: string;
  nameHe: string;
  generation: GenerationId;
  region?: 'israel' | 'bavel' | null;
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

// Four broad eras. The sketch shows these as the vertical skeleton of the
// tree — rabbis anchor to their era, connector lines cross eras to
// represent teacher→student lineage.
type EraId = 'zugim' | 'tannaim' | 'amoraim' | 'savoraim';
interface Era {
  id: EraId;
  label: string;
  color: string;
  generationIds: GenerationId[];
}

// Same four eras the generation timeline uses. Region (E.Y. vs Bavel)
// is surfaced per-pill via a small B/E badge rather than by splitting
// the era — the timeline already collapses regions together per row,
// and splitting felt heavy in such a narrow strip.
const ERAS: Era[] = [
  { id: 'zugim',    label: 'Zugim',    color: GENERATION_BY_ID['zugim'].color, generationIds: ['zugim'] },
  { id: 'tannaim',  label: 'Tannaim',  color: GENERATION_BY_ID['tanna-4'].color,
    generationIds: ['tanna-1','tanna-2','tanna-3','tanna-4','tanna-5','tanna-6'] },
  { id: 'amoraim',  label: 'Amoraim',  color: GENERATION_BY_ID['amora-bavel-4'].color,
    generationIds: [
      'amora-ey-1','amora-ey-2','amora-ey-3','amora-ey-4','amora-ey-5',
      'amora-bavel-1','amora-bavel-2','amora-bavel-3','amora-bavel-4',
      'amora-bavel-5','amora-bavel-6','amora-bavel-7','amora-bavel-8',
    ] },
  { id: 'savoraim', label: 'Savoraim', color: GENERATION_BY_ID['savora'].color, generationIds: ['savora'] },
];

// Derive region from the generation ID when we don't have an explicit
// region field (fallback for linked rabbis that come from the hierarchy
// JSON but where region is null).
function regionForGeneration(gen: string): 'israel' | 'bavel' | null {
  if (gen.startsWith('amora-ey')) return 'israel';
  if (gen.startsWith('amora-bavel')) return 'bavel';
  return null;
}

function eraForGeneration(gen: string): EraId | null {
  for (const e of ERAS) {
    if ((e.generationIds as string[]).includes(gen)) return e.id;
  }
  return null;
}

interface RabbiTreeStripProps {
  rabbis: RabbiLite[];
  onOpenRabbiSlug: (slug: string) => void;
  /** Transient hover highlight on the daf — does NOT open the sidebar. */
  onHoverRabbi: (name: string | null) => void;
  hoveredRabbi: string | null;
  activeRabbi: string | null;
  /** Cross-highlight: when the user opens a section/halacha/aggadata in the
   *  sidebar or clicks a city/region on the map, these rabbi names light
   *  up in the tree and their connections expand. Empty → default view
   *  (only on-daf rabbis and their inter-connections). */
  focusedRabbiNames?: string[];
}

// Connector we want to draw between two rabbi pills. Direction=teacher
// means `from` taught `to`; `colleague` is bidirectional.
interface Connector { fromSlug: string; toSlug: string; direction: 'teacher' | 'colleague' }

// Rabbi entry as we render it in a column — either an on-daf rabbi or a
// linked teacher/student/colleague that isn't on the daf but is related
// to someone who is.
interface ColumnEntry {
  slug: string | null;
  canonical: string;
  generation: string;
  region: 'israel' | 'bavel' | null;
  onDaf: boolean;
  role?: 'teacher' | 'student' | 'colleague';  // only set when !onDaf
}

export function RabbiTreeStrip(props: RabbiTreeStripProps): JSX.Element {
  const hasEdges = HIERARCHY.nodesWithEdges > 0;

  // Set of slugs for rabbis on this daf — used when resolving connectors.
  const onDafSlugs = createMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of props.rabbis) if (r.slug) s.add(r.slug);
    return s;
  });

  // Which on-daf rabbis are currently "focused"? Their connections get
  // expanded in the tree. Focus sources: click-locked active rabbi,
  // or rabbi names surfaced from an open argument section or a clicked
  // city/region on the map. Hover is deliberately NOT a focus source —
  // expanding on hover caused the tree to restructure while the user
  // was moving their cursor, yanking the hovered pill out from under
  // them. Hover still lights up the rabbi on the daf.
  const focusedNames = createMemo<Set<string>>(() => {
    const s = new Set<string>();
    if (props.activeRabbi) s.add(props.activeRabbi);
    for (const n of props.focusedRabbiNames ?? []) s.add(n);
    return s;
  });

  // Set of on-daf rabbi slugs whose 1-hop edges should be expanded.
  const focusedSlugs = createMemo<Set<string>>(() => {
    const focus = focusedNames();
    if (focus.size === 0) return new Set();
    const out = new Set<string>();
    for (const r of props.rabbis) {
      if (r.slug && focus.has(r.name)) out.add(r.slug);
    }
    return out;
  });

  // Build column entries per era. On-daf rabbis always render. Linked
  // rabbis (teachers/students/colleagues from hierarchy.json) render
  // only when the on-daf rabbi they link to is currently focused — this
  // keeps the default view compact and lets the user drill in by
  // hovering, clicking a rabbi, or opening a section in the sidebar.
  const entriesByEra = createMemo<Record<EraId, ColumnEntry[]>>(() => {
    const out: Record<EraId, ColumnEntry[]> = { zugim: [], tannaim: [], amoraim: [], savoraim: [] };
    const seenBySlug = new Set<string>();

    for (const r of props.rabbis) {
      const era = eraForGeneration(r.generation);
      if (!era) continue;
      const key = r.slug ?? `name:${r.name}`;
      if (seenBySlug.has(key)) continue;
      seenBySlug.add(key);
      const region = r.region ?? regionForGeneration(r.generation);
      out[era].push({ slug: r.slug ?? null, canonical: r.name, generation: r.generation, region, onDaf: true });
    }

    if (hasEdges && focusedSlugs().size > 0) {
      for (const r of props.rabbis) {
        if (!r.slug || !focusedSlugs().has(r.slug)) continue;
        const node = HIERARCHY.nodes[r.slug];
        if (!node) continue;
        const addLinked = (linkedSlug: string, role: 'teacher' | 'student' | 'colleague') => {
          if (seenBySlug.has(linkedSlug)) return;
          const n = HIERARCHY.nodes[linkedSlug];
          if (!n) return;
          const era = eraForGeneration(n.generation);
          if (!era) return;
          seenBySlug.add(linkedSlug);
          const region = (n.region === 'israel' || n.region === 'bavel') ? n.region : regionForGeneration(n.generation);
          out[era].push({ slug: linkedSlug, canonical: n.canonical, generation: n.generation, region, onDaf: false, role });
        };
        // Cap at 2 each direction — a rabbi with 12 students floods the
        // tree and obscures the shape of the connections. Users can
        // still reach the full list via the rabbi's bio card.
        for (const t of node.teachers.slice(0, 2)) addLinked(t, 'teacher');
        for (const s of node.students.slice(0, 2)) addLinked(s, 'student');
        for (const c of node.colleagues.slice(0, 2)) addLinked(c, 'colleague');
      }
    }

    return out;
  });

  // All teacher-student + colleague edges that connect rabbis currently
  // rendered in any column. These get drawn as SVG lines. In the default
  // view (no focus) we only draw edges between on-daf rabbis; when a
  // rabbi is focused we also draw lines to their expanded connections.
  const connectors = createMemo<Connector[]>(() => {
    if (!hasEdges) return [];
    const rendered = new Set<string>();
    for (const era of ERAS) for (const e of entriesByEra()[era.id]) if (e.slug) rendered.add(e.slug);

    const out: Connector[] = [];
    const seen = new Set<string>();
    const pushIfRendered = (a: string, b: string, direction: 'teacher' | 'colleague') => {
      if (!rendered.has(a) || !rendered.has(b)) return;
      const k = direction === 'teacher' ? `T:${a}>${b}` : `C:${[a,b].sort().join('|')}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ fromSlug: a, toSlug: b, direction });
    };
    for (const r of props.rabbis) {
      if (!r.slug) continue;
      const node = HIERARCHY.nodes[r.slug];
      if (!node) continue;
      for (const t of node.teachers) pushIfRendered(t, r.slug, 'teacher');
      for (const s of node.students) pushIfRendered(r.slug, s, 'teacher');
      for (const c of node.colleagues) pushIfRendered(r.slug, c, 'colleague');
    }
    return out;
  });

  // DOM refs, one per rendered pill. Keyed by slug. Used to measure
  // positions for the SVG overlay after layout settles.
  const pillRefs = new Map<string, HTMLButtonElement>();
  const registerPill = (slug: string | null, el: HTMLButtonElement | null) => {
    if (!slug) return;
    if (el) pillRefs.set(slug, el);
    else pillRefs.delete(slug);
  };

  // After DOM updates, compute pixel-space endpoints for each connector
  // in coordinates relative to the root container, so the SVG overlay
  // can render lines that track the pill positions even when the strip
  // is scrolled internally.
  const [endpoints, setEndpoints] = createSignal<Array<{
    x1: number; y1: number; x2: number; y2: number;
    direction: 'teacher' | 'colleague';
  }>>([]);
  let rootEl: HTMLElement | undefined;

  const recalc = () => {
    if (!rootEl) { setEndpoints([]); return; }
    const rootRect = rootEl.getBoundingClientRect();
    const next = [] as ReturnType<typeof endpoints>;
    for (const c of connectors()) {
      const a = pillRefs.get(c.fromSlug);
      const b = pillRefs.get(c.toSlug);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      next.push({
        // Exit the RIGHT edge of each pill; lines route through a
        // dedicated connection lane reserved on the right of the
        // section so they never cross other pills.
        x1: ar.right - rootRect.left,
        y1: ar.top - rootRect.top + ar.height / 2,
        x2: br.right - rootRect.left,
        y2: br.top - rootRect.top + br.height / 2,
        direction: c.direction,
      });
    }
    setEndpoints(next);
  };

  createEffect(() => {
    // Depend on the connector list + entries so recalc fires on data
    // change. The rAF delay lets the DOM finish layout before we read.
    void connectors();
    void entriesByEra();
    const id = requestAnimationFrame(recalc);
    onCleanup(() => cancelAnimationFrame(id));
  });

  createEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => recalc();
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  return (
    <section
      ref={(el) => { rootEl = el; }}
      style={{
        position: 'relative',
        background: '#fcfcf9',
        border: '1px solid #e7e5de',
        'border-radius': '6px',
        // Right padding reserves the "connection lane" — a vertical
        // strip on the right side of the section where all connector
        // lines route so they never overlap pills or era bars.
        padding: '0.6rem 2.25rem 0.6rem 0.7rem',
      }}
    >
      <header style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', 'margin-bottom': '0.35rem' }}>
        <h3 style={{ margin: 0, 'font-size': '0.8rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#666' }}>
          Chain of tradition
        </h3>
        <Show when={!hasEdges}>
          <span style={{ color: '#999', 'font-size': '0.65rem' }} title="Run `bun run build-rabbi-hierarchy` to populate edges">
            no edges
          </span>
        </Show>
      </header>
      {/* Legend. Our hierarchy only distinguishes two relationship
          kinds: teacher↔student (a directed chain of transmission) and
          contemporary (anyone attested to debate / work alongside the
          rabbi, but not their teacher or student). Familial ties are
          not separately tracked — a father who taught his son shows up
          as a teacher relationship if the bio says so. */}
      <Show when={hasEdges}>
        <div style={{ display: 'flex', gap: '0.55rem', 'font-size': '0.6rem', color: '#777', 'margin-bottom': '0.45rem', 'flex-wrap': 'wrap' }}>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.2rem' }}>
            <svg width="18" height="6" aria-hidden="true">
              <line x1="1" y1="3" x2="14" y2="3" stroke="#555" stroke-width="1" />
              <path d="M12,1 L16,3 L12,5 z" fill="#555" />
            </svg>
            teacher → student
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.2rem' }}>
            <svg width="18" height="6" aria-hidden="true">
              <line x1="1" y1="3" x2="17" y2="3" stroke="#999" stroke-width="1" stroke-dasharray="3 3" />
            </svg>
            contemporary
          </span>
        </div>
      </Show>

      {/* Era skeleton: a vertical strip of four era bars with rabbi
          columns flanking the right. Matches the sketch's spine. */}
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
        <For each={ERAS}>
          {(era) => {
            const entries = () => entriesByEra()[era.id];
            const hasContent = () => entries().length > 0;
            return (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '16px 1fr',
                  gap: '0.5rem',
                  opacity: hasContent() ? 1 : 0.35,
                }}
              >
                {/* Era bar — a vertical colored strip with the era name
                    rotated to read bottom-up, matching the sketch. */}
                <div
                  style={{
                    background: era.color,
                    border: '1px solid #2a2a2a',
                    'border-radius': '2px',
                    'min-height': '46px',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    padding: '0.3rem 0',
                  }}
                  title={era.label}
                >
                  <span
                    style={{
                      transform: 'rotate(180deg)',
                      'writing-mode': 'vertical-rl',
                      color: '#fff',
                      'font-size': '0.65rem',
                      'font-weight': 600,
                      'letter-spacing': '0.1em',
                      'text-transform': 'uppercase',
                    }}
                  >
                    {era.label}
                  </span>
                </div>

                {/* Rabbi column for this era. On-daf rabbis get solid
                    pills; 1-hop linked rabbis (teachers/students/cols)
                    get dashed pills with a role indicator. */}
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem', 'justify-content': 'center' }}>
                  <For each={entries()}>
                    {(e) => (
                      <button
                        type="button"
                        ref={(el) => registerPill(e.slug, el)}
                        onMouseEnter={() => props.onHoverRabbi(e.canonical)}
                        onMouseLeave={() => props.onHoverRabbi(null)}
                        onClick={() => { if (e.slug) props.onOpenRabbiSlug(e.slug); }}
                        disabled={!e.slug}
                        style={{
                          padding: '0.15rem 0.35rem',
                          'font-size': '0.72rem',
                          'line-height': 1.2,
                          border: e.onDaf ? '1px solid #2a2a2a' : '1px dashed #b0b0b0',
                          'border-radius': '3px',
                          background: props.activeRabbi === e.canonical
                            ? (GENERATION_BY_ID[e.generation as GenerationId]?.color ?? '#2a2a2a')
                            : (focusedNames().has(e.canonical) ? '#fff7e6' : (e.onDaf ? '#fff' : '#fafaf7')),
                          color: props.activeRabbi === e.canonical ? '#fff' : (e.onDaf ? '#222' : '#888'),
                          'font-weight': e.onDaf ? 500 : 400,
                          // Dim non-focused on-daf rabbis when any cross-
                          // highlight is active, so the focused rabbis pop.
                          opacity: (focusedNames().size > 0 && e.onDaf && !focusedNames().has(e.canonical)) ? 0.4 : 1,
                          cursor: e.slug ? 'pointer' : 'default',
                          'text-align': 'start',
                          'font-family': 'inherit',
                          transition: 'opacity 120ms, background 120ms',
                        }}
                        title={e.onDaf ? 'On this daf' : `${e.role ?? 'related'} of a rabbi on this daf`}
                      >
                        <Show when={!e.onDaf}>
                          <span style={{ 'font-size': '0.58rem', 'margin-right': '0.2rem', color: '#999' }}>
                            {e.role === 'teacher' ? '▲' : e.role === 'student' ? '▼' : '○'}
                          </span>
                        </Show>
                        <Show when={e.region === 'bavel' || e.region === 'israel'}>
                          <span
                            title={e.region === 'bavel' ? 'Bavel' : 'Eretz Yisrael'}
                            style={{
                              display: 'inline-block',
                              'font-size': '0.58rem',
                              'font-weight': 700,
                              'font-family': 'ui-monospace, SFMono-Regular, monospace',
                              color: e.region === 'bavel' ? '#92400e' : '#1f2937',
                              'margin-right': '0.25rem',
                              'min-width': '0.7rem',
                              'text-align': 'center',
                            }}
                          >
                            {e.region === 'bavel' ? 'B' : 'E'}
                          </span>
                        </Show>
                        {e.canonical}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* SVG overlay for teacher→student / colleague connections.
          Absolutely positioned over the whole section so lines can span
          across eras without interacting with layout. */}
      <svg
        style={{
          position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
          'pointer-events': 'none',
        }}
        aria-hidden="true"
      >
        <defs>
          <marker id="rt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#555" />
          </marker>
        </defs>
        <For each={endpoints()}>
          {(ep) => {
            // Rectilinear tree routing through the right-hand lane.
            // Each connector exits its source pill's right edge, runs
            // into the lane, traverses vertically to the target's y,
            // then steps back left to the target pill. Rounded
            // corners (radius r) keep it legible without turning into
            // sharp L shapes. Multiple edges naturally stack in the
            // lane since they share the same x coordinates.
            const rootW = rootEl?.getBoundingClientRect().width ?? 220;
            // Lane x: 14px inside the section's right edge, inside the
            // 2.25rem padding we reserved.
            const laneX = rootW - 14;
            const r = 4;
            const dir = ep.y2 >= ep.y1 ? 1 : -1; // down vs up
            const midEnterY = ep.y1 + dir * r;
            const midExitY = ep.y2 - dir * r;
            const d = [
              `M ${ep.x1} ${ep.y1}`,
              `L ${laneX - r} ${ep.y1}`,
              `Q ${laneX} ${ep.y1} ${laneX} ${midEnterY}`,
              `L ${laneX} ${midExitY}`,
              `Q ${laneX} ${ep.y2} ${laneX - r} ${ep.y2}`,
              `L ${ep.x2} ${ep.y2}`,
            ].join(' ');
            const dashed = ep.direction === 'colleague';
            return (
              <path
                d={d}
                fill="none"
                stroke={dashed ? '#999' : '#555'}
                stroke-width="1"
                stroke-dasharray={dashed ? '3 3' : ''}
                marker-end={dashed ? '' : 'url(#rt-arrow)'}
              />
            );
          }}
        </For>
      </svg>

      <Show when={!hasEdges}>
        <p style={{ 'margin-top': '0.55rem', 'font-size': '0.65rem', color: '#999', 'line-height': 1.35 }}>
          Teacher → student lines appear once <code>bun run build-rabbi-hierarchy</code>
          {' '}populates edges.
        </p>
      </Show>
    </section>
  );
}
