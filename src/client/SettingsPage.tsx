/**
 * #settings — READ-ONLY view of the effective LLM model config (default model
 * + fallback chain) plus the model catalog with a connectivity probe.
 *
 * There is no editable settings store: the default model + fallback are code
 * constants (src/worker/settings.ts, optionally overridden per-deploy by the
 * DEFAULT_LLM_MODEL env var), and each mark/enrichment pins its own model per
 * task. So this page displays the config — it doesn't mutate it. The probe
 * still works for checking a model's connectivity through the AI Gateway.
 */
import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { t } from './i18n';

type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

interface ModelPreset {
  id: LLMModelId;
  label: string;
  vendor: string;
  notes?: string;
}

interface EffectiveSettings {
  defaultModel: LLMModelId;
  fallbackChain: LLMModelId[];
  source: string;
  editable: boolean;
}

interface SettingsResponse {
  settings: EffectiveSettings;
  presets: ModelPreset[];
}

async function fetchSettings(): Promise<SettingsResponse> {
  const r = await fetch('/api/admin/llm-settings');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function probe(model: LLMModelId): Promise<{ ms: number; transport: string; reply: string; error?: string }> {
  const url = `/api/admin/ai-gateway-test?run=1&model=${encodeURIComponent(model)}&nonce=${Date.now()}`;
  const r = await fetch(url);
  const j = await r.json() as { ms?: number; transport?: string; reply?: string; error?: string };
  return { ms: j.ms ?? 0, transport: j.transport ?? '-', reply: j.reply ?? '', error: j.error };
}

export default function SettingsPage() {
  const [data] = createResource(fetchSettings);
  const [probeResult, setProbeResult] = createSignal<Record<string, { ms: number; transport: string; reply: string; error?: string }>>({});
  const [probing, setProbing] = createSignal<Record<string, boolean>>({});

  const onProbe = async (model: LLMModelId) => {
    setProbing((p) => ({ ...p, [model]: true }));
    try {
      const r = await probe(model);
      setProbeResult((m) => ({ ...m, [model]: r }));
    } finally {
      setProbing((p) => ({ ...p, [model]: false }));
    }
  };

  const probeBtn = (id: LLMModelId): JSX.Element => (
    <>
      <button
        disabled={probing()[id] === true}
        onClick={() => onProbe(id)}
        style={{ 'margin-left': '8px', padding: '2px 8px', 'font-size': '13px' }}
      >
        {probing()[id] ? t('settings.probing') : t('settings.probe')}
      </button>
      <Show when={probeResult()[id]}>{(r) => (
        <span style={{ 'margin-left': '8px', 'font-family': 'monospace', 'font-size': '12px', color: r().error ? '#c00' : '#080' }}>
          {r().error ?? `${r().transport} · ${r().ms}ms · "${r().reply.slice(0, 40)}"`}
        </span>
      )}</Show>
    </>
  );

  return (
    <div class="page-shell" style={{ '--page-max': '880px', 'font-family': 'system-ui, sans-serif' }}>
      <h1 style={{ 'font-size': '24px', 'margin-bottom': '8px' }}>{t('settings.title')}</h1>
      <p style={{ color: '#666', margin: '0 0 24px' }}>
        {t('settings.intro.before')}<code>?model=</code>{t('settings.intro.after')}
      </p>

      <Show when={data()}>{(loaded) => {
        const s = loaded().settings;
        const presets = loaded().presets;
        const label = (id: LLMModelId): string => presets.find((p) => p.id === id)?.label ?? id;

        return (
          <>
            <section style={{ 'margin-bottom': '32px' }}>
              <h2 style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>{t('settings.section.defaultModel')}</h2>
              <div style={{ 'font-family': 'monospace', 'font-size': '14px' }}>
                {label(s.defaultModel)}
                <span style={{ 'margin-left': '8px', color: '#999', 'font-size': '12px' }}>{t('settings.source', { source: s.source })}</span>
                {probeBtn(s.defaultModel)}
              </div>
              <p style={{ color: '#666', 'font-size': '13px', margin: '6px 0 0' }}>
                {presets.find((p) => p.id === s.defaultModel)?.notes}
              </p>
            </section>

            <section style={{ 'margin-bottom': '32px' }}>
              <h2 style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>{t('settings.section.fallbackChain')}</h2>
              <p style={{ color: '#666', 'font-size': '13px', margin: '0 0 12px' }}>{t('settings.fallbackChain.hint')}</p>
              <Show when={s.fallbackChain.length > 0} fallback={<div style={{ color: '#999', 'font-style': 'italic' }}>{t('settings.fallbackChain.empty')}</div>}>
                <ol style={{ 'padding-left': '20px', margin: 0 }}>
                  <For each={s.fallbackChain}>{(id) => (
                    <li style={{ 'margin-bottom': '6px' }}>
                      <span style={{ 'font-family': 'monospace' }}>{label(id)}</span>
                      {probeBtn(id)}
                    </li>
                  )}</For>
                </ol>
              </Show>
            </section>

            <section>
              <h2 style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>{t('settings.section.catalog')}</h2>
              <For each={presets}>{(p) => (
                <div style={{ 'margin-bottom': '10px' }}>
                  <span style={{ 'font-weight': 600 }}>{p.label}</span>
                  <span style={{ color: '#999', 'font-size': '13px', 'margin-left': '6px' }}>{p.vendor}</span>
                  {probeBtn(p.id)}
                  <Show when={p.notes}>
                    <p style={{ color: '#666', 'font-size': '12px', margin: '2px 0 0' }}>{p.notes}</p>
                  </Show>
                </div>
              )}</For>
            </section>
          </>
        );
      }}</Show>
      <Show when={data.error}>
        <div style={{ color: '#c00' }}>{t('settings.loadFailed', { error: String(data.error) })}</div>
      </Show>
    </div>
  );
}
