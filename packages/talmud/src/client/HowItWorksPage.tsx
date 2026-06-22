/**
 * #howitworks — a guided walkthrough of how this app is built, for a colleague.
 * Reads like an interactive presentation: a sticky chapter rail down the side,
 * the four-primitive vocabulary, the producer lifecycle, then the live build
 * graph as the centerpiece, a deep dive into every enrichment, and the
 * caching/freshness story.
 *
 * Everything about producers is pulled LIVE from the running registry
 * (GET /api/marks + /api/enrichments) so the page documents what is actually
 * deployed. The conceptual prose follows docs/framework.md ("the framework:
 * four primitives").
 */
import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js';
import { familyColor, GraphLegend, HowItWorksGraph } from './HowItWorksGraph';
import { assignLayers, buildGraph, type Graph, type GraphNode } from './howItWorks/graphModel';
import { useRegistry } from './howItWorks/registry';

// ── small presentational atoms ────────────────────────────────────────────

function Badge(props: { children: JSX.Element; color?: string; title?: string }): JSX.Element {
  return (
    <span
      title={props.title}
      style={{
        display: 'inline-block',
        'font-size': '0.66rem',
        'font-weight': 600,
        'letter-spacing': '0.02em',
        padding: '0.12rem 0.4rem',
        'border-radius': '4px',
        background: props.color ? `${props.color}1a` : '#eceae3',
        color: props.color ?? '#555',
        border: `1px solid ${props.color ? `${props.color}55` : '#dcd9cf'}`,
        'white-space': 'nowrap',
      }}
    >
      {props.children}
    </span>
  );
}

function Mono(props: { children: JSX.Element }): JSX.Element {
  return (
    <code
      style={{
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
        'font-size': '0.82em',
        background: '#f1efe8',
        padding: '0.05rem 0.3rem',
        'border-radius': '4px',
      }}
    >
      {props.children}
    </code>
  );
}

