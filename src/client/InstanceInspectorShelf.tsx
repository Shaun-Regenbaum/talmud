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

import { For, Show, createSignal, type JSX } from 'solid-js';

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
  cache_hit?: boolean;
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
  /** Source TEXTS that fed the current view's prompt, fetched on demand from
   *  /api/run-sources (gemara / commentaries / mishna / halacha-refs /
   *  yerushalmi-text / context). Null while loading; {} when the producer pulls
   *  no source texts. */
  sources: Record<string, { chars: number; content: string }> | null;
}

export default function InstanceInspectorShelf(props: Props) {
  const result = (): RunResult | null =>
    props.currentRun.kind === 'ok' ? props.currentRun.result : null;
  const errorMsg = (): string | null =>
    props.currentRun.kind === 'error' ? props.currentRun.error : null;

  // Which source chip's text is expanded (one at a time, like a tab strip).
  const [openSource, setOpenSource] = createSignal<string | null>(null);

  // Compact one-line telemetry — everything tied to this single run, so it
  // sits with the generation instead of behind a separate tab. On a cache
  // hit total_ms is 0, so report the persisted generation time (elapsed_ms).
  const metaLine = (r: RunResult): string => {
    const parts = [r.model, r.cache_hit ? 'cached' : 'fresh'];
    if (typeof r.elapsed_ms === 'number') parts.push(`gen ${r.elapsed_ms}ms`);
    const tok = r.usage?.total_tokens;
    if (typeof tok === 'number') parts.push(`${tok} tok`);
    if (typeof r.usage?.cost === 'number') parts.push(`$${r.usage.cost.toFixed(6)}`);
    return parts.join(' · ');
  };

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

      {/* Body — one unified view: view picker + built-from, a compact
          telemetry line, the generation, then collapsible prompt + raw
          telemetry. Everything here belongs to the single selected run. */}
      <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.75rem' }}>
        <Show when={errorMsg()}>{(msg) => (
          <div style={{ background: '#fee', color: '#900', padding: '0.6rem', 'border-radius': '4px', 'margin-bottom': '0.6rem', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}>
            {msg()}
          </div>
        )}</Show>

        {/* view picker + aggregate marker */}
        <div style={{ 'font-size': '0.72rem', color: '#888', display: 'flex', 'align-items': 'center', gap: '0.4rem', 'margin-bottom': '0.5rem' }}>
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

        {/* compact telemetry line for this run */}
        <Show when={result()}>{(r) => (
          <div style={{ 'font-size': '0.72rem', color: '#666', 'font-family': 'ui-monospace, Menlo, monospace', 'margin-bottom': '0.5rem' }}>
            {metaLine(r())}
          </div>
        )}</Show>

        {/* generation */}
        <div style={{
          background: '#fafafa',
          border: '1px solid #eee',
          'border-radius': '6px',
          padding: '0.7rem 0.85rem',
          'margin-bottom': '0.6rem',
        }}>
          {props.renderBody()}
        </div>

        {/* the mark instance this run was built from — the 'extraction' that
            tags/prose render their fields off. Collapsed; present on aggregate
            runs that resolved their anchors. */}
        <Show when={result()?.anchors_resolved}>{(anchors) => (
          <details style={{ 'margin-bottom': '0.5rem' }}>
            <summary style={{ color: '#666', cursor: 'pointer', 'font-size': '0.78rem' }}>instance (extraction)</summary>
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px' }}>
              {JSON.stringify(anchors(), null, 2)}
            </pre>
          </details>
        )}</Show>

        <Show when={props.depBadges.length > 0}>
          <div style={{
            display: 'flex', gap: '0.3rem', 'align-items': 'center',
            'flex-wrap': 'wrap', 'margin-bottom': '0.6rem',
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

        {/* source TEXTS that grounded this generation — the daf gemara,
            commentaries, mishna, halacha refs, Yerushalmi, and aggregated
            external context (gathered transitively through the dep tree).
            Styled like "built from": a chip per source; click one to read its
            text (length-capped preview; the full text went to the LLM). Fetched
            on demand (/api/run-sources) so the reader hot path never carries it. */}
        <Show when={props.sources && Object.keys(props.sources).length > 0 ? props.sources : null}>{(sources) => (
          <div style={{ 'margin-bottom': '0.6rem' }}>
            <div style={{
              display: 'flex', gap: '0.3rem', 'align-items': 'center', 'flex-wrap': 'wrap',
            }}>
              <span style={{ 'font-size': '0.7rem', color: '#888' }}>sources</span>
              <For each={Object.entries(sources())}>{([name, src]) => (
                <button
                  onClick={() => setOpenSource(openSource() === name ? null : name)}
                  title={`${src.chars.toLocaleString()} chars`}
                  style={{
                    padding: '2px 9px', 'font-size': '0.72rem', cursor: 'pointer',
                    background: openSource() === name ? '#000' : '#f0f0f0',
                    color: openSource() === name ? '#fff' : '#444',
                    border: '1px solid #ddd', 'border-radius': '10px',
                    'font-family': 'inherit',
                  }}
                >
                  {name}
                </button>
              )}</For>
            </div>
            <Show when={openSource() && sources()[openSource()!] ? sources()[openSource()!] : null}>{(src) => (
              <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px', 'max-height': '40vh', 'overflow-y': 'auto' }}>
                {src().content}
              </pre>
            )}</Show>
          </div>
        )}</Show>

        {/* prompt sent to the model — collapsed by default */}
        <Show when={result()?.resolved}>{(resolved) => (
          <details style={{ 'margin-bottom': '0.5rem' }}>
            <summary style={{ color: '#666', cursor: 'pointer', 'font-size': '0.78rem' }}>prompt (system + user)</summary>
            <div style={{ color: '#888', 'font-size': '0.7rem', margin: '0.4rem 0 0.1rem' }}>system</div>
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: 0, background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px' }}>
              {resolved().system_prompt}
            </pre>
            <div style={{ color: '#888', 'font-size': '0.7rem', margin: '0.5rem 0 0.1rem' }}>user</div>
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: 0, background: '#f8f8f8', padding: '0.6rem', 'border-radius': '3px' }}>
              {resolved().user_prompt}
            </pre>
          </details>
        )}</Show>

        {/* raw telemetry — collapsed by default */}
        <Show when={result()}>{(r) => (
          <details>
            <summary style={{ color: '#666', cursor: 'pointer', 'font-size': '0.78rem' }}>raw telemetry</summary>
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0' }}>
              {JSON.stringify({
                model: r().model,
                transport: r().transport,
                attempts: r().attempts,
                cache_hit: r().cache_hit,
                elapsed_ms: r().elapsed_ms,
                total_ms: r().total_ms,
                usage: r().usage,
                parse_error: r().parse_error,
              }, null, 2)}
            </pre>
          </details>
        )}</Show>
      </div>
    </div>
  );
}
