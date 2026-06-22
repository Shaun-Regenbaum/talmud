/**
 * "Show, don't tell": the four primitives demonstrated on a real daf. A spine
 * IS the text, so the left panel shows the actual daf — Berakhot 2a's segments,
 * small, each with its address. The reader steps spine -> anchor -> artifact ->
 * producer; choosing a section (a real `argument` span) highlights it on the
 * text, and that section IS the artifact.
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { familyColor } from './HowItWorksGraph';
import type { WorkedExample as Example, Section } from './howItWorks/example';
import type { Graph } from './howItWorks/graphModel';

type StepKey = 'spine' | 'anchor' | 'artifact' | 'producer';

const STEPS: { key: StepKey; label: string; caption: string }[] = [
  {
    key: 'spine',
    label: 'Spine',
    caption: 'A spine is the actual text — an ordered, addressable sequence of segments.',
  },
  {
    key: 'anchor',
    label: 'Anchor',
    caption: 'An anchor says where a piece sits: a span of the text, at some precision.',
  },
  {
    key: 'artifact',
    label: 'Artifact',
    caption: 'A piece anchored to that span is an artifact — a body, its anchor, and provenance.',
  },
  {
    key: 'producer',
    label: 'Producer',
    caption: 'A producer made it. Every one is in the graph below.',
  },
];

const PRECISION = ['token', 'segment', 'division', 'unit', 'work'];
const HE_FONT = '"Mekorot Vilna", "Cardo", "SBL Hebrew", serif';

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

export function WorkedExample(props: {
  example: Example;
  graph: Graph;
  onOpenInGraph: (id: string) => void;
}): JSX.Element {
  const [step, setStep] = createSignal<StepKey>('spine');
  const [activeIdx, setActiveIdx] = createSignal(0);

  const segCount = (): number => Math.max(props.example.segsHe.length, props.example.segsEn.length);
  const sections = (): Section[] => props.example.sections;

  // The span currently anchored. A real argument section when we have them;
  // otherwise a small default span so the text spine still demonstrates anchoring.
  const span = (): Section => {
    const secs = sections();
    if (secs.length) return secs[Math.min(activeIdx(), secs.length - 1)];
    return { idx: 0, title: 'A span of the daf', startSeg: 0, endSeg: Math.min(2, segCount() - 1) };
  };
  const highlight = (): boolean => step() !== 'spine';
  const accent = (): string => familyColor(props.example.producerId);

  const producerNode = createMemo(() => props.graph.byId.get(props.example.producerId));
  const authority = (): string =>
    producerNode()?.mark?.extractor?.kind === 'computed' ? 'rule' : 'ai';
  const feedsInto = createMemo(() =>
    props.graph.edges.filter((e) => e.from === props.example.producerId).map((e) => e.to),
  );

  const pick = (idx: number): void => {
    setActiveIdx(idx);
    if (step() === 'spine') setStep('anchor');
  };
  const segText = (i: number): string => props.example.segsHe[i] || props.example.segsEn[i] || '';
  const anyHe = (): boolean => props.example.segsHe.some(Boolean);

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
          margin: '0 0 0.6rem',
          color: '#333',
          'font-size': '0.9rem',
          'min-height': '1.4rem',
        }}
      >
        {STEPS.find((s) => s.key === step())?.caption}
      </p>

      {/* section chips — pick the span to anchor (only when the daf is warm) */}
      <Show when={sections().length}>
        <div
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: '0.3rem',
            'margin-bottom': '0.55rem',
          }}
        >
          <For each={sections()}>
            {(sec) => (
              <button
                type="button"
                onClick={() => pick(sec.idx)}
                style={chipStyle(highlight() && sec.idx === activeIdx(), accent())}
              >
                {sec.idx + 1}. {sec.title}
              </button>
            )}
          </For>
        </div>
      </Show>

      <div style={{ display: 'grid', gap: '1rem', 'align-items': 'start' }} class="hiw-example">
        {/* the spine = the actual text */}
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
          <div
            dir={anyHe() ? 'rtl' : 'ltr'}
            lang={anyHe() ? 'he' : undefined}
            style={{
              'max-height': '300px',
              overflow: 'auto',
              padding: '0.7rem 0.85rem',
              'font-family': anyHe() ? HE_FONT : 'inherit',
              'font-size': '0.82rem',
              'line-height': 2,
              'text-align': 'justify',
              color: '#333',
            }}
          >
            <Show
              when={segCount() > 0}
              fallback={
                <p style={{ color: 'var(--muted)', 'font-size': '0.8rem', margin: 0 }}>
                  Loading the text…
                </p>
              }
            >
              {/* One continuous block of text (like #align); each segment is an
                  inline run prefixed by a small marker, and the anchored span is
                  tinted in place. */}
              <For each={Array.from({ length: segCount() }, (_, i) => i)}>
                {(i) => {
                  const on = (): boolean =>
                    highlight() && i >= span().startSeg && i <= span().endSeg;
                  return (
                    <span
                      style={{
                        background: on() ? `${accent()}22` : 'transparent',
                        'border-radius': on() ? '3px' : undefined,
                        'box-shadow': on() ? `0 0 0 2px ${accent()}22` : undefined,
                        opacity: highlight() && !on() ? 0.38 : 1,
                      }}
                    >
                      <sup
                        style={{
                          'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          'font-size': '0.58em',
                          color: on() ? accent() : '#c0bbb0',
                          'margin-inline-end': '0.1rem',
                          'font-weight': on() ? 700 : 400,
                        }}
                      >
                        {i}
                      </sup>
                      {segText(i)}{' '}
                    </span>
                  );
                }}
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
                The text itself, addressable by segment. The whole daf is just the path with the
                segment left off. Pick a section above to anchor a piece to it.
              </p>
            </Panel>
          </Show>

          <Show when={step() === 'anchor'}>
            <Panel title="Anchor" accent="var(--accent)">
              <Row k="spine" v="bavli" mono />
              <Row
                k="span"
                v={`[${props.example.page}, seg ${span().startSeg}${span().endSeg !== span().startSeg ? `–${span().endSeg}` : ''}]`}
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
                <strong style={{ color: accent() }}>{span().title}</strong>
                <span style={chipStyle(false, accent())}>mark-instance</span>
              </div>
              <p
                style={{
                  margin: '0.45rem 0 0',
                  'font-size': '0.85rem',
                  'line-height': 1.5,
                  color: '#555',
                }}
              >
                A section the <code style={mono}>{props.example.producerId}</code> mark discovered
                on this daf — a typed body pinned to where it sits in the text.
              </p>
              <div
                style={{
                  'margin-top': '0.6rem',
                  'border-top': '1px dashed #e3e0d7',
                  'padding-top': '0.5rem',
                }}
              >
                <div style={provLabel}>provenance</div>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                  <span style={chipStyle(false, authority() === 'ai' ? '#7c3aed' : '#0f766e')}>
                    authority: {authority()}
                  </span>
                  <span style={chipStyle(false, accent())}>
                    producer: {props.example.producerId}
                  </span>
                  <span style={chipStyle(false, '#6b7280')}>
                    anchor: [{props.example.page}, seg {span().startSeg}
                    {span().endSeg !== span().startSeg ? `–${span().endSeg}` : ''}]
                  </span>
                </div>
              </div>
            </div>
          </Show>

          <Show when={step() === 'producer'}>
            <Panel title={props.example.producerId} accent={accent()} mono>
              <Row k="behavior" v="discovers (finds the sections)" />
              <Row k="built from" v="gemara" mono />
              <Show when={feedsInto().length}>
                <div style={{ 'margin-top': '0.4rem' }}>
                  <div style={provLabel}>feeds into</div>
                  <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
                    <For each={feedsInto()}>
                      {(id) => <span style={chipStyle(false, accent())}>{id}</span>}
                    </For>
                  </div>
                </div>
              </Show>
              <button
                type="button"
                onClick={() => props.onOpenInGraph(props.example.producerId)}
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
const provLabel: JSX.CSSProperties = {
  'font-size': '0.64rem',
  'text-transform': 'uppercase',
  'letter-spacing': '0.06em',
  color: '#9a958a',
  'margin-bottom': '0.3rem',
};
const mono: JSX.CSSProperties = {
  'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
  'font-size': '0.82em',
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