function Disclosure(props: { title: string; children: JSX.Element }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  return (
    <div style={{ 'margin-top': '0.5rem' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '0.4rem',
          width: '100%',
          'text-align': 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.2rem 0',
          color: 'var(--muted)',
          'font-size': '0.72rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
        }}
        aria-expanded={open()}
      >
        <span
          style={{ transform: open() ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
        >
          ▸
        </span>
        {props.title}
      </button>
      <Show when={open()}>{props.children}</Show>
    </div>
  );
}

function Code(props: { text: string }): JSX.Element {
  return (
    <pre
      style={{
        margin: '0.4rem 0 0',
        padding: '0.6rem 0.7rem',
        background: '#2b2a26',
        color: '#e8e6df',
        'border-radius': '6px',
        'font-size': '0.74rem',
        'line-height': 1.5,
        'white-space': 'pre-wrap',
        'word-break': 'break-word',
        'max-height': '320px',
        overflow: 'auto',
      }}
    >
      {props.text}
    </pre>
  );
}

// ── the deep-dive card, reused by the graph and the directory ──────────────

function neighbors(graph: Graph, id: string, dir: 'in' | 'out'): GraphNode[] {
  const ids: string[] = [];
  for (const e of graph.edges) {
    if (dir === 'in' && e.to === id) ids.push(e.from);
    if (dir === 'out' && e.from === id) ids.push(e.to);
  }
  const seen = new Set<string>();
  const out: GraphNode[] = [];
  for (const nid of ids) {
    if (seen.has(nid)) continue;
    seen.add(nid);
    const n = graph.byId.get(nid);
    if (n) out.push(n);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function ChipRow(props: {
  label: string;
  nodes: GraphNode[];
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <Show when={props.nodes.length}>
      <div style={{ 'margin-top': '0.55rem' }}>
        <div
          style={{
            'font-size': '0.66rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
            color: '#9a958a',
            'margin-bottom': '0.3rem',
          }}
        >
          {props.label}
        </div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
          <For each={props.nodes}>
            {(n) => (
              <button
                type="button"
                onClick={() => props.onSelect(n.id)}
                style={{
                  'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  'font-size': '0.72rem',
                  padding: '0.15rem 0.45rem',
                  'border-radius': '5px',
                  cursor: 'pointer',
                  background: '#fff',
                  color: '#374151',
                  border: `1px solid ${familyColor(n.family)}66`,
                  'border-left': `3px solid ${familyColor(n.family)}`,
                }}
              >
                {n.id}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function MetaList(props: { rows: [string, JSX.Element | string | undefined][] }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        'flex-wrap': 'wrap',
        gap: '0.35rem 0.5rem',
        'margin-top': '0.5rem',
      }}
    >
      <For each={props.rows.filter(([, v]) => v != null && v !== '')}>
        {([k, v]) => (
          <div
            style={{
              'font-size': '0.74rem',
              color: '#444',
              background: '#faf8f2',
              border: '1px solid #ece9e0',
              'border-radius': '5px',
              padding: '0.2rem 0.45rem',
            }}
          >
            <span style={{ color: '#9a958a' }}>{k}: </span>
            {v}
          </div>
        )}
      </For>
    </div>
  );
}

export function DeepDive(props: {
  node: GraphNode;
  graph: Graph;
  onSelect: (id: string) => void;
}): JSX.Element {
  const color = (): string => familyColor(props.node.family);
  const m = (): GraphNode['mark'] => props.node.mark;
  const e = (): GraphNode['enrichment'] => props.node.enrichment;

  const kindLabel = (): string =>
    props.node.kind === 'mark'
      ? 'mark · discovers anchors'
      : props.node.kind === 'enrichment'
        ? 'enrichment · builds on a mark'
        : 'source input';

  const modelLabel = (): string => {
    const model = m()?.extractor?.model ?? e()?.model;
    return model || 'default model';
  };
  const reasoningLabel = (): string | undefined => {
    const ex = m()?.extractor;
    const thinkingOff = ex?.thinking_off ?? e()?.thinking_off;
    const effort = ex?.reasoning_effort ?? e()?.reasoning_effort;
    if (effort) return `reasoning: ${effort}`;
    if (thinkingOff) return 'thinking off';
    return undefined;
  };

  return (
    <div
      style={{
        border: `1px solid ${color()}55`,
        'border-left': `4px solid ${color()}`,
        'border-radius': '8px',
        background: '#fff',
        padding: '0.85rem 1rem',
      }}
    >
      <div
        style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem', 'flex-wrap': 'wrap' }}
      >
        <span
          style={{
            'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
            'font-size': '0.95rem',
            'font-weight': 700,
            color: color(),
          }}
        >
          {props.node.id}
        </span>
        <Badge color={color()}>{kindLabel()}</Badge>
        <Show when={m()?.experimental || m()?.status === 'draft'}>
          <Badge title="not promoted to readers">experimental</Badge>
        </Show>
      </div>

      <Show when={m()?.label && m()?.label !== props.node.id}>
        <div style={{ 'font-weight': 600, 'margin-top': '0.3rem' }}>{m()?.label}</div>
      </Show>
      <Show when={e()?.label && e()?.label !== props.node.id}>
        <div style={{ 'font-weight': 600, 'margin-top': '0.3rem' }}>{e()?.label}</div>
      </Show>

      <Show when={m()?.description || e()?.description}>
        <p
          style={{
            margin: '0.3rem 0 0',
            'font-size': '0.88rem',
            'line-height': 1.5,
            color: '#333',
          }}
        >
          {m()?.description ?? e()?.description}
        </p>
      </Show>

      <Show when={props.node.kind === 'source'}>
        <p style={{ margin: '0.3rem 0 0', 'font-size': '0.85rem', color: '#555' }}>
          A source input — a cached slice of text the runtime feeds into a producer's prompt (it
          isn't itself produced). Everything to its right is built, ultimately, from inputs like
          this.
        </p>
      </Show>

      {/* metadata */}
      <Show when={props.node.kind !== 'source'}>
        <MetaList
          rows={
            props.node.kind === 'mark'
              ? [
                  ['anchor', m()?.anchor],
                  ['render', m()?.render?.kind],
                  ['extractor', m()?.extractor?.kind],
                  ['model', modelLabel()],
                  ['reasoning', reasoningLabel()],
                  ['cache', m()?.cache_version ? `v${m()?.cache_version}` : undefined],
                ]
              : [
                  ['target mark', e()?.mark],
                  ['mode', e()?.mode],
                  ['scope', e()?.scope],
                  ['model', modelLabel()],
                  ['reasoning', reasoningLabel()],
                  ['cache', e()?.cache_version ? `v${e()?.cache_version}` : undefined],
                ]
          }
        />
      </Show>

      <ChipRow
        label="built from"
        nodes={neighbors(props.graph, props.node.id, 'in')}
        onSelect={props.onSelect}
      />
      <ChipRow
        label="feeds into"
        nodes={neighbors(props.graph, props.node.id, 'out')}
        onSelect={props.onSelect}
      />

      <Show when={e()?.output_schema}>
        <Disclosure title="output schema">
          <Code text={JSON.stringify(e()?.output_schema, null, 2)} />
        </Disclosure>
      </Show>
      <Show when={e()?.system_prompt}>
        <Disclosure title="system prompt">
          <Code text={e()?.system_prompt ?? ''} />
        </Disclosure>
      </Show>
      <Show when={e()?.user_prompt_template}>
        <Disclosure title="user prompt template">
          <Code text={e()?.user_prompt_template ?? ''} />
        </Disclosure>
      </Show>
    </div>
  );
}

// ── conceptual chapter content ─────────────────────────────────────────────

function PrimitiveCard(props: {
  name: string;
  module: string;
  oneLine: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        'border-radius': '8px',
        background: '#fff',
        padding: '0.85rem 1rem',
      }}
    >
      <div
        style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem', 'flex-wrap': 'wrap' }}
      >
        <span style={{ 'font-size': '1.05rem', 'font-weight': 700, color: 'var(--accent)' }}>
          {props.name}
        </span>
        <Mono>{props.module}</Mono>
      </div>
      <p style={{ margin: '0.35rem 0 0.2rem', 'font-weight': 600, 'font-size': '0.9rem' }}>
        {props.oneLine}
      </p>
      <div style={{ 'font-size': '0.85rem', 'line-height': 1.55, color: '#333' }}>
        {props.children}
      </div>
    </div>
  );
}

/** A tiny "note pinned to a span of a spine" illustration for the Anchor card. */
function AnchorDiagram(): JSX.Element {
  const segs = [0, 1, 2, 3, 4, 5, 6];
  const W = 44;
  return (
    <svg
      width="100%"
      height="92"
      viewBox="0 0 340 92"
      role="img"
      aria-label="An anchor spans segments 3 to 5 of a spine"
    >
      <text x="2" y="14" font-size="10" fill="#9a958a">
        spine: bavli · Berakhot 2a
      </text>
      <For each={segs}>
        {(s, i) => (
          <g>
            <rect
              x={6 + i() * W}
              y={24}
              width={W - 6}
              height={26}
              rx={4}
              fill={s >= 3 && s <= 5 ? '#8a2a2b22' : '#f1efe8'}
              stroke={s >= 3 && s <= 5 ? '#8a2a2b' : '#ddd9cf'}
            />
            <text
              x={6 + i() * W + (W - 6) / 2}
              y={41}
              text-anchor="middle"
              font-size="10"
              fill="#666"
            >
              {`seg ${s}`}
            </text>
          </g>
        )}
      </For>
      <path d={`M ${6 + 3 * W} 56 L ${6 + 6 * W - 6} 56`} stroke="#8a2a2b" stroke-width="2" />
      <text x={6 + 3 * W} y={78} font-size="11" fill="#8a2a2b" font-weight="600">
        Anchor · span [3..5] · precision: segment
      </text>
    </svg>
  );
}

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'Resolve inputs',
    body: 'Walk the dependency DAG — source slices, mark instances, other enrichments — into template vars. One bad dep degrades to an {error}, never throws.',
  },
  {
    n: '2',
    title: 'Render + call',
    body: "Fill the recipe's prompt template, pick the model (Hebrew prompt selected when present), and call the model — or run a deterministic computed/lookup branch.",
  },
  {
    n: '3',
    title: 'Parse + check',
    body: 'JSON-parse the output, then run the post-LLM passes: transforms repair/re-anchor, validators raise issues. Hard issues gate the write behind a bounded retry.',
  },
  {
    n: '4',
    title: 'Stamp provenance',
    body: 'Record the build manifest: authority (human | rule | ai), the inputs with content hashes, model, transport, cost, recipe hash.',
  },
  {
    n: '5',
    title: 'Store (no TTL)',
    body: 'Write to the ArtifactStore under the frozen mark:/enrich: key. The human-edit guard refuses to clobber a human-authored entry with AI output.',
  },
  {
    n: '6',
    title: 'Render the view',
    body: 'The reader composes from the cached artifact. Re-opening is instant; a cache_version bump serves the previous value while the new one recomputes (SWR).',
  },
];

// ── the page ───────────────────────────────────────────────────────────────

const CHAPTERS: { id: string; title: string }[] = [
  { id: 'thesis', title: 'The idea' },
  { id: 'primitives', title: 'Four primitives' },
  { id: 'producers', title: 'Marks & enrichments' },
  { id: 'lifecycle', title: 'How a piece is built' },
  { id: 'graph', title: 'The build graph' },
  { id: 'enrichments', title: 'Every enrichment' },
  { id: 'freshness', title: 'Caching & freshness' },
];

export function HowItWorksPage(): JSX.Element {
  const registry = useRegistry();
  const [selected, setSelected] = createSignal<string | null>(null);
  const [focus, setFocus] = createSignal<string | null>(null);
  const [active, setActive] = createSignal<string>('thesis');
  const [openEntries, setOpenEntries] = createSignal<Set<string>>(new Set());

  const graph = createMemo<Graph>(() => {
    const r = registry();
    if (!r) return { nodes: [], edges: [], byId: new Map() };
    return assignLayers(buildGraph(r.marks, r.enrichments));
  });

  const selectedNode = createMemo<GraphNode | null>(() => {
    const id = selected();
    return id ? (graph().byId.get(id) ?? null) : null;
  });

  // Families (mark ids) for the focus chips + directory grouping, canon first.
  const families = createMemo<GraphNode[]>(() =>
    graph()
      .nodes.filter((n) => n.kind === 'mark')
      .sort((a, b) => {
        const ca = a.mark?.category === 'canon' ? 0 : 1;
        const cb = b.mark?.category === 'canon' ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return a.id < b.id ? -1 : 1;
      }),
  );

  const enrichmentsByFamily = (family: string): GraphNode[] =>
    graph()
      .nodes.filter((n) => n.kind === 'enrichment' && n.family === family)
      .sort((a, b) => (a.id < b.id ? -1 : 1));

  const sectionEls = new Map<string, HTMLElement>();
  const registerSection = (id: string) => (el: HTMLElement) => {
    sectionEls.set(id, el);
  };
  const scrollTo = (id: string): void => {
    sectionEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const selectAndReveal = (id: string): void => {
    setSelected(id);
    scrollTo('graph');
  };

  onMount(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((en) => en.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive((visible[0].target as HTMLElement).id);
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    for (const el of sectionEls.values()) obs.observe(el);
    onCleanup(() => obs.disconnect());
  });

  const toggleEntry = (id: string): void => {
    setOpenEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        setSelected(id);
      }
      return next;
    });
  };

  const h2: JSX.CSSProperties = {
    'font-size': '0.85rem',
    'text-transform': 'uppercase',
    'letter-spacing': '0.1em',
    color: 'var(--muted)',
    margin: '0 0 0.75rem',
  };
  const sectionStyle: JSX.CSSProperties = { 'margin-bottom': '3rem', 'scroll-margin-top': '1rem' };
  const lead: JSX.CSSProperties = { 'font-size': '0.95rem', 'line-height': 1.6, color: '#2a2a2a' };

  return (
    <div class="page-shell" style={{ '--page-max': '1180px' }}>
      <header>
        <h1>How it works</h1>
        <p style={{ color: 'var(--muted)', 'max-width': '60ch' }}>
          A walkthrough of how this app turns a page of Talmud into smart notes — the four
          primitives the engine is built on, how a single note is produced, and a deep dive into
          every enrichment, drawn live from the running registry.
        </p>
      </header>

      <div class="hiw-layout">
        <nav class="hiw-rail" aria-label="Sections">
          <ol>
            <For each={CHAPTERS}>
              {(ch) => (
                <li>
                  <button
                    type="button"
                    classList={{ 'is-active': active() === ch.id }}
                    onClick={() => scrollTo(ch.id)}
                  >
                    {ch.title}
                  </button>
                </li>
              )}
            </For>
          </ol>
        </nav>

        <div>
          {/* 1 — the idea */}
          <section id="thesis" ref={registerSection('thesis')} style={sectionStyle}>
            <h2 style={h2}>The idea</h2>
            <p style={lead}>
              The plain-English version is: <strong>the text, covered in smart notes</strong>. A
              note knows <em>where</em> it sits on the text, <em>what</em> it's built from,{' '}
              <em>how</em> it was made, and <em>how sure</em> we are. Notes compose — a synthesis is
              a note built from other notes — and the views you read (sidebar cards, maps, the
              argument flow) are all generated from notes, never authored by hand.
            </p>
            <p style={lead}>
              Under that plain story sits one small engine, shared by both this app and its sister
              Tanach app, made of exactly four primitives.
            </p>
          </section>

          {/* 2 — four primitives */}
          <section id="primitives" ref={registerSection('primitives')} style={sectionStyle}>
            <h2 style={h2}>Four primitives</h2>
            <div class="hiw-cards">
              <PrimitiveCard
                name="Spine"
                module="@corpus/core/model/spine"
                oneLine="An addressable text (or entity space) that notes pin to."
              >
                A reference into a spine is a path that <strong>may stop early</strong>:{' '}
                <Mono>[Berakhot, 2a]</Mono> is the whole daf, <Mono>[Berakhot, 2a, 3]</Mono> one
                segment. Bavli is the implicit default spine; Tanach is book / chapter / verse.
              </PrimitiveCard>
              <PrimitiveCard
                name="Anchor"
                module="@corpus/core/model/anchor"
                oneLine="THE one shape for “where a piece sits.”"
              >
                A span plus a <strong>precision</strong> (token &gt; segment &gt; division &gt; unit
                &gt; work &gt; external) and how it was earned (<Mono>via</Mono>,{' '}
                <Mono>confidence</Mono>). “Cross-daf” isn't a precision — it's derived at render
                time.
                <AnchorDiagram />
              </PrimitiveCard>
              <PrimitiveCard
                name="Artifact"
                module="@corpus/core/model/artifact"
                oneLine="One produced piece: a typed body + anchors + provenance."
              >
                Mark instances, enrichment outputs, context items, links, and anchor refinements are{' '}
                <em>all</em> artifacts. Provenance is the <strong>build manifest</strong>: who
                decided (<Mono>human | rule | ai</Mono>), the inputs with content hashes, the model,
                the cost.
              </PrimitiveCard>
              <PrimitiveCard
                name="Producer"
                module="@corpus/core/model/producer"
                oneLine="The registry entry that makes artifacts."
              >
                Declares its inputs, its recipe, where outputs sit, and how they cache. Its{' '}
                <Mono>anchoring.behavior</Mono> unifies the old split: <strong>discovers</strong>{' '}
                (finds anchors — a mark), <strong>inherits</strong> (sits where its input sits — a
                per-instance enrichment), <strong>aggregates</strong> (one output over many — a
                synthesis).
              </PrimitiveCard>
            </div>
            <p
              style={{
                ...lead,
                'margin-top': '0.85rem',
                color: 'var(--muted)',
                'font-size': '0.85rem',
              }}
            >
              Placement is a <em>lifecycle</em>, not a fifth primitive: an anchor is earned coarse →
              deterministic → AI → human, and a human-earned anchor is never silently overwritten.
            </p>
          </section>

          {/* 3 — marks & enrichments */}
          <section id="producers" ref={registerSection('producers')} style={sectionStyle}>
            <h2 style={h2}>Two flavors of producer: marks & enrichments</h2>
            <p style={lead}>
              Every producer is one <Mono>Producer</Mono> under the hood, but it wears one of two
              familiar faces. A <strong>mark</strong> reads the raw daf and{' '}
              <strong>discovers</strong> instances — a rabbi name, an argument section, a biblical
              citation — each anchored to where it sits. An <strong>enrichment</strong> takes a
              mark's instances and builds on them: it either <strong>inherits</strong> the
              instance's anchor (a per-instance note like a rabbi's biography) or{' '}
              <strong>aggregates</strong> many instances into one whole-daf note (a synthesis).
            </p>
            <p style={lead}>
              Enrichments chain: a synthesis depends on the leaf enrichments beneath it, which
              depend on the mark, which depends on the raw text. That chain is exactly what the
              build graph below draws.
            </p>
          </section>

          {/* 4 — lifecycle */}
          <section id="lifecycle" ref={registerSection('lifecycle')} style={sectionStyle}>
            <h2 style={h2}>How a single piece is built</h2>
            <p style={{ ...lead, 'margin-bottom': '0.9rem' }}>
              One function — <Mono>runProducer</Mono> — runs every producer, mark or enrichment, the
              same way:
            </p>
            <div
              style={{
                display: 'grid',
                'grid-template-columns': 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.6rem',
              }}
            >
              <For each={STEPS}>
                {(step) => (
                  <div
                    style={{
                      border: '1px solid var(--line)',
                      'border-radius': '8px',
                      background: '#fff',
                      padding: '0.7rem 0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          width: '1.4rem',
                          height: '1.4rem',
                          'border-radius': '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          display: 'inline-flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          'font-size': '0.78rem',
                          'font-weight': 700,
                        }}
                      >
                        {step.n}
                      </span>
                      <strong style={{ 'font-size': '0.88rem' }}>{step.title}</strong>
                    </div>
                    <p
                      style={{
                        margin: '0.4rem 0 0',
                        'font-size': '0.8rem',
                        'line-height': 1.5,
                        color: '#444',
                      }}
                    >
                      {step.body}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </section>

          {/* 5 — the build graph */}
          <section id="graph" ref={registerSection('graph')} style={sectionStyle}>
            <h2 style={h2}>The build graph</h2>
            <p style={{ ...lead, 'margin-bottom': '0.6rem' }}>
              The live registry, as a dependency graph. Columns are dependency depth: source inputs
              on the left, then the marks built from them, then the enrichments built on the marks.
              Hover any node to trace its chain; click it for the full deep dive.
            </p>

            <Show when={registry.loading}>
              <p style={{ color: 'var(--muted)' }}>Loading the registry…</p>
            </Show>
            <Show when={registry.error}>
              <p style={{ color: '#b91c1c' }}>Couldn't load the registry from /api.</p>
            </Show>

            <Show when={!registry.loading && !registry.error}>
              {/* focus-by-family chips */}
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '0.3rem',
                  'margin-bottom': '0.55rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  classList={{ 'is-active': focus() === null }}
                  style={chip(focus() === null, '#444')}
                >
                  all
                </button>
                <For each={families()}>
                  {(f) => (
                    <button
                      type="button"
                      onClick={() => setFocus(focus() === f.id ? null : f.id)}
                      style={chip(focus() === f.id, familyColor(f.id))}
                    >
                      {f.id}
                    </button>
                  )}
                </For>
              </div>

              <HowItWorksGraph
                graph={graph()}
                selectedId={selected()}
                onSelect={setSelected}
                focusFamily={focus()}
              />
              <GraphLegend />

              <Show
                when={selectedNode()}
                fallback={
                  <p
                    style={{
                      'margin-top': '0.8rem',
                      color: 'var(--muted)',
                      'font-size': '0.85rem',
                    }}
                  >
                    Select a node to see how it's built and what it feeds.
                  </p>
                }
              >
                {(n) => (
                  <div style={{ 'margin-top': '0.9rem' }}>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      style={{
                        float: 'right',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        'font-size': '1.1rem',
                        'line-height': 1,
                      }}
                      aria-label="Close deep dive"
                    >
                      ×
                    </button>
                    <DeepDive node={n()} graph={graph()} onSelect={selectAndReveal} />
                  </div>
                )}
              </Show>
            </Show>
          </section>

          {/* 6 — every enrichment */}
          <section id="enrichments" ref={registerSection('enrichments')} style={sectionStyle}>
            <h2 style={h2}>Every enrichment</h2>
            <p style={{ ...lead, 'margin-bottom': '0.8rem' }}>
              Grouped under the mark each one builds on. Click any row to expand its full deep dive
              — dependencies, model, scope, output schema, and the prompts behind it.
            </p>

            <Show when={!registry.loading && !registry.error}>
              <For each={families()}>
                {(fam) => (
                  <div style={{ 'margin-bottom': '1.1rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '0.5rem',
                        'border-bottom': `2px solid ${familyColor(fam.id)}`,
                        'padding-bottom': '0.25rem',
                        'margin-bottom': '0.5rem',
                      }}
                    >
                      <span
                        style={{
                          'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          'font-weight': 700,
                          color: familyColor(fam.id),
                        }}
                      >
                        {fam.id}
                      </span>
                      <span style={{ 'font-size': '0.8rem', color: 'var(--muted)' }}>
                        {fam.mark?.label}
                      </span>
                    </div>
                    <For
                      each={enrichmentsByFamily(fam.id)}
                      fallback={
                        <p style={{ 'font-size': '0.8rem', color: 'var(--muted)', margin: 0 }}>
                          No LLM enrichments — this mark stands on its own.
                        </p>
                      }
                    >
                      {(en) => (
                        <DirectoryRow
                          node={en}
                          graph={graph()}
                          open={openEntries().has(en.id)}
                          onToggle={() => toggleEntry(en.id)}
                          onSelect={selectAndReveal}
                        />
                      )}
                    </For>
                  </div>
                )}
              </For>
              <p style={{ 'font-size': '0.78rem', color: 'var(--muted)', 'margin-top': '1rem' }}>
                Note: <Mono>/api/enrichments</Mono> lists LLM enrichments only. A couple of
                producers (e.g. <Mono>rabbi.identity</Mono>) are deterministic/computed — they're
                real producers but resolve from data rather than a model, so they appear under their
                mark rather than in this list.
              </p>
            </Show>
          </section>

          {/* 7 — caching & freshness */}
          <section id="freshness" ref={registerSection('freshness')} style={sectionStyle}>
            <h2 style={h2}>Caching, provenance & freshness</h2>
            <p style={lead}>
              Producer outputs are cached in the <Mono>ArtifactStore</Mono> under{' '}
              <strong>byte-frozen keys</strong> (<Mono>mark:…</Mono> / <Mono>enrich:…</Mono>) with{' '}
              <strong>no TTL</strong> — outputs are deterministic per key, and full-Shas re-warming
              is expensive, so a stray key change would silently re-pay all of it.
            </p>
            <ul style={{ ...lead, 'padding-left': '1.1rem' }}>
              <li>
                <strong>Invalidate by version.</strong> Bump a producer's <Mono>cache_version</Mono>{' '}
                and the old key becomes unreachable. If you bump a producer, you must bump
                everything that depends on it — <Mono>GET /api/dependents/:id</Mono> enumerates the
                cascade.
              </li>
              <li>
                <strong>Detect by recipe hash.</strong> Each artifact stamps the hash of the recipe
                that made it, so <Mono>/api/stale/:id/:t/:p</Mono> can tell fresh from stale without
                re-running anything.
              </li>
              <li>
                <strong>Serve stale while revalidating.</strong> Across a version bump the reader
                gets the previous value immediately while the new one recomputes in the background.
              </li>
              <li>
                <strong>Human edits win.</strong> The store refuses to overwrite a human-authored
                artifact with rule/AI output — an enforced invariant, not a convention.
              </li>
            </ul>
            <p style={{ ...lead, color: 'var(--muted)', 'font-size': '0.85rem' }}>
              The provenance manifest on each artifact records the exact inputs it was built from
              (with content hashes), which closes the loop: detect what's stale, enumerate what else
              must follow, and re-warm only the cascade.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function chip(activeState: boolean, color: string): JSX.CSSProperties {
  return {
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-size': '0.72rem',
    padding: '0.2rem 0.5rem',
    'border-radius': '999px',
    cursor: 'pointer',
    background: activeState ? color : '#fff',
    color: activeState ? '#fff' : color,
    border: `1px solid ${color}66`,
  };
}

function DirectoryRow(props: {
  node: GraphNode;
  graph: Graph;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}): JSX.Element {
  const e = (): GraphNode['enrichment'] => props.node.enrichment;
  return (
    <div style={{ 'margin-bottom': '0.4rem' }}>
      <button
        type="button"
        onClick={() => props.onToggle()}
        aria-expanded={props.open}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '0.5rem',
          width: '100%',
          'text-align': 'left',
          background: props.open ? '#faf8f2' : '#fff',
          border: '1px solid var(--line)',
          'border-radius': '6px',
          padding: '0.4rem 0.6rem',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            color: '#bbb',
            transform: props.open ? 'rotate(90deg)' : 'none',
            transition: 'transform .12s',
          }}
        >
          ▸
        </span>
        <span
          style={{
            'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
            'font-size': '0.82rem',
            'font-weight': 600,
            color: familyColor(props.node.family),
          }}
        >
          {props.node.id}
        </span>
        <span
          style={{
            'font-size': '0.78rem',
            color: '#555',
            flex: 1,
            'min-width': 0,
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
          }}
        >
          {e()?.description}
        </span>
        <Show when={e()?.scope}>
          <Badge>{e()?.scope}</Badge>
        </Show>
        <Show when={e()?.mode}>
          <Badge>{e()?.mode}</Badge>
        </Show>
      </button>
      <Show when={props.open}>
        <div style={{ 'margin-top': '0.4rem' }}>
          <DeepDive node={props.node} graph={props.graph} onSelect={props.onSelect} />
        </div>
      </Show>
    </div>
  );
}
