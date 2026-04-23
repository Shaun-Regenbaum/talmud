import { createResource, createSignal, createEffect, Show, For } from 'solid-js';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { TalmudPageData } from '../lib/sefref';

const WIDTH = 300;
const FONT_SIZE = 15;
const LINE_HEIGHT = 17;
const FONT_FAMILY = 'Mekorot Vilna';
const FONT = `${FONT_SIZE}px "${FONT_FAMILY}"`;

async function fetchDaf(): Promise<TalmudPageData> {
  const res = await fetch('/api/daf/Berakhot/2a');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function stripHtml(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}

type BrowserMeasure = {
  lineCount: number;
  height: number;
  rects: { top: number; right: number; bottom: number; left: number; width: number }[];
};

function measureBrowser(el: HTMLElement): BrowserMeasure {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects()).map((r) => ({
    top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width,
  }));
  return {
    lineCount: rects.length,
    height: el.getBoundingClientRect().height,
    rects,
  };
}

type PretextMeasure = {
  lineCount: number;
  height: number;
  lines: { text: string; width: number }[];
};

function measurePretext(text: string): PretextMeasure {
  const prepared = prepareWithSegments(text, FONT);
  const layout = layoutWithLines(prepared, WIDTH, LINE_HEIGHT);
  return {
    lineCount: layout.lineCount,
    height: layout.height,
    lines: layout.lines.map((l) => ({ text: l.text, width: l.width })),
  };
}

export default function PretextSpike() {
  const [daf] = createResource(fetchDaf);
  const [browser, setBrowser] = createSignal<BrowserMeasure | null>(null);
  const [pretext, setPretext] = createSignal<PretextMeasure | null>(null);
  const [fontsReady, setFontsReady] = createSignal(false);
  let testRef: HTMLDivElement | undefined;

  document.fonts.ready.then(() => setFontsReady(true));

  const run = () => {
    const d = daf();
    if (!d || !testRef || !fontsReady()) return;
    const text = stripHtml(d.mainText.hebrew);
    setBrowser(measureBrowser(testRef));
    setPretext(measurePretext(text));
  };

  createEffect(() => {
    if (daf() && fontsReady()) {
      requestAnimationFrame(run);
    }
  });

  return (
    <main style={{ 'max-width': '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ 'margin-bottom': '2rem' }}>
        <h1 style={{ margin: 0 }}>Pretext Spike</h1>
        <p style={{ margin: '0.25rem 0', color: '#6b6b6b', 'font-size': '0.9rem' }}>
          Width <code>{WIDTH}px</code> · Font <code>{FONT}</code> · Line height <code>{LINE_HEIGHT}px</code>
        </p>
        <p style={{ margin: '0.25rem 0', color: '#6b6b6b', 'font-size': '0.9rem' }}>
          Fonts ready: {fontsReady() ? 'yes' : 'loading…'}
        </p>
        <button onClick={run} style={{ 'margin-top': '0.5rem' }}>Re-measure</button>
      </header>

      <Show when={daf()} fallback={<p>Loading daf…</p>}>
        {(data) => (
          <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '1.5rem' }}>
            <section>
              <h2 style={{ 'font-size': '0.85rem', 'text-transform': 'uppercase', color: '#6b6b6b' }}>
                Browser rendering
              </h2>
              <div
                ref={testRef}
                dir="rtl"
                lang="he"
                style={{
                  width: `${WIDTH}px`,
                  'font-family': FONT_FAMILY,
                  'font-size': `${FONT_SIZE}px`,
                  'line-height': `${LINE_HEIGHT}px`,
                  border: '1px dashed #c33',
                  padding: '0',
                  'text-align': 'justify',
                }}
              >
                {stripHtml(data().mainText.hebrew)}
              </div>
            </section>

            <section>
              <h2 style={{ 'font-size': '0.85rem', 'text-transform': 'uppercase', color: '#6b6b6b' }}>
                Measurements
              </h2>
              <Show when={browser() && pretext()} fallback={<p>Measuring…</p>}>
                <table style={{ 'border-collapse': 'collapse', 'font-size': '0.9rem' }}>
                  <thead>
                    <tr style={{ 'border-bottom': '1px solid #ccc' }}>
                      <th style={{ 'text-align': 'left', padding: '0.5rem' }}></th>
                      <th style={{ 'text-align': 'right', padding: '0.5rem' }}>Line count</th>
                      <th style={{ 'text-align': 'right', padding: '0.5rem' }}>Height (px)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0.5rem' }}>Browser (Range.getClientRects)</td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>{browser()!.lineCount}</td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>{browser()!.height.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.5rem' }}>Pretext (layoutWithLines)</td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>{pretext()!.lineCount}</td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>{pretext()!.height.toFixed(2)}</td>
                    </tr>
                    <tr style={{ 'border-top': '1px solid #ccc', 'font-weight': 600 }}>
                      <td style={{ padding: '0.5rem' }}>Δ</td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>
                        {pretext()!.lineCount - browser()!.lineCount}
                      </td>
                      <td style={{ 'text-align': 'right', padding: '0.5rem' }}>
                        {(pretext()!.height - browser()!.height).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Show>
            </section>

            <section style={{ 'grid-column': '1 / -1' }}>
              <h2 style={{ 'font-size': '0.85rem', 'text-transform': 'uppercase', color: '#6b6b6b' }}>
                Per-line widths
              </h2>
              <Show when={browser() && pretext()}>
                <div style={{ display: 'grid', 'grid-template-columns': '4rem 1fr 1fr 4rem', gap: '0.25rem 0.75rem', 'font-size': '0.85rem', 'font-family': 'monospace' }}>
                  <div style={{ 'font-weight': 600 }}>Line</div>
                  <div style={{ 'font-weight': 600 }}>Browser width</div>
                  <div style={{ 'font-weight': 600 }}>Pretext width</div>
                  <div style={{ 'font-weight': 600 }}>Δ</div>
                  <For each={Array.from({ length: Math.max(browser()!.rects.length, pretext()!.lines.length) })}>
                    {(_, i) => {
                      const bw = browser()!.rects[i()]?.width;
                      const pw = pretext()!.lines[i()]?.width;
                      return (
                        <>
                          <div>{i() + 1}</div>
                          <div>{bw !== undefined ? bw.toFixed(2) : '—'}</div>
                          <div>{pw !== undefined ? pw.toFixed(2) : '—'}</div>
                          <div>{bw !== undefined && pw !== undefined ? (pw - bw).toFixed(2) : '—'}</div>
                        </>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </section>
          </div>
        )}
      </Show>
    </main>
  );
}
