/**
 * "Show, don't tell": the four primitives demonstrated on a real daf. The
 * reader steps spine -> anchor -> artifact -> producer and each step layers
 * onto the SAME live spine (Berakhot 2a, fetched). The anchored piece is a real
 * cached `pesukim` instance — a biblical citation sitting on one segment.
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { familyColor } from './HowItWorksGraph';
import type { WorkedExample as Example } from './howItWorks/example';
import type { Graph } from './howItWorks/graphModel';

type StepKey = 'spine' | 'anchor' | 'artifact' | 'producer';

const STEPS: { key: StepKey; label: string; caption: string }[] = [
  {
    key: 'spine',
    label: 'Spine',
    caption:
      'A spine is an addressable text. This daf is a path of segments — each one has an address.',
  },
  {
    key: 'anchor',
    label: 'Anchor',
    caption: 'An anchor says where a piece sits: a span of the spine, at some precision.',
  },
  {
    key: 'artifact',
    label: 'Artifact',
    caption: 'An artifact is one produced piece — a typed body, its anchor, and provenance.',
  },
  {
    key: 'producer',
    label: 'Producer',
    caption: 'A producer is the recipe that makes artifacts. Every one is in the graph below.',
  },
];

function chipStyle(active: boolean, color: string): JSX.CSSProperties {
  return {
    'font-size': '0.7rem',
    'font-weight': 600,
    padding: '0.1rem 0.45rem',
    'border-radius': '4px',
    background: active ? color : `${color}14`,
    color: active ? '#fff' : color,
    border: `1px solid ${color}55`,
    'white-space': 'nowrap',
  };
}

const PRECISION = ['token', 'segment', 'division', 'unit', 'work'];

export function WorkedExample(props: {
  example: Example;
  graph: Graph;
  onOpenInGraph: (id: string) => void;
}): JSX.Element {
  const [step, setStep] = createSignal<StepKey>('spine');
  const art = () => props.example.artifact;
  const lit = () => step() !== 'spine' && !!art();

  // Real producer facts, derived from the registry (no hardcoding).
  const producerNode = createMemo(() => props.graph.byId.get(art()?.producerId ?? ''));
  const authority = (): string =>
    producerNode()?.mark?.extractor?.kind === 'computed' ? 'rule' : 'ai';
  const feedsInto = createMemo(() => {
    const id = art()?.producerId;
    if (!id) return [] as string[];
    return props.graph.edges.filter((e) => e.from === id).map((e) => e.to);
  });

  const segCount = () => Math.max(props.example.segsEn.length, props.example.segsHe.length);
  const inRange = (i: number): boolean => {
    const a = art();
    return !!a && lit() && i >= a.startSeg && i <= a.endSeg;
  };
  const accent = (): string => familyColor(art()?.producerId ?? 'pesuk');

  return (
    <div>
      {/* stepper */}
      <div
        style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.5rem' }}
      >
        <For each={STEPS}>
          {(s, i) => (
            <button
              type="button"
              onClick={() => setStep(s.key)}
              style={{
                display: 'inline-flex',
                'align-items': 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.7rem',
                'border-radius': '999px',
                cursor: 'pointer',
                border: `1px solid ${step() === s.key ? 'var(--accent)' : 'var(--line)'}`,
                background: step() === s.key ? 'var(--accent)' : '#fff',
                color: step() === s.key ? '#fff' : 'var(--fg)',
                'font-size': '0.82rem',
                'font-weight': 600,
              }}
            >
              <span style={{ opacity: 0.7, 'font-variant-numeric': 'tabular-nums' }}>
                {i() + 1}
              </span>
              {s.label}
            </button>
          )}
        </For>
      </div>

      {/* caption — the only prose, one line */}
      <p
        style={{
          margin: '0 0 0.7rem',
          color: '#333',
          'font-size': '0.9rem',
          'min-height': '1.4rem',
        }}
      >
        {STEPS.find((s) => s.key === step())?.caption}
      </p>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          'align-items': 'start',
        }}
        class="hiw-example"
      >
        {/* the spine */}
        <div
          style={{
            border: '1px solid var(--line)',
            'border-radius': '8px',
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.4rem 0.7rem',
              background: '#f3ede4',
              'font-size': '0.72rem',
              'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--accent)',
              'border-bottom': '1px solid var(--line)',
            }}
          >
            spine: bavli · {props.example.tractate} {props.example.page}
          </div>
          <div style={{ 'max-height': '380px', overflow: 'auto' }}>
            <Show
              when={segCount() > 0}
              fallback={
                <For each={[0, 1, 2, 3, 4, 5, 6]}>
                  {(i) => <SegRow index={i} en="" he="" highlight={inRange(i)} accent={accent()} />}
                </For>
              }
            >
              <For each={Array.from({ length: segCount() }, (_, i) => i)}>
                {(i) => (
                  <SegRow
                    index={i}
                    en={props.example.segsEn[i] ?? ''}
                    he={props.example.segsHe[i] ?? ''}
                    highlight={inRange(i)}
                    accent={accent()}
                  />
                )}
              </For>
            </Show>
          </div>
        </div>

        {/* the contextual panel per step */}
        <div>
          <Show when={step() === 'spine'}>
            <Panel title="Spine" accent="var(--accent)">
              <Row k="kind" v="text (ordered)" />
              <Row k="address" v={`[${props.example.tractate}, ${props.example.page}, n]`} mono />
              <p style={note}>
                Each segment is independently addressable. A reference may stop early — the whole
                daf is just the path with the segment left off.
              </p>
            </Panel>
          </Show>

          <Show when={step() === 'anchor'}>
            <Panel title="Anchor" accent="var(--accent)">
              <Row k="spine" v="bavli" mono />
              <Row
                k="span"
                v={art() ? `[${props.example.page}, seg ${art()?.startSeg}]` : '[2a, seg n]'}
                mono
              />
              <Row k="precision" v="segment" mono />
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '0.3rem',
                  'margin-top': '0.5rem',
                }}
              >
                <For each={PRECISION}>
                  {(p) => <span style={chipStyle(p === 'segment', 'var(--accent)')}>{p}</span>}
                </For>
              </div>
            </Panel>
          </Show>

          <Show when={step() === 'artifact'}>
            <Show
              when={art()}
              fallback={
                <Panel title="Artifact" accent={accent()}>
                  <p style={note}>
                    An artifact is a typed body pinned to an anchor, with provenance. (No cached
                    piece to show right now.)
                  </p>
                </Panel>
              }
            >
              {(a) => (
                <div
                  style={{
                    border: `1px solid ${accent()}55`,
                    'border-left': `4px solid ${accent()}`,
                    'border-radius': '8px',
                    background: '#fff',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      'align-items': 'baseline',
                      gap: '0.5rem',
                      'flex-wrap': 'wrap',
                    }}
                  >
                    <strong style={{ color: accent() }}>{a().title}</strong>
                    <span style={chipStyle(false, accent())}>{a().kind}</span>
                  </div>
                  <Show when={a().excerpt}>
                    <p
                      dir="rtl"
                      lang="he"
                      style={{
                        margin: '0.4rem 0 0',
                        'font-family': '"Mekorot Vilna", serif',
                        color: '#555',
                      }}
                    >
                      {a().excerpt}
                    </p>
                  </Show>
                  <Show when={a().body}>
                    <p
                      style={{
                        margin: '0.45rem 0 0',
                        'font-size': '0.88rem',
                        'line-height': 1.5,
                        color: '#333',
                      }}
                    >
                      {a().body}
                    </p>
                  </Show>
                  <div
                    style={{
                      'margin-top': '0.6rem',
                      'border-top': '1px dashed #e3e0d7',
                      'padding-top': '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        'font-size': '0.64rem',
                        'text-transform': 'uppercase',
                        'letter-spacing': '0.06em',
                        color: '#9a958a',
                        'margin-bottom': '0.3rem',
                      }}
                    >
                      provenance
                    </div>
                    <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                      <span style={chipStyle(false, authority() === 'ai' ? '#7c3aed' : '#0f766e')}>
                        authority: {authority()}
                      </span>
                      <span style={chipStyle(false, accent())}>producer: {a().producerId}</span>
                      <span style={chipStyle(false, '#6b7280')}>
                        anchor: [{props.example.page}, seg {a().startSeg}]
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          </Show>

          <Show when={step() === 'producer'}>
            <Panel title={art()?.producerId ?? 'producer'} accent={accent()} mono>
              <Row k="behavior" v="discovers (finds the anchors)" />
              <Row k="built from" v="gemara" mono />
              <Show when={feedsInto().length}>
                <div style={{ 'margin-top': '0.4rem' }}>
                  <div
                    style={{
                      'font-size': '0.64rem',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.06em',
                      color: '#9a958a',
                      'margin-bottom': '0.3rem',
                    }}
                  >
                    feeds into
                  </div>
                  <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                    <For each={feedsInto()}>
                      {(id) => <span style={chipStyle(false, accent())}>{id}</span>}
                    </For>
                  </div>
                </div>
              </Show>
              <button
                type="button"
                onClick={() => props.onOpenInGraph(art()?.producerId ?? '')}
                style={{
                  'margin-top': '0.7rem',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  'border-radius': '6px',
                  padding: '0.4rem 0.7rem',
                  cursor: 'pointer',
                  'font-size': '0.8rem',
                  'font-weight': 600,
                }}
              >
                See it in the graph ↓
              </button>
            </Panel>
          </Show>
        </div>
      </div>
    </div>
  );
}

