/**
 * "Show, don't tell": the four primitives demonstrated on a real daf. The
 * reader steps spine -> anchor -> artifact -> producer and each step layers
 * onto the SAME spine — rendered as the daf's sections (titled cards, a shorter
 * cousin of the #spine statement view). Click a section to anchor it; the
 * chosen section IS the artifact (a real `argument` mark instance).
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
    caption: 'A spine is an addressable text. Here it is, broken into its sections — pick one.',
  },
  {
    key: 'anchor',
    label: 'Anchor',
    caption: 'An anchor says where a piece sits: a span of the spine, at some precision.',
  },
  {
    key: 'artifact',
    label: 'Artifact',
    caption: 'That section is itself an artifact — a typed body, its anchor, and provenance.',
  },
  {
    key: 'producer',
    label: 'Producer',
    caption: 'A producer made it. Every one is in the graph below.',
  },
];

const PRECISION = ['token', 'segment', 'division', 'unit', 'work'];

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

  const sections = (): Section[] => props.example.sections;
  const active = (): Section | undefined => sections().find((s) => s.idx === activeIdx());
  const accent = (): string => familyColor(props.example.producerId);
  const highlight = (): boolean => step() !== 'spine';

  const producerNode = createMemo(() => props.graph.byId.get(props.example.producerId));
  const authority = (): string =>
    producerNode()?.mark?.extractor?.kind === 'computed' ? 'rule' : 'ai';
  const feedsInto = createMemo(() =>
    props.graph.edges.filter((e) => e.from === props.example.producerId).map((e) => e.to),
  );

  const pickSection = (idx: number): void => {
    setActiveIdx(idx);
    if (step() === 'spine') setStep('anchor');
  };

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

      <div style={{ display: 'grid', gap: '1rem', 'align-items': 'start' }} class="hiw-example">
        {/* the spine, as section cards */}
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
          <div style={{ padding: '0.5rem' }}>
            <Show
              when={sections().length}
              fallback={
                <p style={{ color: 'var(--muted)', 'font-size': '0.82rem', margin: '0.3rem' }}>
                  Loading sections…
                </p>
              }
            >
              <For each={sections()}>
                {(sec) => {
                  const on = (): boolean => highlight() && sec.idx === activeIdx();
                  return (
                    <button
                      type="button"
                      onClick={() => pickSection(sec.idx)}
                      style={{
                        display: 'flex',
                        'align-items': 'flex-start',
                        gap: '0.55rem',
                        width: '100%',
                        'text-align': 'left',
                        cursor: 'pointer',
                        'margin-bottom': '0.4rem',
                        padding: '0.5rem 0.6rem',
                        'border-radius': '8px',
                        border: `1px solid ${on() ? accent() : 'var(--line)'}`,
                        'border-left': `3px solid ${on() ? accent() : 'transparent'}`,
                        background: on() ? `${accent()}10` : '#fff',
                      }}
                    >
                      <span
                        style={{
                          'flex-shrink': 0,
                          width: '1.5rem',
                          height: '1.5rem',
                          'border-radius': '50%',
                          border: `1px solid ${accent()}66`,
                          color: accent(),
                          display: 'inline-flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          'font-size': '0.72rem',
                          'font-weight': 700,
                          'font-variant-numeric': 'tabular-nums',
                        }}
                      >
                        {sec.idx + 1}
                      </span>
                      <span style={{ 'min-width': 0 }}>
                        <span
                          style={{ 'font-size': '0.85rem', 'line-height': 1.35, color: '#1f2937' }}
                        >
                          {sec.title}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            'font-size': '0.66rem',
                            color: '#9a958a',
                            'margin-top': '0.15rem',
                          }}
                        >
                          seg {sec.startSeg}
                          {sec.endSeg !== sec.startSeg ? `–${sec.endSeg}` : ''}
                        </span>
                      </span>
                    </button>
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
                The whole daf is the path with the segment left off. Each section is a span of it —
                click one to anchor it.
              </p>
            </Panel>
          </Show>

          <Show when={step() === 'anchor'}>
            <Panel title="Anchor" accent="var(--accent)">
              <Row k="spine" v="bavli" mono />
              <Row
                k="span"
                v={
                  active()
                    ? `[${props.example.page}, seg ${active()?.startSeg}–${active()?.endSeg}]`
                    : '[2a, seg n]'
                }
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
                <strong style={{ color: accent() }}>{active()?.title ?? 'a section'}</strong>
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
                on this daf — a typed body pinned to where it sits.
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
                    anchor: [{props.example.page}, seg {active()?.startSeg}–{active()?.endSeg}]
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
