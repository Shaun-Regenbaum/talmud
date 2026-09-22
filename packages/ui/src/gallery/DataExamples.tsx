import { createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { GEO_CITIES } from '../../../talmud/src/client/geoShapes';
import { ParshaMap } from '../../../tanach/src/client/ParshaMap';
import type { ParshaStudy } from '../../../tanach/src/lib/parsha';
import { Button } from '../Button';
import { ChartCard, LineChart } from '../Charts';
import { DataTable, Meter, RankedBars } from '../DataTable';
import { fitBbox, GEO_BBOX, GeoMap } from '../GeoMap';
import { Prose } from '../Prose';
import { colorForKind, GutterGlyph, type GutterKind } from '../ReaderIcon';
import type { RunTree } from '../RunTree';
import { RunTreeDag } from '../RunTreeDag';
import { StudyOverview } from '../StudyOverview';
import { WorldBubbleMap } from '../WorldBubbleMap';
import parshaExample from './content/parsha.json';
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
  const parsha = () => parshaExample.data as ParshaStudy;
  const [move, setMove] = createSignal<number | null>(null);
  const pickedMove = () => (move() !== null ? parsha()?.flow[move()!] : undefined);
  const textFor = (en: string, he: string) => (props.lang === 'he' ? he || en : en || he);
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
        <div class="gallery-maps">
          <div>
            <h3>{label('talmudWorld')}</h3>
            <GeoMap
              bbox={GEO_BBOX.bavelToEy}
              points={GEO_CITIES.filter((city) => !city.approx).map((city) => ({
                name: city.name,
                nameHe: city.nameHe,
                lat: city.lat,
                lng: city.lng,
              }))}
              lang={props.lang}
              height={280}
              panZoom
              expandable
            />
          </div>
          <div class="gallery-map-pair">
            <div>
              <h3>{label('israelMap')}</h3>
              <GeoMap
                bbox={fitBbox(
                  GEO_CITIES.filter((city) => !city.approx && city.region === 'israel'),
                  GEO_BBOX.israel,
                  { padFrac: 0.12, minSpan: 0.3 },
                )}
                points={GEO_CITIES.filter((city) => !city.approx && city.region === 'israel').map(
                  (city) => ({
                    name: city.name,
                    nameHe: city.nameHe,
                    lat: city.lat,
                    lng: city.lng,
                  }),
                )}
                lang={props.lang}
                height={320}
                panZoom
                expandable
              />
            </div>
            <div>
              <h3>{label('babylonMap')}</h3>
              <GeoMap
                bbox={GEO_BBOX.bavel}
                points={GEO_CITIES.filter((city) => !city.approx && city.region === 'bavel').map(
                  (city) => ({
                    name: city.name,
                    nameHe: city.nameHe,
                    lat: city.lat,
                    lng: city.lng,
                  }),
                )}
                lang={props.lang}
                height={320}
                panZoom
                expandable
              />
            </div>
          </div>
          <Show when={!activity.error && activity()}>
            <div>
              <h3>{label('worldTraffic')}</h3>
              <WorldBubbleMap
                data={countries().map((c) => ({ code: c.country, requests: c.requests }))}
                lang={props.lang}
                height={280}
              />
            </div>
          </Show>
        </div>
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
        <code class="gallery-source">@corpus/ui/Graph · RunTreeDag · RunTreeCanvas</code>
      </section>
      <section id="overview">
        <h2>{label('overview')}</h2>
        <p>{label('overviewHint')}</p>
        <p class="gallery-data-status">
          {label('captured')} ·{' '}
          <time dir="ltr" style={{ 'white-space': 'nowrap' }}>
            {parshaExample.retrievedAt}
          </time>
        </p>
        <Show when={parsha()}>
          {(study) => (
            <div class="gallery-study" dir={props.lang === 'he' ? 'rtl' : 'ltr'}>
              <StudyOverview
                reference={study().ref}
                title={textFor(study().titleEn, study().titleHe)}
              >
                <Prose en={study().overviewEn} he={study().overviewHe} lang={props.lang} />
              </StudyOverview>
              <h3>{label('portionFlow')}</h3>
              <ParshaMap
                study={study()}
                lang={props.lang}
                selected={move()}
                onSelect={(index) => setMove(move() === index ? null : index)}
                onOpenVerse={(chapter, verse) =>
                  window.open(
                    `https://www.sefaria.org/${encodeURIComponent(study().book)}.${chapter}.${verse}?lang=${props.lang}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              />
              <Show when={pickedMove()}>
                {(section) => (
                  <div class="gallery-study-detail">
                    <StudyOverview
                      reference={section().ref}
                      title={textFor(section().titleEn, section().titleHe)}
                    >
                      <Prose en={section().summaryEn} he={section().summaryHe} lang={props.lang} />
                    </StudyOverview>
                  </div>
                )}
              </Show>
              <a href="https://tanach.dev/" target="_blank" rel="noreferrer">
                {label('openTanach')}
              </a>
            </div>
          )}
        </Show>
        <code class="gallery-source">@corpus/ui/StudyOverview · ReadingMap</code>
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