const note: JSX.CSSProperties = {
  margin: '0.5rem 0 0',
  'font-size': '0.8rem',
  'line-height': 1.5,
  color: '#666',
};

function Panel(props: {
  title: string;
  accent: string;
  mono?: boolean;
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
        style={{
          'font-weight': 700,
          color: props.accent,
          'margin-bottom': '0.4rem',
          'font-family': props.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}
      >
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function Row(props: { k: string; v: string; mono?: boolean }): JSX.Element {
  return (
    <div style={{ 'font-size': '0.82rem', margin: '0.15rem 0', color: '#333' }}>
      <span style={{ color: '#9a958a' }}>{props.k}: </span>
      <span
        style={{
          'font-family': props.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}
      >
        {props.v}
      </span>
    </div>
  );
}

function SegRow(props: {
  index: number;
  en: string;
  he: string;
  highlight: boolean;
  accent: string;
}): JSX.Element {
  const preview = (): string => {
    const t = props.en || props.he;
    return t.length > 88 ? `${t.slice(0, 87)}…` : t || '—';
  };
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.3rem 0.6rem',
        'border-bottom': '1px solid #f1efe8',
        background: props.highlight ? `${props.accent}14` : 'transparent',
        'border-left': props.highlight ? `3px solid ${props.accent}` : '3px solid transparent',
      }}
    >
      <span
        style={{
          'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
          'font-size': '0.68rem',
          color: props.highlight ? props.accent : '#aaa',
          'min-width': '1.6rem',
          'font-weight': props.highlight ? 700 : 400,
        }}
      >
        {props.index}
      </span>
      <span
        style={{
          'font-size': '0.78rem',
          color: '#444',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}
        dir={props.en ? 'ltr' : 'rtl'}
      >
        {preview()}
      </span>
    </div>
  );
}
