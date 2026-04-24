/**
 * Relations enrichment lab. For a given daf, lists the rabbis mentioned
 * and (on click) shows every relationship the precomputed hierarchy
 * knows about for that rabbi: teachers, students, contemporaries — plus
 * the rabbi's own bio, places, and generation. The view intentionally
 * skips the "at most 2 each" cap the main tree strip uses, since the
 * purpose here is research, not on-daf surfacing.
 *
 * Eventually this becomes the scratch space for deciding *which*
 * relationships are worth showing on a given daf: which teachers /
 * students / contemporaries matter given the daf's own content,
 * which are noise, which would benefit from other enrichment
 * strategies.
 */
import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import type { DafContext, IdentifiedRabbi } from './dafContext';
import { GENERATION_BY_ID, type GenerationId } from './generations';
import rabbiHierarchyData from '../lib/data/rabbi-hierarchy.json';

interface HierarchyNode {
  canonical: string;
  canonicalHe: string | null;
  generation: string;
  region: 'israel' | 'bavel' | null;
  hasBio: boolean;
  teachers: string[];
  students: string[];
  colleagues: string[];
  processed: boolean;
  unresolved?: { teachers: string[]; students: string[]; colleagues: string[] };
}
interface HierarchyFile {
  generatedAt: string | null;
  totalNodes: number;
  processedNodes: number;
  nodesWithEdges: number;
  nodes: Record<string, HierarchyNode>;
}
const HIERARCHY = rabbiHierarchyData as unknown as HierarchyFile;

async function fetchDafContext(tractate: string, page: string): Promise<DafContext> {
  const res = await fetch(`/api/daf-context/${encodeURIComponent(tractate)}/${page}`);
  if (!res.ok) throw new Error(`daf-context: HTTP ${res.status}`);
  return res.json();
}

interface RelationsTabProps {
  tractate: string;
  page: string;
  loadKey: number;
}

