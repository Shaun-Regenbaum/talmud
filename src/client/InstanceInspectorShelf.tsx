/**
 * InstanceInspectorShelf — bottom drawer that slides up over the daf when
 * the dev-mode 'i' button on a synthesis card is clicked. Scoped to a
 * SPECIFIC instance (e.g. "Rabbi Yehuda" on a particular daf), letting you
 * walk through every enrichment feeding the synthesis 1-by-1, plus inspect
 * the rendered prompts and telemetry.
 *
 * Purely presentational — MarkEnrichmentCards owns the state and passes
 * everything in. There is at most one drawer open at a time (the click
 * handler enforces single-open by setting a module-level signal).
 */

import { createSignal, For, Show, type JSX } from 'solid-js';

interface EnrichmentDef {
  id: string;
  label: string;
  mark: string;
  mode?: 'augment-content' | 'refine-anchors' | 'aggregate';
  scope?: 'global' | 'local';
  status?: 'draft' | 'promoted';
}

interface RunResult {
  content: string;
  parsed: unknown;
  parse_error: string | null;
  model: string;
  total_ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | null;
  transport?: string;
  attempts?: number;
  elapsed_ms?: number;
  resolved?: { system_prompt: string; user_prompt: string };
  deps_resolved?: Record<string, unknown>;
  anchors_resolved?: Record<string, unknown>;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'loading'; stamp: string }
  | { kind: 'ok'; stamp: string; result: RunResult }
  | { kind: 'error'; stamp: string; error: string };

