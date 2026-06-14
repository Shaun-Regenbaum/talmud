/**
 * "Across the Talmud" — the rabbi's accumulated reverse-index, the LIVING
 * counterpart to the static rabbi.geography biography. As more dapim are
 * studied (and warmed), the `rabbi.observations` collector records where this
 * rabbi appears, whom they appear with, and the opinions / stories / verse
 * expositions they feature in — each tagged to a daf. This panel reads the
 * accumulated view from GET /api/rabbi-observations/:slug and surfaces the
 * frequency signals (companions + places by how many dapim carry them, plus
 * encounter counts). It GROWS over time; nothing here is AI-generated.
 *
 * Read-only and lazy: fetches once per rabbi (slug), shows a loading line, and
 * renders nothing until there is accumulated data.
 */

import { createResource, For, type JSX, Show } from 'solid-js';
import { t } from './i18n';

interface AggEntry {
  type: 'place' | 'opinion' | 'story' | 'exegesis' | 'lineage';
  payload: Record<string, unknown>;
  dafs: number;
  confidence: 'high' | 'medium' | 'low';
}

interface ObsResponse {
  slug: string;
  name: string;
  dafCount: number;
  byType: Partial<Record<AggEntry['type'], number>>;
  aggregated: AggEntry[];
}

interface Props {
  slug?: string | null;
}

const PANEL_BG = '#fafaf7';
const PANEL_BORDER = '#eae8e0';

async function fetchObservations(slug: string): Promise<ObsResponse | null> {
  // summary=1 drops the (huge) flat observation list; min=2 keeps signals that
  // recur on at least two dapim (drops one-off noise). Cached server-side.
  const r = await fetch(`/api/rabbi-observations/${encodeURIComponent(slug)}?min=2&summary=1`);
  if (!r.ok) return null;
  return (await r.json()) as ObsResponse;
}

/** Best display label for an aggregated entry's payload. */
function labelOf(e: AggEntry): string {
  const p = e.payload;
  const pick = (k: string): string | undefined =>
    typeof p[k] === 'string' && p[k] ? (p[k] as string) : undefined;
  return pick('name') ?? pick('place') ?? pick('title') ?? pick('verseRef') ?? '';
}

export default function RabbiObservations(props: Props): JSX.Element {
  const [data] = createResource(
    () => props.slug || null,
    (slug) => fetchObservations(slug),
  );

  const top = (type: AggEntry['type'], n: number): AggEntry[] =>
    (data()?.aggregated ?? []).filter((e) => e.type === type && labelOf(e)).slice(0, n);

  const oftenWith = () => top('lineage', 6);
  const places = () => top('place', 6);

  // Encounter counts (raw byType totals — how many we've seen, daf by daf).
  const stats = (): Array<{ label: string; n: number }> => {
    const b = data()?.byType ?? {};
    return [
      { label: t('rabbi.observations.opinions'), n: b.opinion ?? 0 },
      { label: t('rabbi.observations.stories'), n: b.story ?? 0 },
      { label: t('rabbi.observations.exegesis'), n: b.exegesis ?? 0 },
    ].filter((s) => s.n > 0);
  };

  const hasData = () => (data()?.dafCount ?? 0) > 0;

  return (
    <Show when={props.slug}>
      <Show when={!data.loading} fallback={<LoadingLine />}>
        <Show when={hasData()}>
          <div
            style={{
              border: `1px solid ${PANEL_BORDER}`,
              'border-radius': '6px',
              background: PANEL_BG,
              padding: '0.75rem 0.95rem 0.85rem',
              'margin-top': '0.7rem',
            }}
          >
            <div
              style={{
                'font-size': '0.7rem',
                'text-transform': 'uppercase',
                'letter-spacing': '0.08em',
                color: '#888',
                'margin-bottom': '0.5rem',
              }}
            >
              {t('rabbi.observations.title')}
            </div>

            <div style={{ 'font-size': '0.82rem', color: '#444', 'margin-bottom': '0.55rem' }}>
              {t('rabbi.observations.appearsOn', { n: String(data()?.dafCount ?? 0) })}
              <Show when={stats().length > 0}>
                {' · '}
                <For each={stats()}>
                  {(s, i) => (
                    <span>
                      <Show when={i() > 0}>{' · '}</Show>
                      <strong style={{ color: '#333' }}>{s.n.toLocaleString()}</strong> {s.label}
                    </span>
                  )}
                </For>
              </Show>
            </div>

            <Show when={oftenWith().length > 0}>
              <ChipRow heading={t('rabbi.observations.oftenWith')} entries={oftenWith()} />
            </Show>
            <Show when={places().length > 0}>
              <ChipRow heading={t('rabbi.observations.places')} entries={places()} />
            </Show>
          </div>
        </Show>
      </Show>
    </Show>
  );
}

function LoadingLine(): JSX.Element {
  return (
    <p
      style={{
        margin: '0.55rem 0 0',
        color: '#999',
        'font-style': 'italic',
        'font-size': '0.8rem',
      }}
    >
      {t('rabbi.observations.loading')}
    </p>
  );
}

function ChipRow(props: { heading: string; entries: AggEntry[] }): JSX.Element {
  return (
    <div style={{ 'margin-top': '0.4rem' }}>
      <div
        style={{
          'font-size': '0.64rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
          color: '#999',
          'margin-bottom': '0.25rem',
        }}
      >
        {props.heading}
      </div>
      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem' }}>
        <For each={props.entries}>
          {(e) => (
            <span
              title={t('rabbi.observations.onNDapim', { n: String(e.dafs) })}
              style={{
                display: 'inline-flex',
                'align-items': 'baseline',
                gap: '0.25rem',
                padding: '0.12rem 0.4rem',
                'border-radius': '10px',
                background: '#fff',
                border: '1px solid #e5e3dc',
                'font-size': '0.78rem',
                color: '#333',
              }}
            >
              {labelOf(e)}
              <span
                style={{ color: '#a98', 'font-size': '0.66rem', 'font-variant': 'tabular-nums' }}
              >
                {e.dafs}
              </span>
            </span>
          )}
        </For>
      </div>
    </div>
  );
}
