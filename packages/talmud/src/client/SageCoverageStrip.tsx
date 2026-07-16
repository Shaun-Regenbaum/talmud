/**
 * Where in Shas does this sage speak? A SKYLINE: one column per masechet in
 * seder order (width ∝ the masechet's size), bar HEIGHT = how often the sage
 * is observed there, normalized to their busiest masechet, in their era
 * color. A masechet where they never appear stays a flat baseline. Once the
 * voice-graph blob carries dapimByTractate, a darker underline per column
 * shows how much of that masechet has been analyzed — so absence in a barely
 * analyzed masechet is honestly not evidence of absence.
 *
 * Numerator: /api/rabbi-observations/:slug?summary=1 byTractate (10-min cached
 * fold of the per-daf observation slices, near-all-Shas coverage). Denominator:
 * dapimByTractate from the Shas-wide voice-graph blob (appears after its next
 * rebuild).
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

const BAR_AREA = 44; // skyline height
const BASELINE_H = 2;
const PX_PER_AMUD = 0.24;
const CELL_MIN_W = 12;

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

  const maxSage = () => Math.max(1, ...cells().map((c) => c.sage));
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
                const h = () =>
                  c.sage > 0 ? 4 + (BAR_AREA - 8) * (c.sage / maxSage()) : BASELINE_H;
                const analyzedFrac = () =>
                  c.analyzed != null && c.total > 0 ? Math.min(1, c.analyzed / c.total) : 0;
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
                    style={{ position: 'relative', width: `${c.w}px`, height: `${BAR_AREA}px` }}
                    title={title()}
                  >
                    {/* the skyline bar: height = sage's presence */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${h()}px`,
                        background: c.sage > 0 ? colorForGeneration(props.generation) : '#e4ddcc',
                        'border-radius': '3px 3px 0 0',
                      }}
                    />
                    {/* analyzed-so-far underline (denominator context) */}
                    <Show when={analyzedFrac() > 0}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: '-4px',
                          height: '2.5px',
                          width: `${analyzedFrac() * 100}%`,
                          background: '#8a6d3b',
                          'border-radius': '2px',
                          opacity: 0.65,
                        }}
                      />
                    </Show>
                    {/* count on top of meaningful bars */}
                    <Show when={c.sage > 0 && c.sage / maxSage() > 0.35}>
                      <span
                        style={{
                          position: 'absolute',
                          bottom: `${h() + 1}px`,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          'font-size': '8px',
                          color: '#8a8271',
                        }}
                      >
                        {c.sage}
                      </span>
                    </Show>
                    <span
                      style={{
                        position: 'absolute',
                        top: `${BAR_AREA + 6}px`,
                        left: '2px',
                        'font-size': '8.5px',
                        color: c.sage > 0 ? '#555' : '#b6ae9c',
                        'white-space': 'nowrap',
                        transform: 'rotate(40deg)',
                        'transform-origin': 'top left',
                        'text-shadow': '0 0 3px #fff, 0 0 3px #fff',
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
