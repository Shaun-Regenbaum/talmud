/**
 * #howitworks — a show-don't-tell walkthrough of how this app is built. A
 * sticky chapter rail; the four primitives DEMONSTRATED on a real daf (the
 * worked example); how a piece is built; the live build graph (zoom/pan); a
 * searchable deep dive into every enrichment; and the caching story.
 *
 * Everything about producers is pulled LIVE from the running registry
 * (GET /api/marks + /api/enrichments) and the worked example from a real daf
 * (GET /api/daf + /api/daf-view), so the page documents what is deployed.
 */
import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js';
import { familyColor, GraphLegend, HowItWorksGraph } from './HowItWorksGraph';
import { useWorkedExample } from './howItWorks/example';
import { assignLayers, buildGraph, type Graph, type GraphNode } from './howItWorks/graphModel';
import { useRegistry } from './howItWorks/registry';
import { WorkedExample } from './WorkedExample';

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
          A cached slice of text fed into a producer's prompt — an input, not itself produced.
        </p>
      </Show>

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

// ── content ────────────────────────────────────────────────────────────────

const CACHE_FACTS: { title: string; body: JSX.Element }[] = [
  {
    title: 'Frozen keys',
    body: (
      <>
        <Mono>mark:…</Mono> / <Mono>enrich:…</Mono>, no TTL — deterministic per key.
      </>
    ),
  },
  {
    title: 'Invalidate by version',
    body: (
      <>
        Bump <Mono>cache_version</Mono>; <Mono>/api/dependents</Mono> gives the cascade.
      </>
    ),
  },
  {
    title: 'Detect by recipe hash',
    body: (
      <>
        <Mono>/api/stale</Mono> tells fresh from stale without re-running.
      </>
    ),
  },
  {
    title: 'Human edits win',
    body: <>The store refuses to overwrite a human-authored artifact.</>,
  },
];

const CHAPTERS: { id: string; title: string }[] = [
  { id: 'thesis', title: 'The idea' },
  { id: 'model', title: 'The model, shown' },
  { id: 'graph', title: 'The build graph' },
  { id: 'enrichments', title: 'Every enrichment' },
  { id: 'freshness', title: 'Caching & freshness' },
];

// ── the page ───────────────────────────────────────────────────────────────

