import { createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { Button } from '../Button';
import { ChartCard, LineChart } from '../Charts';
import { DataTable, Meter, RankedBars } from '../DataTable';
import { GEO_BBOX, GeoMap } from '../GeoMap';
import { colorForKind, GutterGlyph, type GutterKind } from '../ReaderIcon';
import type { RunTree } from '../RunTree';
import { RunTreeDag } from '../RunTreeDag';
import { WorldBubbleMap } from '../WorldBubbleMap';
import { type GalleryLang, t } from './i18n';

interface Activity {
  ok: boolean;
  byDay?: { date: string; requests: number; visits: number }[];
  byCountry?: { country: string; requests: number }[];
  windowStart?: string;
  windowEnd?: string;
}
async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/gallery-api${path}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error('unavailable');
  return response.json();
}
const kinds: GutterKind[] = [
  'argument',
  'halacha',
  'chart',
  'aggadata',
  'yerushalmi',
  'pesuk',
  'rishonim',
];

export function DataExamples(props: { lang: GalleryLang }): JSX.Element {
  const label = (key: Parameters<typeof t>[0]) => t(key, props.lang);
  const [activity, { refetch: refreshActivity }] = createResource(async () => {
    const data = await read<Activity>('/api/usage/activity');
    if (!data.ok) throw new Error('unavailable');
    return data;
  });
  const [tree, { refetch: refreshTree }] = createResource(
    () => props.lang,
    (lang) => read<RunTree>(`/api/run-tree/Berakhot/2a/tidbit.essay?lang=${lang}`),
  );
  const [selected, setSelected] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal(new Set<string>(['tidbit.essay']));
  const days = () => (activity.error ? [] : (activity()?.byDay ?? []));
  const countries = () => (activity.error ? [] : (activity()?.byCountry ?? []));
  const fmt = (n: number) => new Intl.NumberFormat(props.lang).format(Math.round(n));
  const labels = () => ({
    empty: label('noData'),
    estimated: label('estimated'),
    measured: label('measured'),
    est: label('estimated'),
    title: label('requests'),
  });
  return (
    <>
      <section id="icons">
        <h2>{label('icons')}</h2>
        <p>{label('iconsHint')}</p>
        <div class="gallery-icon-grid">
          <For each={kinds}>
            {(kind) => (
              <div>
                <span class="gallery-reader-icon" style={{ background: colorForKind(kind) }}>
                  <GutterGlyph kind={kind} size={20} />
                </span>
                <span>{label(kind)}</span>
              </div>
            )}
          </For>
        </div>
        <code class="gallery-source">@corpus/ui/ReaderIcon</code>
      </section>
      <section id="charts">
        <h2>{label('charts')}</h2>
        <p>{label('liveHint')}</p>
        <a href="https://talmud.dev/?lang=en#usage" target="_blank" rel="noreferrer">
          {label('usageSource')}
        </a>
        <p class="gallery-data-status" role="status">
          {activity.loading
            ? label('loading')
            : activity.error
              ? label('unavailable')
              : `${activity()?.windowStart ?? ''} — ${activity()?.windowEnd ?? ''}`}
        </p>
        <Show when={activity.error}>
          <Button onClick={() => void refreshActivity()}>{label('retry')}</Button>
        </Show>
        <Show when={!activity.error && activity()}>
          <div class="gallery-chart-grid">
            <ChartCard title={label('requests')}>
              <LineChart
                points={days().map((d) => ({ label: d.date, value: d.requests }))}
                fmtValue={fmt}
                fmtLabel={(date) =>
                  new Date(`${date}T00:00:00Z`).toLocaleDateString(props.lang, {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                }
                labels={labels()}
              />
            </ChartCard>
            <ChartCard title={label('countries')}>
              <RankedBars
                items={countries().map((c) => ({ label: c.country, value: c.requests }))}
                fmt={fmt}
                top={5}
                labelWidth="2.5rem"
              />
            </ChartCard>
          </div>
          <DataTable
            rows={days()}
            maxRows={5}
            initialSort={{ key: 'date', dir: 'desc' }}
            labels={{
              empty: label('noData'),
              showLess: label('showLess'),
              showMore: (count) => `${label('showMore')} (${count})`,
            }}
            columns={[
              {
                key: 'date',
                header: label('date'),
                cell: (row) => row.date,
                sortValue: (row) => row.date,
              },
              {
                key: 'requests',
                header: label('requests'),
                align: 'right',
                sortValue: (row) => row.requests,
                cell: (row) => (
                  <Meter
                    value={row.requests}
                    max={Math.max(1, ...days().map((d) => d.requests))}
                    text={fmt(row.requests)}
                  />
                ),
              },
              {
                key: 'visits',
                header: label('visits'),
                align: 'right',
                sortValue: (row) => row.visits,
                cell: (row) => fmt(row.visits),
              },
            ]}
          />
        </Show>
        <code class="gallery-source">@corpus/ui/Charts · @corpus/ui/DataTable</code>
      </section>
      <section id="maps">
        <h2>{label('maps')}</h2>
        <p>{label('mapsHint')}</p>
        <GeoMap
          bbox={GEO_BBOX.nearEast}
          points={[]}
          lang={props.lang}
          height={280}
          panZoom
          expandable
        />
        <Show when={!activity.error && activity()}>
          <WorldBubbleMap
            data={countries().map((c) => ({ code: c.country, requests: c.requests }))}
            lang={props.lang}
            height={280}
          />
        </Show>
        <code class="gallery-source">@corpus/ui/GeoMap · @corpus/ui/WorldBubbleMap</code>
      </section>
      <section id="graphs">
        <h2>{label('graphs')}</h2>
        <p>{label('graphsHint')}</p>
        <a
          href="https://talmud.dev/?lang=en&tractate=Berakhot&page=2a#align"
          target="_blank"
          rel="noreferrer"
        >
          {label('alignSource')}
        </a>
        <p class="gallery-data-status" role="status">
          {tree.loading
            ? label('loading')
            : tree.error
              ? label('unavailable')
              : label('graphSource')}
        </p>
        <Show when={tree.error}>
          <Button onClick={() => void refreshTree()}>{label('retry')}</Button>
        </Show>
        <RunTreeDag
          tree={tree.error ? null : (tree() ?? null)}
          loading={tree.loading}
          selected={selected()}
          onSelect={setSelected}
          expanded={expanded()}
          onToggleExpand={(id) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          emptyLabel={label('noData')}
        />
        <code class="gallery-source">@corpus/ui/RunTreeDag · RunTreeCanvas · RunTree</code>
      </section>
      <section id="missing">
        <h2>{label('missing')}</h2>
        <p>{label('missingHint')}</p>
        <ul class="gallery-missing">
          <For
            each={
              [
                'missingGraphs',
                'missingAlign',
                'missingUsage',
                'missingStates',
                'missingForms',
              ] as const
            }
          >
            {(key) => <li>{label(key)}</li>}
          </For>
        </ul>
      </section>
    </>
  );
}
