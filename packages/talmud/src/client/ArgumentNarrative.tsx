/**
 * Story view for narrative-primary argument sections (section typing P2b). When
 * a section types as a narrative (e.g. the Ashmedai/Solomon aggadah), the
 * dispute-oriented voice graph is the wrong model, so the sidebar shows this
 * instead: the actors (characters) and the ordered beats of the story, from the
 * argument.narrative enrichment. Fetched on demand (dev mode only), so it costs
 * an LLM call only when a dev opens a narrative section.
 */

import { createEffect, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { lang } from './i18n';
import { runProducer } from './runProducer';

interface Actor {
  name: string;
  role: string;
}
interface Beat {
  n: number;
  kind?: string;
  actor: string;
  action: string;
  excerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
}
interface NarrativeData {
  summary: string;
  actors: Actor[];
  beats: Beat[];
}

const KIND_COLOR: Record<string, string> = {
  scene: '#0369a1',
  action: '#15803d',
  dialogue: '#7c3aed',
  turn: '#b45309',
  resolution: '#be123c',
};

async function runNarrative(
  tractate: string,
  page: string,
  markInput: unknown,
): Promise<NarrativeData | null> {
  const result = await runProducer(
    { enrichment_id: 'argument.narrative', tractate, page, mark_input: markInput, lang: lang() },
    { pollTimeoutMs: 90_000 },
  );
  const p = result.parsed as NarrativeData | undefined;
  return p && Array.isArray(p.beats) ? p : null;
}

const ROLE_COLOR: Record<string, string> = {
  protagonist: '#0369a1',
  antagonist: '#b91c1c',
  authority: '#7c3aed',
  narrator: '#6b7280',
  other: '#6b7280',
};

export default function ArgumentNarrative(props: {
  section: { startSegIdx?: number; endSegIdx?: number; title?: string };
  tractate: string;
  page: string;
  /** Highlight a beat's span on the daf (null clears). */
  onHighlight?: (
    range: { start: number; end: number; tokenStart?: number; tokenEnd?: number } | null,
  ) => void;
}): JSX.Element {
  const [data] = createResource(
    () => `${props.tractate}|${props.page}|${props.section.startSegIdx}-${props.section.endSegIdx}`,
    () => runNarrative(props.tractate, props.page, props.section),
  );
  const [activeBeat, setActiveBeat] = createSignal<number | null>(null);
  // The argument card reuses this component across section switches (it's keyed on
  // card kind, not the section), so reset the active beat + clear any daf
  // highlight when the section changes — otherwise the previous section's beat
  // selection bleeds into the next one.
  createEffect(() => {
    void props.section.startSegIdx;
    void props.section.endSegIdx;
    setActiveBeat(null);
    props.onHighlight?.(null);
  });

  return (
    <div style={{ 'margin-top': '0.6rem' }}>
      <div
        style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: '#999',
          'margin-bottom': '0.4rem',
          display: 'flex',
          'align-items': 'center',
          gap: '0.4rem',
        }}
      >
        Story
        <span
          style={{
            'font-size': '0.6rem',
            color: '#7c3aed',
            background: '#f3e8ff',
            padding: '0 0.3rem',
            'border-radius': '3px',
            'text-transform': 'none',
            'letter-spacing': 0,
          }}
        >
          narrative
        </span>
      </div>

      <Show when={data.loading}>
        <div style={{ color: '#999', 'font-size': '0.8rem' }}>Composing the story…</div>
      </Show>
      <Show when={data.error}>
        <div style={{ color: '#b45309', 'font-size': '0.78rem' }}>
          Couldn't load the narrative view.
        </div>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <Show when={d().summary}>
              <div
                style={{
                  'font-size': '0.86rem',
                  color: '#333',
                  'line-height': 1.6,
                  'margin-bottom': '0.6rem',
                }}
              >
                {d().summary}
              </div>
            </Show>

            <Show when={d().actors?.length > 0}>
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '0.35rem',
                  'margin-bottom': '0.7rem',
                }}
              >
                <For each={d().actors}>
                  {(a) => (
                    <span
                      style={{
                        'font-size': '0.72rem',
                        padding: '0.1rem 0.45rem',
                        'border-radius': '999px',
                        border: `1px solid ${ROLE_COLOR[a.role] ?? '#ccc'}`,
                        color: ROLE_COLOR[a.role] ?? '#666',
                      }}
                      title={a.role}
                    >
                      {a.name}
                    </span>
                  )}
                </For>
              </div>
            </Show>

            <Show when={d().beats?.length > 0}>
              <ol
                style={{
                  margin: 0,
                  padding: 0,
                  'list-style': 'none',
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '0.3rem',
                }}
              >
                <For each={[...d().beats].sort((a, b) => a.n - b.n)}>
                  {(b) => {
                    const anchored = () => typeof b.startSegIdx === 'number';
                    const isActive = () => activeBeat() === b.n;
                    const toggle = () => {
                      if (!anchored() || !props.onHighlight) return;
                      const next = isActive() ? null : b.n;
                      setActiveBeat(next);
                      props.onHighlight(
                        next === null
                          ? null
                          : {
                              start: b.startSegIdx!,
                              end: b.endSegIdx ?? b.startSegIdx!,
                              tokenStart: b.tokenStart,
                              tokenEnd: b.tokenEnd,
                            },
                      );
                    };
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: a beat is a list item in the ordered beat list; converting it to a button would break the ol>li structure and layout
                      <li
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the beat stays an li in the DOM so the ol keeps valid children; a nested button would change the reader layout
                        role="button"
                        tabIndex={0}
                        title={anchored() ? 'Highlight this beat on the daf' : undefined}
                        style={{
                          'font-size': '0.82rem',
                          color: '#444',
                          'line-height': 1.5,
                          display: 'flex',
                          gap: '0.4rem',
                          'align-items': 'baseline',
                          padding: '0.15rem 0.3rem',
                          'border-radius': '4px',
                          cursor: anchored() ? 'pointer' : 'default',
                          background: isActive() ? '#fff7ed' : 'transparent',
                          'box-shadow': isActive() ? 'inset 2px 0 0 #ea580c' : 'none',
                        }}
                      >
                        <span
                          style={{
                            'flex-shrink': 0,
                            color: '#bbb',
                            'font-variant-numeric': 'tabular-nums',
                            'font-size': '0.72rem',
                          }}
                        >
                          {b.n}
                        </span>
                        <Show when={b.kind}>
                          <span
                            style={{
                              'flex-shrink': 0,
                              'font-size': '0.6rem',
                              'text-transform': 'uppercase',
                              'letter-spacing': '0.04em',
                              color: KIND_COLOR[b.kind ?? ''] ?? '#888',
                            }}
                          >
                            {b.kind}
                          </span>
                        </Show>
                        <span>
                          <Show when={b.actor}>
                            <span style={{ 'font-weight': 600, color: '#222' }}>{b.actor}: </span>
                          </Show>
                          {b.action}
                        </span>
                      </li>
                    );
                  }}
                </For>
              </ol>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
