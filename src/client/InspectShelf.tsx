/**
 * InspectShelf — bottom drawer that slides up over the daf viewer when
 * "i" is clicked on any mark. One drawer, single mark at a time.
 *
 * For KV-defined marks shows:
 *   - id, label, model, status
 *   - error message if the run failed (only when devMode is on)
 *   - parsed/raw output of the most recent run
 *   - rendered prompts (post-template-substitution)
 *   - editable system_prompt / user_prompt_template / model + [save & rerun]
 *
 * For code-defined seed marks shows:
 *   - id, label, anchor, render, description
 *   - explanatory note that this mark is wired to legacy DafViewer code
 *     and editing prompts requires forking to a KV definition (todo).
 *
 * Closing the drawer doesn't disable the mark — toggle stays on.
 */

import { createSignal, createEffect, Show } from 'solid-js';
import type { RunState, RunResult, EnrichmentDefinition, Row } from './MarksRegistryPanel';

type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

interface Props {
  row: Row;
  state: RunState;
  devMode: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRerun: () => void;
}

async function saveDef(def: EnrichmentDefinition): Promise<EnrichmentDefinition> {
  const r = await fetch(`/api/studio/enrichments/${encodeURIComponent(def.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json() as { enrichment: EnrichmentDefinition };
  return j.enrichment;
}

export default function InspectShelf(props: Props) {
  const isEditable = () => props.row.source === 'enrichment';
  const def = (): EnrichmentDefinition | null =>
    props.row.source === 'enrichment' ? props.row.def : null;
  const seed = () => props.row.source === 'seed' ? props.row.seed : null;
  const workerMark = () => props.row.source === 'mark' ? props.row.def : null;

  const [systemPrompt, setSystemPrompt] = createSignal('');
  const [userPromptTpl, setUserPromptTpl] = createSignal('');
  const [model, setModel] = createSignal<string>('');
  const [tab, setTab] = createSignal<'output' | 'prompts' | 'edit' | 'telemetry'>('output');
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  // When the inspected mark changes, reset edit fields. For code-defined
  // seeds, leave the fields empty (they're inert).
  createEffect(() => {
    const d = def();
    if (d) {
      setSystemPrompt(d.system_prompt);
      setUserPromptTpl(d.user_prompt_template);
      setModel(d.model ?? '');
    } else {
      setSystemPrompt('');
      setUserPromptTpl('');
      setModel('');
    }
    setSaveError(null);
  });

  const dirty = () => {
    const d = def();
    if (!d) return false;
    return systemPrompt() !== d.system_prompt ||
      userPromptTpl() !== d.user_prompt_template ||
      (model() || undefined) !== d.model;
  };

  const onSave = async (rerunAfter: boolean) => {
    const d = def();
    if (!d) return;
    setSaving(true); setSaveError(null);
    try {
      await saveDef({
        ...d,
        system_prompt: systemPrompt(),
        user_prompt_template: userPromptTpl(),
        model: (model() || undefined) as LLMModelId | undefined,
      });
      props.onSaved();
      if (rerunAfter) props.onRerun();
    } catch (e) {
      setSaveError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const result = (): RunResult | null =>
    props.state.kind === 'ok' ? props.state.result : null;
  const errorMsg = (): string | null =>
    props.state.kind === 'error' ? props.state.error : null;

  const headerLabel = () => {
    const d = def(); const s = seed();
    return d ? (d.label || d.id) : s ? s.label : '';
  };
  const headerId = () => {
    const d = def(); const s = seed();
    return d ? d.id : s ? s.id : '';
  };
  const headerAnchorRender = () => {
    const s = seed();
    if (s) return `${s.anchor} · ${s.render}`;
    const d = def();
    if (d) return `(KV) mark=${d.mark}`;
    return '';
  };

  return (
    <div style={{
      position: 'fixed',
      left: 0, right: 0, bottom: 0,
      height: '40vh',
      'min-height': '280px',
      'max-height': '70vh',
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
      <div style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', 'border-bottom': '1px solid #eee', background: '#fafafa' }}>
        <strong>{headerLabel()}</strong>
        <code style={{ color: '#888', 'font-size': '0.75rem' }}>{headerId()}</code>
        <span style={{ color: '#aaa', 'font-size': '0.7rem', 'font-family': 'monospace' }}>{headerAnchorRender()}</span>
        <Show when={isEditable() && def()?.status === 'draft'}>
          <span style={{ 'font-size': '0.7rem', background: '#fed', color: '#a60', padding: '1px 6px', 'border-radius': '3px' }}>draft</span>
        </Show>
        <Show when={!isEditable()}>
          <span style={{ 'font-size': '0.7rem', background: '#eef', color: '#558', padding: '1px 6px', 'border-radius': '3px' }}>built-in</span>
        </Show>
        <Show when={errorMsg() && props.devMode}>
          <span style={{ 'font-size': '0.75rem', color: '#c00' }}>✗ failed</span>
        </Show>
        <Show when={result()}>{(r) => (
          <span style={{ color: '#666', 'font-size': '0.75rem', 'font-family': 'ui-monospace, Menlo, monospace' }}>
            {r().model} · {r().total_ms}ms
            <Show when={r().usage?.cost}>
              {' '}· ${(r().usage?.cost ?? 0).toFixed(6)}
            </Show>
          </span>
        )}</Show>
        <button
          onClick={props.onClose}
          style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: 'transparent', border: '1px solid #ccc', 'border-radius': '3px' }}
        >
          close
        </button>
      </div>

      {/* Tab strip — built-in seeds only get the 'about' tab. */}
      <div style={{ display: 'flex', 'border-bottom': '1px solid #eee', background: '#fafafa' }}>
        <Show when={isEditable()} fallback={
          <button
            disabled
            style={{ padding: '6px 14px', 'font-size': '13px', border: 0, 'border-bottom': '2px solid #000', background: 'transparent', 'font-weight': 600 }}
          >
            about
          </button>
        }>
          {(['output', 'prompts', 'edit', 'telemetry'] as const).map((t) => (
            <button
              onClick={() => setTab(t)}
              style={{ padding: '6px 14px', 'font-size': '13px', border: 0, 'border-bottom': tab() === t ? '2px solid #000' : '2px solid transparent', background: 'transparent', cursor: 'pointer', 'font-weight': tab() === t ? 600 : 400 }}
            >
              {t}
              <Show when={t === 'edit' && dirty()}>
                <span style={{ color: '#c60', 'margin-left': '4px' }}>•</span>
              </Show>
            </button>
          ))}
        </Show>
      </div>

      {/* Body */}
      <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.75rem' }}>
        <Show when={errorMsg() && props.devMode}>{(msg) => (
          <div style={{ background: '#fee', color: '#900', padding: '0.6rem', 'border-radius': '4px', 'margin-bottom': '0.6rem', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}>
            {msg()}
          </div>
        )}</Show>

        <Show when={seed()}>{(s) => (
          <div>
            <p style={{ margin: '0 0 0.6rem', color: '#444' }}>{s().description}</p>
            <dl style={{ display: 'grid', 'grid-template-columns': 'auto 1fr', gap: '0.3rem 0.8rem', 'font-size': '12px', 'font-family': 'ui-monospace, Menlo, monospace', 'margin-bottom': '0.6rem' }}>
              <dt style={{ color: '#888' }}>id</dt><dd style={{ margin: 0 }}>{s().id}</dd>
              <dt style={{ color: '#888' }}>anchor</dt><dd style={{ margin: 0 }}>{s().anchor}</dd>
              <dt style={{ color: '#888' }}>render</dt><dd style={{ margin: 0 }}>{s().render}</dd>
            </dl>
            <p style={{ color: '#888', 'font-size': '12px', margin: 0 }}>
              Built-in mark — wired to legacy DafViewer code. Editing prompts requires forking to a KV definition (TODO).
            </p>
          </div>
        )}</Show>

        <Show when={isEditable() && tab() === 'output'}>
          <Show when={result()} fallback={
            <div style={{ color: '#999', 'font-style': 'italic' }}>
              {props.state.kind === 'loading' ? 'running…' : 'not yet run'}
            </div>
          }>{(r) => (
            <Show when={r().parsed} fallback={
              <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'system-ui, sans-serif', margin: 0, 'line-height': 1.5 }}>{r().content}</pre>
            }>
              <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: 0 }}>
                {JSON.stringify(r().parsed, null, 2)}
              </pre>
            </Show>
          )}</Show>
          <Show when={result()?.parse_error}>{(err) => (
            <div style={{ color: '#c00', 'margin-top': '0.5rem', 'font-family': 'monospace', 'font-size': '12px' }}>
              parse_error: {err()}
            </div>
          )}</Show>
        </Show>

        <Show when={isEditable() && tab() === 'prompts'}>
          <Show when={result()} fallback={<div style={{ color: '#999' }}>no run output yet</div>}>{(r) => (
            <>
              <details open style={{ 'margin-bottom': '0.5rem' }}>
                <summary style={{ color: '#666', cursor: 'pointer' }}>system_prompt (rendered)</summary>
                <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px' }}>
                  {r().resolved.system_prompt}
                </pre>
              </details>
              <details open>
                <summary style={{ color: '#666', cursor: 'pointer' }}>user_prompt (rendered)</summary>
                <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: '0.4rem 0 0', background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px' }}>
                  {r().resolved.user_prompt}
                </pre>
              </details>
            </>
          )}</Show>
        </Show>

        <Show when={isEditable() && tab() === 'edit'}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
            <div>
              <label style={{ 'font-size': '12px', color: '#666' }}>model (blank = use settings default)</label>
              <input
                value={model()}
                onInput={(e) => setModel(e.currentTarget.value)}
                placeholder="openrouter/deepseek/deepseek-v4-pro"
                style={{ width: '100%', padding: '4px 6px', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}
              />
            </div>
            <div>
              <label style={{ 'font-size': '12px', color: '#666' }}>system_prompt</label>
              <textarea
                value={systemPrompt()}
                onInput={(e) => setSystemPrompt(e.currentTarget.value)}
                style={{ width: '100%', 'min-height': '80px', padding: '4px 6px', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}
              />
            </div>
            <div>
              <label style={{ 'font-size': '12px', color: '#666' }}>
                user_prompt_template — placeholders: {'{{tractate}} {{page}} {{hebrew}} {{english}} {{segments_he}} {{segments_en}}'}
              </label>
              <textarea
                value={userPromptTpl()}
                onInput={(e) => setUserPromptTpl(e.currentTarget.value)}
                style={{ width: '100%', 'min-height': '120px', padding: '4px 6px', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'center' }}>
              <button
                disabled={saving() || !dirty()}
                onClick={() => onSave(false)}
                style={{ padding: '6px 14px', cursor: 'pointer' }}
              >
                {saving() ? 'saving…' : 'save'}
              </button>
              <button
                disabled={saving()}
                onClick={() => onSave(true)}
                style={{ padding: '6px 14px', cursor: 'pointer', background: '#000', color: '#fff', border: 0 }}
              >
                {saving() ? 'saving…' : dirty() ? 'save & rerun' : 'rerun'}
              </button>
              <Show when={saveError()}>{(msg) => (
                <span style={{ color: '#c00', 'font-size': '12px' }}>{msg()}</span>
              )}</Show>
            </div>
          </div>
        </Show>

        <Show when={isEditable() && tab() === 'telemetry'}>
          <Show when={result()} fallback={<div style={{ color: '#999' }}>no run output yet</div>}>{(r) => (
            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '12px', margin: 0 }}>
              {JSON.stringify({
                model: r().model,
                transport: r().transport,
                attempts: r().attempts,
                elapsed_ms: r().elapsed_ms,
                total_ms: r().total_ms,
                usage: r().usage,
              }, null, 2)}
            </pre>
          )}</Show>
        </Show>
      </div>
    </div>
  );
}