export function RelationsTab(props: RelationsTabProps): JSX.Element {
  const [ctx] = createResource(
    () => props.loadKey && `${props.tractate}:${props.page}`,
    () => fetchDafContext(props.tractate, props.page),
  );
  const [selectedSlug, setSelectedSlug] = createSignal<string | null>(null);

  const selectedRabbi = (): IdentifiedRabbi | null => {
    const slug = selectedSlug();
    if (!slug) return null;
    return ctx()?.rabbis.find((r) => r.slug === slug) ?? null;
  };

  const selectedNode = (): HierarchyNode | null => {
    const slug = selectedSlug();
    if (!slug) return null;
    return HIERARCHY.nodes[slug] ?? null;
  };

  return (
    <section style={{ display: 'flex', gap: '1rem', 'align-items': 'flex-start' }}>
      {/* Left column: rabbis on this daf */}
      <div style={{ flex: '0 0 260px', display: 'flex', 'flex-direction': 'column', gap: '0.4rem' }}>
        <h3 style={{ margin: 0, 'font-size': '0.8rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#666' }}>
          Rabbis on this daf
          <Show when={ctx()}>
            <span style={{ color: '#999', 'margin-left': '0.3rem' }}>({ctx()!.rabbis.length})</span>
          </Show>
        </h3>
        <Show when={ctx.loading}>
          <p style={{ color: '#888', 'font-style': 'italic' }}>Loading daf-context…</p>
        </Show>
        <Show when={ctx.error}>
          <p style={{ color: '#c33' }}>{String(ctx.error)}</p>
        </Show>
        <Show when={ctx()}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.15rem' }}>
            <For each={ctx()!.rabbis}>
              {(r) => {
                const isSelected = () => r.slug === selectedSlug();
                const hasNode = () => r.slug && HIERARCHY.nodes[r.slug]?.processed;
                const edgeCount = () => {
                  if (!r.slug) return 0;
                  const n = HIERARCHY.nodes[r.slug];
                  if (!n) return 0;
                  return n.teachers.length + n.students.length + n.colleagues.length;
                };
                return (
                  <button
                    type="button"
                    onClick={() => { if (r.slug) setSelectedSlug(r.slug); }}
                    disabled={!r.slug}
                    style={{
                      display: 'grid',
                      'grid-template-columns': '1fr auto',
                      'align-items': 'center',
                      gap: '0.5rem',
                      padding: '0.35rem 0.55rem',
                      border: isSelected() ? '1px solid #8a2a2b' : '1px solid #e5e3dc',
                      'border-radius': '3px',
                      background: isSelected() ? '#fff7e6' : (hasNode() ? '#fff' : '#fafaf7'),
                      color: '#222',
                      'font-size': '0.8rem',
                      'text-align': 'start',
                      'font-family': 'inherit',
                      cursor: r.slug ? 'pointer' : 'not-allowed',
                      opacity: r.slug ? 1 : 0.5,
                    }}
                    title={r.slug ? '' : 'No slug resolved — skipped in hierarchy'}
                  >
                    <span>
                      <span style={{ 'font-weight': 500 }}>{r.name}</span>
                      <span style={{ color: '#888', 'font-size': '0.7rem', 'margin-left': '0.3rem' }}>
                        {GENERATION_BY_ID[r.generation]?.label ?? r.generation}
                      </span>
                    </span>
                    <span
                      style={{
                        'font-variant-numeric': 'tabular-nums',
                        'font-size': '0.7rem',
                        color: edgeCount() > 0 ? '#2a8a42' : '#c33',
                      }}
                      title="edges in hierarchy (teachers + students + contemporaries)"
                    >
                      {edgeCount()}
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Right column: relationships for the selected rabbi */}
      <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', gap: '0.7rem', 'min-width': 0 }}>
        <Show
          when={selectedRabbi()}
          fallback={
            <p style={{ color: '#888', 'font-style': 'italic' }}>
              Pick a rabbi on the left to inspect their relationships.
            </p>
          }
        >
          {(r) => (
            <>
              <RabbiHeader rabbi={r()} node={selectedNode()} />
              <RelationSection
                title="Teachers"
                emphasis="Who this rabbi received tradition from"
                slugs={selectedNode()?.teachers ?? []}
                unresolved={selectedNode()?.unresolved?.teachers ?? []}
                dafRabbis={ctx()?.rabbis ?? []}
              />
              <RelationSection
                title="Students"
                emphasis="Who this rabbi taught"
                slugs={selectedNode()?.students ?? []}
                unresolved={selectedNode()?.unresolved?.students ?? []}
                dafRabbis={ctx()?.rabbis ?? []}
              />
              <RelationSection
                title="Contemporaries"
                emphasis="Debate partners and colleagues"
                slugs={selectedNode()?.colleagues ?? []}
                unresolved={selectedNode()?.unresolved?.colleagues ?? []}
                dafRabbis={ctx()?.rabbis ?? []}
              />
              <Show when={!selectedNode()}>
                <p style={{ color: '#c33', 'font-size': '0.8rem' }}>
                  No hierarchy node yet for this rabbi — run{' '}
                  <code>bun run build-rabbi-hierarchy --only {r().slug}</code> to populate.
                </p>
              </Show>
            </>
          )}
        </Show>
      </div>
    </section>
  );
}

function RabbiHeader(props: { rabbi: IdentifiedRabbi; node: HierarchyNode | null }): JSX.Element {
  const gen = () => GENERATION_BY_ID[props.rabbi.generation as GenerationId];
  return (
    <header style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem', padding: '0.7rem 0.9rem', border: '1px solid #e5e3dc', 'border-radius': '4px', background: '#fff' }}>
      <div style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', 'flex-wrap': 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ 'font-size': '1rem', 'font-weight': 600 }}>{props.rabbi.name}</span>
          <Show when={props.rabbi.nameHe}>
            <span style={{ color: '#666', 'margin-left': '0.5rem', 'font-family': "'Mekorot Vilna', serif" }}>{props.rabbi.nameHe}</span>
          </Show>
        </div>
        <Show when={gen()}>
          <span style={{ 'font-size': '0.75rem', color: '#666' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', 'border-radius': '2px', background: gen().color, 'margin-right': '0.3rem', 'vertical-align': 'middle' }} />
            {gen().label} · {gen().era}
          </span>
        </Show>
      </div>
      <div style={{ 'font-size': '0.75rem', color: '#666' }}>
        <Show when={props.rabbi.region}>
          <span style={{ 'margin-right': '0.7rem' }}>Region: <b>{props.rabbi.region}</b></span>
        </Show>
        <Show when={props.rabbi.places.length > 0}>
          <span style={{ 'margin-right': '0.7rem' }}>Places: {props.rabbi.places.join(', ')}</span>
        </Show>
        <Show when={props.rabbi.moved}>
          <span style={{ 'margin-right': '0.7rem' }}>Moved: <b>{props.rabbi.moved}</b></span>
        </Show>
        <Show when={props.rabbi.slug}>
          <code style={{ color: '#888' }}>{props.rabbi.slug}</code>
        </Show>
      </div>
      <Show when={props.rabbi.bio}>
        <p style={{ margin: 0, 'font-size': '0.8rem', 'line-height': 1.45, color: '#333', 'padding-top': '0.35rem', 'border-top': '1px dashed #eee' }}>
          {props.rabbi.bio}
        </p>
      </Show>
      <Show when={props.node}>
        <div style={{ 'font-size': '0.7rem', color: '#888' }}>
          Hierarchy: {props.node!.teachers.length} teacher(s) · {props.node!.students.length} student(s) · {props.node!.colleagues.length} contemporary/ies
        </div>
      </Show>
    </header>
  );
}

interface RelationSectionProps {
  title: string;
  emphasis: string;
  slugs: string[];
  unresolved: string[];
  dafRabbis: IdentifiedRabbi[];
}

function RelationSection(props: RelationSectionProps): JSX.Element {
  const rows = () => props.slugs.map((slug) => {
    const node = HIERARCHY.nodes[slug];
    const onDaf = props.dafRabbis.some((r) => r.slug === slug);
    return { slug, node, onDaf };
  });
  return (
    <section style={{ display: 'flex', 'flex-direction': 'column', gap: '0.3rem' }}>
      <header style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between' }}>
        <h4 style={{ margin: 0, 'font-size': '0.78rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#666' }}>
          {props.title}
          <span style={{ color: '#999', 'margin-left': '0.3rem', 'font-size': '0.7rem' }}>
            ({props.slugs.length}
            <Show when={props.unresolved.length > 0}>
              <span> · {props.unresolved.length} unresolved</span>
            </Show>
            )
          </span>
        </h4>
        <span style={{ 'font-size': '0.7rem', color: '#888' }}>{props.emphasis}</span>
      </header>
      <Show when={rows().length > 0} fallback={<p style={{ color: '#888', 'font-style': 'italic', margin: 0, 'font-size': '0.78rem' }}>None known.</p>}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.2rem' }}>
          <For each={rows()}>
            {(row) => {
              const genInfo = () => row.node ? GENERATION_BY_ID[row.node.generation as GenerationId] : null;
              return (
                <div
                  style={{
                    display: 'grid',
                    'grid-template-columns': 'auto 1fr auto',
                    'align-items': 'center',
                    gap: '0.5rem',
                    padding: '0.3rem 0.5rem',
                    border: row.onDaf ? '1px solid #8a2a2b' : '1px dashed #e5e3dc',
                    'border-radius': '3px',
                    background: row.onDaf ? '#fff7e6' : '#fff',
                    'font-size': '0.78rem',
                  }}
                >
                  <Show when={genInfo()}>
                    <span
                      title={`${genInfo()!.label} · ${genInfo()!.era}`}
                      style={{ display: 'inline-block', width: '8px', height: '8px', 'border-radius': '2px', background: genInfo()!.color }}
                    />
                  </Show>
                  <span>
                    <span style={{ 'font-weight': row.onDaf ? 600 : 500 }}>
                      {row.node?.canonical ?? row.slug}
                    </span>
                    <Show when={row.onDaf}>
                      <span style={{ color: '#8a2a2b', 'margin-left': '0.4rem', 'font-size': '0.65rem', 'font-weight': 600, 'text-transform': 'uppercase' }}>on daf</span>
                    </Show>
                    <Show when={row.node?.region}>
                      <span style={{ color: row.node!.region === 'bavel' ? '#92400e' : '#1f2937', 'margin-left': '0.4rem', 'font-size': '0.7rem' }}>
                        {row.node!.region === 'bavel' ? 'Bavel' : 'E.Y.'}
                      </span>
                    </Show>
                  </span>
                  <code style={{ color: '#888', 'font-size': '0.68rem' }}>{row.slug}</code>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={props.unresolved.length > 0}>
        <details style={{ 'font-size': '0.7rem', color: '#999' }}>
          <summary style={{ cursor: 'pointer' }}>{props.unresolved.length} unresolved mention(s)</summary>
          <ul style={{ margin: '0.2rem 0 0', 'padding-left': '1rem' }}>
            <For each={props.unresolved}>
              {(name) => <li>{name}</li>}
            </For>
          </ul>
        </details>
      </Show>
    </section>
  );
}
