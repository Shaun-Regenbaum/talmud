/**
 * Story view for narrative-primary argument sections (section typing P2b). When
 * a section types as a narrative (e.g. the Ashmedai/Solomon aggadah), the
 * dispute-oriented voice graph is the wrong model, so the sidebar shows this
 * instead: the actors (characters) and the ordered beats of the story, from the
 * argument.narrative enrichment. Fetched on demand (dev mode only), so it costs
 * an LLM call only when a dev opens a narrative section.
 */

import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { lang } from './i18n';

interface Actor { name: string; role: string }
interface Beat { n: number; kind?: string; actor: string; action: string; excerpt?: string; startSegIdx?: number; endSegIdx?: number; tokenStart?: number; tokenEnd?: number }
interface NarrativeData { summary: string; actors: Actor[]; beats: Beat[] }

const KIND_COLOR: Record<string, string> = {
  scene: '#0369a1', action: '#15803d', dialogue: '#7c3aed', turn: '#b45309', resolution: '#be123c',
};

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

async function pollJob(runId: string, cacheKey?: string): Promise<unknown> {
  const start = Date.now();
  const qs = cacheKey ? `?k=${encodeURIComponent(cacheKey)}` : '';
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`/api/studio/run-status/${encodeURIComponent(runId)}${qs}`);
    const j = await res.json() as { status?: string; result?: { parsed?: unknown }; error?: string };
    if (j.status === 'ok') return j.result?.parsed;
    if (j.status === 'error') throw new Error(j.error ?? 'narrative run failed');
  }
  throw new Error('narrative run timed out');
}

async function runNarrative(tractate: string, page: string, markInput: unknown): Promise<NarrativeData | null> {
  const res = await fetch('/api/studio/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrichment_id: 'argument.narrative', tractate, page, mark_input: markInput, lang: lang() }),
  });
  const j = await res.json() as { status?: string; runId?: string; cacheKey?: string; result?: { parsed?: unknown }; error?: string };
  let parsed: unknown;
  if (j.status === 'ok') parsed = j.result?.parsed;
  else if (j.status === 'pending' && j.runId) parsed = await pollJob(j.runId, j.cacheKey);
  else if (j.status === 'error') throw new Error(j.error ?? 'narrative run failed');
  else parsed = j.result?.parsed;
  const p = parsed as NarrativeData | undefined;
  return p && Array.isArray(p.beats) ? p : null;
}

const ROLE_COLOR: Record<string, string> = {
  protagonist: '#0369a1', antagonist: '#b91c1c', authority: '#7c3aed', narrator: '#6b7280', other: '#6b7280',
};

export default function ArgumentNarrative(props: {
  section: { startSegIdx?: number; endSegIdx?: number; title?: string };
  tractate: string;
  page: string;
  /** Highlight a beat's span on the daf (null clears). */
  onHighlight?: (range: { start: number; end: number; tokenStart?: number; tokenEnd?: number } | null) => void;
}): JSX.Element {
  const [data] = createResource(
    () => `${props.tractate}|${props.page}|${props.section.startSegIdx}-${props.section.endSegIdx}`,
    () => runNarrative(props.tractate, props.page, props.section),
  );
  const [activeBeat, setActiveBeat] = createSignal<number | null>(null);

  return (
    <div style={{ 'margin-top': '0.6rem' }}>
      <div style={{
        'font-size': '0.7rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em',
        color: '#999', 'margin-bottom': '0.4rem', display: 'flex', 'align-items': 'center', gap: '0.4rem',
      }}>
        Story
        <span style={{ 'font-size': '0.6rem', color: '#7c3aed', background: '#f3e8ff', padding: '0 0.3rem', 'border-radius': '3px', 'text-transform': 'none', 'letter-spacing': 0 }}>narrative</span>
      </div>

      <Show when={data.loading}>
        <div style={{ color: '#999', 'font-size': '0.8rem' }}>Composing the story…</div>
      </Show>
      <Show when={data.error}>
        <div style={{ color: '#b45309', 'font-size': '0.78rem' }}>Couldn't load the narrative view.</div>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <Show when={d().summary}>
              <div style={{ 'font-size': '0.86rem', color: '#333', 'line-height': 1.6, 'margin-bottom': '0.6rem' }}>{d().summary}</div>
            </Show>

            <Show when={d().actors?.length > 0}>
              <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.7rem' }}>
                <For each={d().actors}>{(a) => (
                  <span style={{
                    'font-size': '0.72rem', padding: '0.1rem 0.45rem', 'border-radius': '999px',
                    border: `1px solid ${ROLE_COLOR[a.role] ?? '#ccc'}`, color: ROLE_COLOR[a.role] ?? '#666',
                  }} title={a.role}>{a.name}</span>
                )}</For>
              </div>
            </Show>

            <Show when={d().beats?.length > 0}>
              <ol style={{ margin: 0, padding: 0, 'list-style': 'none', display: 'flex', 'flex-direction': 'column', gap: '0.3rem' }}>
                <For each={[...d().beats].sort((a, b) => a.n - b.n)}>{(b) => {
                  const anchored = () => typeof b.startSegIdx === 'number';
                  const isActive = () => activeBeat() === b.n;
                  const toggle = () => {
                    if (!anchored() || !props.onHighlight) return;
                    const next = isActive() ? null : b.n;
                    setActiveBeat(next);
                    props.onHighlight(next === null ? null : { start: b.startSegIdx!, end: b.endSegIdx ?? b.startSegIdx!, tokenStart: b.tokenStart, tokenEnd: b.tokenEnd });
                  };
                  return (
                    <li
                      onClick={toggle}
                      title={anchored() ? 'Highlight this beat on the daf' : undefined}
                      style={{
                        'font-size': '0.82rem', color: '#444', 'line-height': 1.5,
                        display: 'flex', gap: '0.4rem', 'align-items': 'baseline',
                        padding: '0.15rem 0.3rem', 'border-radius': '4px',
                        cursor: anchored() ? 'pointer' : 'default',
                        background: isActive() ? '#fff7ed' : 'transparent',
                        'box-shadow': isActive() ? 'inset 2px 0 0 #ea580c' : 'none',
                      }}
                    >
                      <span style={{ 'flex-shrink': 0, color: '#bbb', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.72rem' }}>{b.n}</span>
                      <Show when={b.kind}>
                        <span style={{
                          'flex-shrink': 0, 'font-size': '0.6rem', 'text-transform': 'uppercase', 'letter-spacing': '0.04em',
                          color: KIND_COLOR[b.kind ?? ''] ?? '#888',
                        }}>{b.kind}</span>
                      </Show>
                      <span>
                        <Show when={b.actor}><span style={{ 'font-weight': 600, color: '#222' }}>{b.actor}: </span></Show>
                        {b.action}
                      </span>
                    </li>
                  );
                }}</For>
              </ol>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