export function HowItWorksPage(): JSX.Element {
  const registry = useRegistry();
  const example = useWorkedExample();
  const [selected, setSelected] = createSignal<string | null>(null);
  const [focus, setFocus] = createSignal<string | null>(null);
  const [active, setActive] = createSignal<string>('thesis');
  const [openEntries, setOpenEntries] = createSignal<Set<string>>(new Set());
  const [query, setQuery] = createSignal('');

  const graph = createMemo<Graph>(() => {
    const r = registry();
    if (!r) return { nodes: [], edges: [], byId: new Map() };
    return assignLayers(buildGraph(r.marks, r.enrichments));
  });

  const selectedNode = createMemo<GraphNode | null>(() => {
    const id = selected();
    return id ? (graph().byId.get(id) ?? null) : null;
  });

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

  const matchEnr = (n: GraphNode, q: string): boolean => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      n.id.toLowerCase().includes(s) || (n.enrichment?.description ?? '').toLowerCase().includes(s)
    );
  };
  const enrFor = (family: string): GraphNode[] =>
    graph()
      .nodes.filter((n) => n.kind === 'enrichment' && n.family === family && matchEnr(n, query()))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  const visibleFamilies = createMemo<GraphNode[]>(() =>
    query() ? families().filter((f) => enrFor(f.id).length > 0) : families(),
  );
  const allVisibleEnrIds = (): string[] =>
    visibleFamilies().flatMap((f) => enrFor(f.id).map((n) => n.id));

  const sectionEls = new Map<string, HTMLElement>();
  const registerSection = (id: string) => (el: HTMLElement) => {
    sectionEls.set(id, el);
  };
  const familyEls = new Map<string, HTMLElement>();
  const scrollTo = (id: string): void => {
    sectionEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const jumpToFamily = (id: string): void => {
    familyEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    margin: '0 0 0.6rem',
  };
  const sectionStyle: JSX.CSSProperties = { 'margin-bottom': '3rem', 'scroll-margin-top': '1rem' };
  const lead: JSX.CSSProperties = {
    'font-size': '0.95rem',
    'line-height': 1.6,
    color: '#2a2a2a',
    margin: '0 0 0.7rem',
  };

  return (
    <div class="page-shell" style={{ '--page-max': '1180px' }}>
      <header>
        <h1>How it works</h1>
        <p style={{ color: 'var(--muted)', 'max-width': '60ch', margin: '0.4rem 0 0' }}>
          The text, covered in smart notes — shown on a real daf, then the whole machine that makes
          them.
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
              A <strong>note</strong> knows where it sits, what it's built from, how it was made,
              and how sure we are. Notes compose; every view is generated from them. Underneath sits
              one engine of four primitives — here it is on a real page.
            </p>
          </section>

          {/* 2 — the model, shown */}
          <section id="model" ref={registerSection('model')} style={sectionStyle}>
            <h2 style={h2}>The model, on a real daf</h2>
            <Show
              when={example()}
              fallback={<p style={{ color: 'var(--muted)' }}>Loading Berakhot 2a…</p>}
            >
              {(ex) => (
                <WorkedExample example={ex()} graph={graph()} onOpenInGraph={selectAndReveal} />
              )}
            </Show>
          </section>

          {/* 3 — the build graph */}
          <section id="graph" ref={registerSection('graph')} style={sectionStyle}>
            <h2 style={h2}>The build graph</h2>
            <p style={{ ...lead, color: 'var(--muted)', 'font-size': '0.85rem' }}>
              The whole live registry. Source inputs → marks → enrichments, left to right. Hover to
              trace a chain; click for the deep dive.
            </p>

            <Show when={registry.loading}>
              <p style={{ color: 'var(--muted)' }}>Loading the registry…</p>
            </Show>
            <Show when={registry.error}>
              <p style={{ color: '#b91c1c' }}>Couldn't load the registry from /api.</p>
            </Show>

            <Show when={!registry.loading && !registry.error}>
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

          {/* 5 — every enrichment */}
          <section id="enrichments" ref={registerSection('enrichments')} style={sectionStyle}>
            <h2 style={h2}>Every enrichment</h2>

            <Show when={!registry.loading && !registry.error}>
              {/* search + controls */}
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '0.5rem',
                  'align-items': 'center',
                  'margin-bottom': '0.5rem',
                }}
              >
                <input
                  type="search"
                  placeholder="Filter enrichments…"
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  style={{
                    flex: '1 1 220px',
                    padding: '0.4rem 0.6rem',
                    border: '1px solid var(--line)',
                    'border-radius': '6px',
                    'font-size': '0.85rem',
                    background: '#fff',
                  }}
                />
                <button
                  type="button"
                  style={miniBtn}
                  onClick={() => setOpenEntries(new Set(allVisibleEnrIds()))}
                >
                  expand all
                </button>
                <button type="button" style={miniBtn} onClick={() => setOpenEntries(new Set())}>
                  collapse all
                </button>
              </div>

              {/* family jump chips */}
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '0.3rem',
                  'margin-bottom': '0.8rem',
                }}
              >
                <For each={visibleFamilies()}>
                  {(f) => (
                    <button
                      type="button"
                      onClick={() => jumpToFamily(f.id)}
                      style={chip(false, familyColor(f.id))}
                    >
                      {f.id} <span style={{ opacity: 0.7 }}>{enrFor(f.id).length}</span>
                    </button>
                  )}
                </For>
              </div>

              <For each={visibleFamilies()}>
                {(fam) => (
                  <div
                    ref={(el) => familyEls.set(fam.id, el)}
                    style={{ 'margin-bottom': '1.1rem', 'scroll-margin-top': '1rem' }}
                  >
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
                      each={enrFor(fam.id)}
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
              <p style={{ 'font-size': '0.78rem', color: 'var(--muted)', 'margin-top': '0.5rem' }}>
                <Mono>/api/enrichments</Mono> lists LLM enrichments; a few deterministic producers
                (e.g. <Mono>rabbi.identity</Mono>) appear under their mark instead.
              </p>
            </Show>
          </section>

          {/* 6 — caching & freshness */}
          <section id="freshness" ref={registerSection('freshness')} style={sectionStyle}>
            <h2 style={h2}>Caching & freshness</h2>
            <div
              style={{
                display: 'grid',
                'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.6rem',
              }}
            >
              <For each={CACHE_FACTS}>
                {(f) => (
                  <div
                    style={{
                      border: '1px solid var(--line)',
                      'border-radius': '8px',
                      background: '#fff',
                      padding: '0.7rem 0.8rem',
                    }}
                  >
                    <strong style={{ 'font-size': '0.85rem' }}>{f.title}</strong>
                    <p
                      style={{
                        margin: '0.3rem 0 0',
                        'font-size': '0.8rem',
                        'line-height': 1.45,
                        color: '#555',
                      }}
                    >
                      {f.body}
                    </p>
                  </div>
                )}
              </For>
            </div>
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

const miniBtn: JSX.CSSProperties = {
  border: '1px solid var(--line)',
  background: '#fff',
  'border-radius': '6px',
  padding: '0.35rem 0.6rem',
  cursor: 'pointer',
  'font-size': '0.78rem',
  color: 'var(--fg)',
};

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
