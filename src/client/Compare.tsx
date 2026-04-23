import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import { fixtures, fixtureById } from '../fixtures';
import { DafRenderer } from '../lib/daf-render';
import type { LayoutResult } from '../lib/daf-render';
import { DafRendererNpm, type NpmSpacerReport } from './DafRendererNpm';

// Fixed typography — the slider changes ONLY contentWidth, not fonts, so
// visual changes as you drag are purely layout (not zoom).
const FONT_SIZE = { main: 15, side: 10.5 };
const LINE_HEIGHT = { main: 17, side: 14 };

function MeasurementTable(props: {
  ours: LayoutResult | null;
  theirs: NpmSpacerReport | null;
}) {
  const rows = () => {
    const o = props.ours;
    const t = props.theirs;
    return [
      ['case',         o?.spacers.layoutCase ?? '—', '—'],
      ['exception',    o?.spacers.exception ?? 0,     t?.exception ?? 0],
      ['start',        o ? Math.round(o.spacers.start) : '—', t ? Math.round(t.start) : '—'],
      ['inner (mid)',  o ? Math.round(o.spacers.inner) : '—', t ? Math.round(t.inner) : '—'],
      ['outer (mid)',  o ? Math.round(o.spacers.outer) : '—', t ? Math.round(t.outer) : '—'],
      ['inner end',    o ? Math.round(o.spacers.innerEnd) : '—', '—'],
      ['outer end',    o ? Math.round(o.spacers.outerEnd) : '—', '—'],
      ['end (shared)', '—', t ? Math.round(t.end) : '—'],
      ['total height', o ? Math.round(o.totalHeight) : '—', '—'],
    ];
  };

  return (
    <table style={{ 'border-collapse': 'collapse', 'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace', 'font-size': '0.78rem' }}>
      <thead>
        <tr style={{ 'border-bottom': '1px solid #ccc' }}>
          <th style={{ 'text-align': 'left', padding: '0.25rem 0.5rem', color: '#666' }}></th>
          <th style={{ 'text-align': 'right', padding: '0.25rem 0.5rem', color: '#8a2a2b' }}>ours</th>
          <th style={{ 'text-align': 'right', padding: '0.25rem 0.5rem', color: '#0066cc' }}>npm</th>
        </tr>
      </thead>
      <tbody>
        <For each={rows()}>
          {(row) => (
            <tr style={{ 'border-bottom': '1px solid #f0f0f0' }}>
              <td style={{ padding: '0.2rem 0.5rem', color: '#666' }}>{String(row[0])}</td>
              <td style={{ padding: '0.2rem 0.5rem', 'text-align': 'right' }}>{String(row[1])}</td>
              <td style={{ padding: '0.2rem 0.5rem', 'text-align': 'right' }}>{String(row[2])}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

export default function Compare() {
  const params = new URLSearchParams(window.location.search);
  const [fixtureId, setFixtureId] = createSignal(params.get('fixture') ?? fixtures[0].id);
  const [contentWidth, setContentWidth] = createSignal(Number(params.get('w') ?? 520));
  const [ours, setOurs] = createSignal<LayoutResult | null>(null);
  const [theirs, setTheirs] = createSignal<NpmSpacerReport | null>(null);

  const current = () => fixtureById[fixtureId()] ?? fixtures[0];
  const currentIdx = () => fixtures.findIndex((f) => f.id === fixtureId());

  const updateUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set('fixture', fixtureId());
    u.searchParams.set('w', String(contentWidth()));
    window.history.replaceState({}, '', u.toString());
  };

  const selectFixture = (id: string) => {
    setFixtureId(id);
    setOurs(null); setTheirs(null);
    updateUrl();
  };

  const goPrev = () => {
    const i = (currentIdx() - 1 + fixtures.length) % fixtures.length;
    selectFixture(fixtures[i].id);
  };
  const goNext = () => {
    const i = (currentIdx() + 1) % fixtures.length;
    selectFixture(fixtures[i].id);
  };

  // Arrow-key navigation across fixtures. Ignore when the user is interacting
  // with form elements so dropdowns and slider still work.
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <main style={{ padding: '0.75rem', 'font-family': 'system-ui, sans-serif' }}>
      <header style={{ 'margin-bottom': '0.75rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.25rem' }}>Daf Renderer Compare</h1>
        <p style={{ margin: '0.15rem 0 0', color: '#6b6b6b', 'font-size': '0.85rem' }}>
          Ours (left) · daf-renderer npm (right) · HebrewBooks PDF (external) · <kbd>←</kbd> / <kbd>→</kbd> to cycle fixtures
        </p>
      </header>

      <section style={{ display: 'flex', gap: '1rem', 'align-items': 'center', 'margin-bottom': '0.75rem', 'flex-wrap': 'wrap' }}>
        <button onClick={goPrev} style={{ padding: '0.35rem 0.6rem', cursor: 'pointer' }}>←</button>
        <label style={{ display: 'flex', gap: '0.4rem', 'align-items': 'center' }}>
          <select value={fixtureId()} onChange={(e) => selectFixture(e.currentTarget.value)}
                  style={{ padding: '0.35rem 0.5rem', 'font-size': '0.9rem', 'min-width': '24rem' }}>
            <For each={fixtures}>
              {(f) => <option value={f.id}>{f.label} — {f.hint}</option>}
            </For>
          </select>
          <span style={{ color: '#888', 'font-size': '0.8rem' }}>{currentIdx() + 1}/{fixtures.length}</span>
        </label>
        <button onClick={goNext} style={{ padding: '0.35rem 0.6rem', cursor: 'pointer' }}>→</button>

        <label style={{ display: 'flex', gap: '0.4rem', 'align-items': 'center' }}>
          <span style={{ 'font-size': '0.85rem', color: '#333' }}>Width:</span>
          <input
            type="range"
            min={300}
            max={1200}
            step={10}
            value={contentWidth()}
            onInput={(e) => { setContentWidth(Number(e.currentTarget.value)); updateUrl(); }}
            style={{ width: '12rem' }}
          />
          <span style={{ 'font-family': 'ui-monospace, monospace', 'font-size': '0.85rem', color: '#555', 'min-width': '3.5rem' }}>
            {contentWidth()}px
          </span>
        </label>

        <a href={current().hebrewBooksUrl} target="_blank" rel="noopener noreferrer"
           style={{ 'font-size': '0.85rem', color: '#0066cc' }}>
          HebrewBooks PDF ↗
        </a>
      </section>

      <section style={{ 'margin-bottom': '0.75rem', padding: '0.5rem 0.75rem', background: '#fafafa', border: '1px solid #eee', display: 'inline-block' }}>
        <MeasurementTable ours={ours()} theirs={theirs()} />
      </section>

      <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '0.75rem', 'align-items': 'start' }}>
        <section style={{ 'min-width': 0 }}>
          <h2 style={{ 'font-size': '0.85rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', color: '#8a2a2b', 'margin-bottom': '0.4rem' }}>
            Ours
          </h2>
          <div style={{ border: '1px dashed #ccc', padding: '0.5rem', overflow: 'auto' }}>
            <Show when={current()} keyed>
              {(f) => (
                <DafRenderer
                  main={f.data.mainText.hebrew}
                  inner={f.data.rashi?.hebrew ?? ''}
                  outer={f.data.tosafot?.hebrew ?? ''}
                  amud={f.amud}
                  options={{
                    contentWidth: contentWidth(),
                    mainWidth: 0.48,
                    fontSize: FONT_SIZE,
                    lineHeight: LINE_HEIGHT,
                  }}
                  onLayout={setOurs}
                />
              )}
            </Show>
          </div>
        </section>

        <section style={{ 'min-width': 0 }}>
          <h2 style={{ 'font-size': '0.85rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', color: '#0066cc', 'margin-bottom': '0.4rem' }}>
            daf-renderer npm
          </h2>
          <div style={{ border: '1px dashed #ccc', padding: '0.5rem', overflow: 'auto' }}>
            <Show when={current()} keyed>
              {(f) => (
                <DafRendererNpm
                  main={f.data.mainText.hebrew}
                  inner={f.data.rashi?.hebrew ?? ''}
                  outer={f.data.tosafot?.hebrew ?? ''}
                  amud={f.amud}
                  contentWidth={contentWidth()}
                  mainWidth={0.48}
                  fontSize={FONT_SIZE}
                  lineHeight={LINE_HEIGHT}
                  onSpacers={setTheirs}
                />
              )}
            </Show>
          </div>
        </section>
      </div>
    </main>
  );
}