interface Props {
  instanceLabel: string;
  markId: string;
  aggregates: EnrichmentDef[];
  leaves: EnrichmentDef[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  currentView: EnrichmentDef | null;
  currentRun: RunState;
  depBadges: string[];
  prettyDepLabel: (depId: string) => string;
  renderBody: () => JSX.Element;
  onClose: () => void;
}

type Tab = 'synthesis' | 'prompts' | 'telemetry';

export default function InstanceInspectorShelf(props: Props) {
  const [tab, setTab] = createSignal<Tab>('synthesis');

  const result = (): RunResult | null =>
    props.currentRun.kind === 'ok' ? props.currentRun.result : null;
  const errorMsg = (): string | null =>
    props.currentRun.kind === 'error' ? props.currentRun.error : null;

  return (
    <div style={{
      position: 'fixed',
      left: 0, right: 0, bottom: 0,
      height: '45vh',
      'min-height': '320px',
      'max-height': '75vh',
      background: '#fff',
      'border-top': '2px solid #000',
      'box-shadow': '0 -4px 20px rgba(0,0,0,0.15)',
      'z-index': 1000,
      display: 'flex',
      'flex-direction': 'column',
      'font-family': 'system-ui, sans-serif',
      'font-size': '13px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        'border-bottom': '1px solid #eee',
        background: '#fafafa',
      }}>
        <strong>{props.instanceLabel}</strong>
        <code style={{ color: '#888', 'font-size': '0.75rem' }}>{props.markId}</code>
        <Show when={result()}>{(r) => (
          <span style={{ color: '#666', 'font-size': '0.75rem', 'font-family': 'ui-monospace, Menlo, monospace' }}>
            {r().model} · {r().total_ms}ms
            <Show when={r().usage?.cost}>
              {' '}· ${(r().usage?.cost ?? 0).toFixed(6)}
            </Show>
          </span>
        )}</Show>
        <Show when={errorMsg()}>
          <span style={{ 'font-size': '0.75rem', color: '#c00' }}>✗ failed</span>
        </Show>
        <button
          onClick={props.onClose}
          style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: 'transparent', border: '1px solid #ccc', 'border-radius': '3px' }}
        >
          close
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', 'border-bottom': '1px solid #eee', background: '#fafafa' }}>
        <For each={(['synthesis', 'prompts', 'telemetry'] as const)}>{(t) => (
          <button
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              'font-size': '13px',
              border: 0,
              'border-bottom': tab() === t ? '2px solid #000' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              'font-weight': tab() === t ? 600 : 400,
            }}
          >
            {t}
          </button>
        )}</For>
      </div>

      {/* Body */}
      <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.75rem' }}>
        <Show when={errorMsg()}>{(msg) => (
          <div style={{ background: '#fee', color: '#900', padding: '0.6rem', 'border-radius': '4px', 'margin-bottom': '0.6rem', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}>
            {msg()}
          </div>
        )}</Show>

        <Show when={tab() === 'synthesis'}>
          <div style={{ 'font-size': '0.72rem', color: '#888', display: 'flex', 'align-items': 'center', gap: '0.4rem', 'margin-bottom': '0.6rem' }}>
            <span>view:</span>
            <select
              value={props.selected ?? ''}
              onChange={(e) => props.onSelect(e.currentTarget.value || null)}
              style={{ 'font-size': '0.78rem', padding: '2px 6px', 'font-family': 'inherit' }}
            >
              <Show when={props.aggregates.length > 0}>
                <option value="">{`[${props.aggregates[0]?.scope ?? 'local'}] synthesis`}</option>
              </Show>
              <For each={props.leaves}>{(d) => (
                <option value={d.id}>{`[${d.scope ?? 'global'}] ${props.prettyDepLabel(d.id)}`}</option>
              )}</For>
            </select>
            <Show when={props.currentView?.mode === 'aggregate'}>
              <span style={{ color: '#aaa' }}>aggregate</span>
            </Show>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #eee',
            'border-radius': '6px',
            padding: '0.7rem 0.85rem',
            'margin-bottom': '0.6rem',
          }}>
            {props.renderBody()}
          </div>

          <Show when={props.depBadges.length > 0}>
            <div style={{
              display: 'flex', gap: '0.3rem', 'align-items': 'center',
              'flex-wrap': 'wrap',
            }}>
              <span style={{ 'font-size': '0.7rem', color: '#888' }}>built from</span>
              <For each={props.depBadges}>{(depId) => (
                <button
                  onClick={() => props.onSelect(depId === props.currentView?.id ? null : depId)}
                  title={`View ${depId}`}
                  style={{
                    padding: '2px 9px', 'font-size': '0.72rem', cursor: 'pointer',
                    background: props.selected === depId ? '#000' : '#f0f0f0',
                    color: props.selected === depId ? '#fff' : '#444',
                    border: '1px solid #ddd', 'border-radius': '10px',
                    'font-family': 'inherit',
                  }}
                >
                  {props.prettyDepLabel(depId)}
                </button>
              )}</For>
            </div>
          </Show>
        </Show>

        <Show when={tab() === 'prompts'}>
          <Show when={result()?.resolved} fallback={
            <div style={{ color: '#999', 'font-style': 'italic' }}>
              {props.currentRun.kind === 'loading' ? 'running…' : 'no run output yet (or this leaf is served from a cached parent — re-run via the marks panel to capture prompts)'}
            </div>
          }>{(resolved) => (
            <>
              <details open style={{ 'margin-bottom': '0.5rem' }}>
                <summary style={{ color: '#666', cursor: 'pointer' }}>system_prompt</summary>
                <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px' }}>
                  {resolved().system_prompt}
                </pre>
              </details>
              <details open>
                <summary style={{ color: '#666', cursor: 'pointer' }}>user_prompt</summary>
                <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px' }}>
                  {resolved().user_prompt}
                </pre>
              </details>
            </>
          )}</Show>
        </Show>

        <Show when={tab() === 'telemetry'}>
          <Show when={result()} fallback={
            <div style={{ color: '#999', 'font-style': 'italic' }}>no run output yet</div>
          }>{(r) => (
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: 0 }}>
              {JSON.stringify({
                model: r().model,
                transport: r().transport,
                attempts: r().attempts,
                elapsed_ms: r().elapsed_ms,
                total_ms: r().total_ms,
                usage: r().usage,
                parse_error: r().parse_error,
              }, null, 2)}
            </pre>
          )}</Show>
        </Show>
      </div>
    </div>
  );
}
