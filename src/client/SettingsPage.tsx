/**
 * #settings — pick the default LLM model and the fallback chain. Backed by
 * /api/admin/llm-settings (KV under llm-settings:v1). The dropdown options
 * are MODEL_PRESETS, served by the GET endpoint so we don't bundle the list.
 *
 * Single-user app — no auth gate.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { t } from './i18n';

type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

interface ModelPreset {
  id: LLMModelId;
  label: string;
  vendor: string;
  notes?: string;
}

interface LLMSettings {
  defaultModel: LLMModelId;
  fallbackChain: LLMModelId[];
  perStepOverrides?: Record<string, LLMModelId>;
  updatedAt: string;
}

interface SettingsResponse {
  settings: LLMSettings;
  presets: ModelPreset[];
}

async function fetchSettings(): Promise<SettingsResponse> {
  const r = await fetch('/api/admin/llm-settings');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function saveSettings(next: Omit<LLMSettings, 'updatedAt'>): Promise<LLMSettings> {
  const r = await fetch('/api/admin/llm-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  const j = await r.json() as { settings: LLMSettings };
  return j.settings;
}

async function probe(model: LLMModelId): Promise<{ ms: number; transport: string; reply: string; error?: string }> {
  const url = `/api/admin/ai-gateway-test?run=1&model=${encodeURIComponent(model)}&nonce=${Date.now()}`;
  const r = await fetch(url);
  const j = await r.json() as { ms?: number; transport?: string; reply?: string; error?: string };
  return {
    ms: j.ms ?? 0,
    transport: j.transport ?? '-',
    reply: j.reply ?? '',
    error: j.error,
  };
}

export default function SettingsPage() {
  const [data, { refetch }] = createResource(fetchSettings);
  const [defaultModel, setDefaultModel] = createSignal<LLMModelId | null>(null);
  const [fallbackChain, setFallbackChain] = createSignal<LLMModelId[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [savedAt, setSavedAt] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [probeResult, setProbeResult] = createSignal<Record<string, { ms: number; transport: string; reply: string; error?: string }>>({});
  const [probing, setProbing] = createSignal<Record<string, boolean>>({});

  // Sync local state when the resource resolves.
  const init = (s: LLMSettings) => {
    if (defaultModel() === null) setDefaultModel(s.defaultModel);
    if (fallbackChain().length === 0) setFallbackChain([...s.fallbackChain]);
  };

  const onSave = async () => {
    const dm = defaultModel();
    if (!dm) return;
    setSaving(true); setError(null);
    try {
      const saved = await saveSettings({ defaultModel: dm, fallbackChain: fallbackChain() });
      setSavedAt(saved.updatedAt);
      await refetch();
      // Tell the marks panel to drop its in-memory run cache. Without this,
      // already-extracted runs from the previous model linger until the user
      // hard-refreshes or navigates pages.
      window.dispatchEvent(new CustomEvent('marks-runs-invalidate'));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const onProbe = async (model: LLMModelId) => {
    setProbing((p) => ({ ...p, [model]: true }));
    try {
      const r = await probe(model);
      setProbeResult((m) => ({ ...m, [model]: r }));
    } finally {
      setProbing((p) => ({ ...p, [model]: false }));
    }
  };

  const addToChain = (id: LLMModelId) => {
    setFallbackChain((c) => (c.includes(id) ? c : [...c, id]));
  };
  const removeFromChain = (id: LLMModelId) => {
    setFallbackChain((c) => c.filter((m) => m !== id));
  };
  const moveUp = (id: LLMModelId) => {
    setFallbackChain((c) => {
      const i = c.indexOf(id);
      if (i <= 0) return c;
      const next = [...c]; [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };
  const moveDown = (id: LLMModelId) => {
    setFallbackChain((c) => {
      const i = c.indexOf(id);
      if (i < 0 || i === c.length - 1) return c;
      const next = [...c]; [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  return (
    <div class="page-shell" style={{ '--page-max': '880px', 'font-family': 'system-ui, sans-serif' }}>
      <h1 style={{ 'font-size': '24px', 'margin-bottom': '8px' }}>{t('settings.title')}</h1>
      <p style={{ color: '#666', margin: '0 0 24px' }}>
        {t('settings.intro.before')}<code>?model=</code>{t('settings.intro.after')}
      </p>

      <Show when={data()}>{(loaded) => {
        init(loaded().settings);
        const presets = loaded().presets;
        const usedIds = () => new Set([defaultModel(), ...fallbackChain()].filter(Boolean));
        const remainingPresets = () => presets.filter((p) => !usedIds().has(p.id));

        return (
          <>
            <section style={{ 'margin-bottom': '32px' }}>
              <h2 style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>{t('settings.section.defaultModel')}</h2>
              <select
                value={defaultModel() ?? ''}
                onChange={(e) => setDefaultModel(e.currentTarget.value as LLMModelId)}
                style={{ width: '100%', padding: '8px', 'font-size': '14px' }}
              >
                <For each={presets}>{(p) => (
                  <option value={p.id}>{p.label} — {p.vendor}</option>
                )}</For>
              </select>
              <p style={{ color: '#666', 'font-size': '13px', margin: '4px 0 0' }}>
                {presets.find((p) => p.id === defaultModel())?.notes}
              </p>
              <button
                disabled={probing()[defaultModel() ?? ''] === true}
                onClick={() => defaultModel() && onProbe(defaultModel() as LLMModelId)}
                style={{ 'margin-top': '8px', padding: '4px 12px', 'font-size': '13px' }}
              >
                {probing()[defaultModel() ?? ''] ? t('settings.probing') : t('settings.probePing')}
              </button>
              <Show when={probeResult()[defaultModel() ?? '']}>{(r) => (
                <div style={{ 'margin-top': '8px', 'font-family': 'monospace', 'font-size': '12px', color: r().error ? '#c00' : '#080' }}>
                  {r().error ?? `${r().transport} · ${r().ms}ms · "${r().reply.slice(0, 60)}"`}
                </div>
              )}</Show>
            </section>

            <section style={{ 'margin-bottom': '32px' }}>
              <h2 style={{ 'font-size': '16px', 'margin-bottom': '8px' }}>{t('settings.section.fallbackChain')}</h2>
              <p style={{ color: '#666', 'font-size': '13px', margin: '0 0 12px' }}>
                {t('settings.fallbackChain.hint')}
              </p>
              <Show when={fallbackChain().length > 0} fallback={<div style={{ color: '#999', 'font-style': 'italic' }}>{t('settings.fallbackChain.empty')}</div>}>
                <ol style={{ 'padding-left': '20px', margin: '0 0 12px' }}>
                  <For each={fallbackChain()}>{(id) => {
                    const p = presets.find((x) => x.id === id);
                    return (
                      <li style={{ 'margin-bottom': '6px' }}>
                        <span style={{ 'font-family': 'monospace' }}>{p?.label ?? id}</span>
                        <button onClick={() => moveUp(id)} title={t('settings.moveUp')} aria-label={t('settings.moveUp')} style={{ 'margin-left': '8px', padding: '2px 6px' }}>↑</button>
                        <button onClick={() => moveDown(id)} title={t('settings.moveDown')} aria-label={t('settings.moveDown')} style={{ 'margin-left': '4px', padding: '2px 6px' }}>↓</button>
                        <button onClick={() => removeFromChain(id)} style={{ 'margin-left': '4px', padding: '2px 6px' }}>{t('settings.remove')}</button>
                        <button onClick={() => onProbe(id)} style={{ 'margin-left': '4px', padding: '2px 6px' }}>
                          {probing()[id] ? '…' : t('settings.probe')}
                        </button>
                        <Show when={probeResult()[id]}>{(r) => (
                          <span style={{ 'margin-left': '8px', 'font-family': 'monospace', 'font-size': '12px', color: r().error ? '#c00' : '#080' }}>
                            {r().error ?? `${r().transport} · ${r().ms}ms`}
                          </span>
                        )}</Show>
                      </li>
                    );
                  }}</For>
                </ol>
              </Show>
              <Show when={remainingPresets().length > 0}>
                <select
                  onChange={(e) => {
                    if (e.currentTarget.value) addToChain(e.currentTarget.value as LLMModelId);
                    e.currentTarget.value = '';
                  }}
                  style={{ width: '100%', padding: '8px', 'font-size': '14px' }}
                >
                  <option value="">{t('settings.addToChain')}</option>
                  <For each={remainingPresets()}>{(p) => (
                    <option value={p.id}>{p.label} — {p.vendor}</option>
                  )}</For>
                </select>
              </Show>
            </section>

            <section>
              <button
                disabled={saving()}
                onClick={onSave}
                style={{ padding: '10px 20px', 'font-size': '14px', background: '#000', color: '#fff', border: 0, cursor: 'pointer' }}
              >
                {saving() ? t('settings.saving') : t('settings.save')}
              </button>
              <Show when={savedAt()}>{(at) => (
                <span style={{ 'margin-left': '12px', color: '#080', 'font-size': '13px' }}>
                  {t('settings.savedAt', { time: new Date(at()).toLocaleTimeString() })}
                </span>
              )}</Show>
              <Show when={error()}>{(msg) => (
                <span style={{ 'margin-left': '12px', color: '#c00', 'font-size': '13px' }}>
                  {t('settings.errorPrefix', { msg: msg() })}
                </span>
              )}</Show>
              <p style={{ color: '#666', 'font-size': '12px', 'margin-top': '12px' }}>
                {t('settings.lastSavedAtServer', { time: loaded().settings.updatedAt })}
              </p>
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
