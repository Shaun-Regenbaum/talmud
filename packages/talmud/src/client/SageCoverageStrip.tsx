/**
 * Where in Shas does this sage speak? One cell per masechet in seder order,
 * cell width ∝ the masechet's size. Three nested layers per cell:
 *   base   — the whole masechet (what exists)
 *   middle — dapim we have AI-analyzed so far (the voice-graph denominator)
 *   fill   — dapim where THIS sage is observed (era-colored)
 * So "not yet analyzed" is always visible as the unfilled remainder — absence
 * of the sage in an unanalyzed masechet is honestly not evidence of absence.
 *
 * Numerator: /api/rabbi-observations/:slug?summary=1 byTractate (10-min cached
 * fold of the per-daf observation slices). Denominator: dapimByTractate from
 * the Shas-wide voice-graph blob (appears after its next rebuild; the strip
 * degrades to sage-vs-total shading until then).
 */
import { createMemo, createResource, For, type JSX, Show } from 'solid-js';
import { iterAmudim } from '../lib/sefref/amudim';
import { TRACTATE_OPTIONS } from '../lib/sefref/tractates';
import { colorForGeneration } from './generations';
import { lang, t } from './i18n';

const AMUDIM_TOTAL = new Map<string, number>(
  TRACTATE_OPTIONS.map((o) => [o.value, [...iterAmudim(o.value)].length]),
);

interface ObsSummary {
  dafCount?: number;
  byTractate?: Record<string, number>;
}
interface NetworkSummary {
  dapim?: number;
  dapimByTractate?: Record<string, number>;
}

const CELL_H = 26;
const PX_PER_AMUD = 0.24;
const CELL_MIN_W = 10;

export function SageCoverageStrip(props: { slug: string; generation: string | null }): JSX.Element {
  const [obs] = createResource(
    () => props.slug,
    async (slug) => {
      const r = await fetch(
        `/api/rabbi-observations/${encodeURIComponent(slug)}?summary=1&min=9999`,
      );
      if (!r.ok) return null;
      return (await r.json()) as ObsSummary;
    },
  );
  const [net] = createResource(async () => {
    const r = await fetch('/api/rabbi-network');
    if (!r.ok) return null;
    return (await r.json()) as NetworkSummary;
  });

  const cells = createMemo(() => {
    const by = obs()?.byTractate ?? {};
    const analyzed = net()?.dapimByTractate ?? null;
    return TRACTATE_OPTIONS.map((o) => {
      const total = AMUDIM_TOTAL.get(o.value) ?? 0;
      return {
        value: o.value,
        label: lang() === 'he' ? o.label : o.value,
        total,
        analyzed: analyzed ? (analyzed[o.value] ?? 0) : null,
        sage: by[o.value] ?? 0,
        w: Math.max(CELL_MIN_W, total * PX_PER_AMUD),
      };
    });
  });

  const sageTotal = () => obs()?.dafCount ?? 0;
  const tractatesWithSage = () => cells().filter((c) => c.sage > 0).length;
  const hasDenominator = () => net()?.dapimByTractate != null;

  return (
    <section class="sage-coverage" style={{ margin: '0.9rem 0' }}>
      <h3 style={{ margin: '0 0 0.2rem', 'font-size': '0.95rem' }}>{t('coverage.title')}</h3>
      <Show when={!obs.loading} fallback={<p class="sages-empty">{t('sages.list.loading')}</p>}>
        <p style={{ margin: '0 0 0.5rem', color: '#777', 'font-size': '0.8rem' }}>
          {t('coverage.summary', { dapim: sageTotal(), masechtot: tractatesWithSage() })}
          <Show
            when={hasDenominator()}
            fallback={<span style={{ color: '#a89e8a' }}> {t('coverage.noDenominator')}</span>}
          >
            {' '}
            <span style={{ color: '#a89e8a' }}>
              {t('coverage.analyzedNote', { analyzed: net()?.dapim ?? 0 })}
            </span>
          </Show>
        </p>
        <div style={{ 'overflow-x': 'auto' }}>
          <div
            style={{
              display: 'flex',
              'align-items': 'flex-end',
              gap: '2px',
              'padding-bottom': '2.6rem',
              width: 'max-content',
            }}
          >
            <For each={cells()}>
              {(c) => {
                const analyzedFrac = () =>
                  c.analyzed != null && c.total > 0 ? Math.min(1, c.analyzed / c.total) : 1;
                const sageFrac = () => (c.total > 0 ? Math.min(1, c.sage / c.total) : 0);
                const title = () =>
                  c.analyzed != null
                    ? t('coverage.cellTitle', {
                        masechet: c.value,
                        sage: c.sage,
                        analyzed: c.analyzed,
                        total: c.total,
                      })
                    : t('coverage.cellTitleNoDenom', {
                        masechet: c.value,
                        sage: c.sage,
                        total: c.total,
                      });
                return (
                  <div
                    style={{ position: 'relative', width: `${c.w}px`, height: `${CELL_H}px` }}
                    title={title()}
                  >
                    {/* whole masechet */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: '#efeadf',
                        'border-radius': '3px',
                      }}
                    />
                    {/* analyzed-so-far band */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        top: 0,
                        width: `${analyzedFrac() * 100}%`,
                        background: '#d9d2c0',
                        'border-radius': '3px',
                      }}
                    />
                    {/* the sage */}
                    <Show when={c.sage > 0}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: 0,
                          top: 0,
                          width: `${Math.max(6, sageFrac() * 100)}%`,
                          background: colorForGeneration(props.generation),
                          'border-radius': '3px',
                        }}
                      />
                    </Show>
                    <span
                      style={{
                        position: 'absolute',
                        top: `${CELL_H + 4}px`,
                        left: '2px',
                        'font-size': '8.5px',
                        color: c.sage > 0 ? '#555' : '#b6ae9c',
                        'white-space': 'nowrap',
                        transform: 'rotate(40deg)',
                        'transform-origin': 'top left',
                      }}
                    >
                      {c.label}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}
