import type { UsageBucket, UsageEntry, UsageSummary } from '@corpus/core/telemetry/types';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { DataTable, Meter } from './DataTable';
import { LangToggle } from './LangToggle';
import { FilterChip, StatCard } from './Study';

const messages = {
  title: ['Usage', 'שימוש'],
  back: ['Back', 'חזרה'],
  cost: ['Cost', 'עלות'],
  calls: ['Calls', 'קריאות'],
  tokensIn: ['Tokens in', 'טוקנים נכנסים'],
  tokensOut: ['Tokens out', 'טוקנים יוצאים'],
  tokenPair: ['Tokens in/out', 'טוקנים נכנסים/יוצאים'],
  costPair: ['In/out cost', 'עלות קלט/פלט'],
  perCall: ['Cost per call', 'עלות לקריאה'],
  producer: ['By producer', 'לפי תהליך'],
  model: ['By model', 'לפי מודל'],
  page: ['By page', 'לפי עמוד'],
  recent: ['Recent', 'אחרונים'],
  name: ['Name', 'שם'],
  when: ['When', 'מתי'],
  reference: ['Reference', 'מראה מקום'],
  process: ['Producer', 'תהליך'],
  modelName: ['Model', 'מודל'],
  empty: ['Nothing recorded yet.', 'עדיין לא נרשמו נתונים.'],
  showLess: ['Show less', 'הצגת פחות'],
  showMore: ['Show more', 'הצגת עוד'],
} as const;
type Lang = 'en' | 'he';
function t(key: keyof typeof messages, lang: Lang): string {
  return messages[key][lang === 'he' ? 1 : 0];
}
const usd = (n: number) => `$${(n ?? 0).toFixed(4)}`;
const model = (name: string) => name.replace(/^openrouter\//, '');
type Tab = 'producer' | 'model' | 'page' | 'recent';

export interface UsagePageProps {
  summary: UsageSummary;
  recent: UsageEntry[];
  title?: string;
  backHref?: string;
  backLabel?: string;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
}
export function UsagePage(props: UsagePageProps): JSX.Element {
  const [tab, setTab] = createSignal<Tab>('producer');
  const lang = () => props.lang ?? 'en';
  const label = (key: keyof typeof messages) => t(key, lang());
  const num = (value: number) => (value ?? 0).toLocaleString(lang());
  const totals = () => props.summary.totals;
  const tableLabels = () => ({
    empty: label('empty'),
    showLess: label('showLess'),
    showMore: (count: number) => `${label('showMore')} (${num(count)})`,
  });
  const buckets = (): [string, UsageBucket][] =>
    Object.entries(
      tab() === 'model'
        ? props.summary.byModel
        : tab() === 'page'
          ? props.summary.byRef
          : props.summary.byProducer,
    );
  const maxCost = () => Math.max(...buckets().map(([, bucket]) => bucket.costUsd), 0.000001);
  return (
    <main class="usage-page" dir={lang() === 'he' ? 'rtl' : 'ltr'}>
      <header class="usage-head">
        <Show when={props.backHref}>
          <a class="ui-button" href={props.backHref}>
            ‹ {props.backLabel ?? label('back')}
          </a>
        </Show>
        <h1 class="usage-title">{props.title ?? label('title')}</h1>
        <Show when={props.onLangChange}>
          <LangToggle lang={lang()} onChange={(value) => props.onLangChange?.(value)} />
        </Show>
      </header>
      <div class="usage-cards">
        <StatCard label={label('cost')} value={usd(totals().costUsd)} />
        <StatCard label={label('calls')} value={num(totals().calls)} />
        <StatCard label={label('tokensIn')} value={num(totals().tokensIn)} />
        <StatCard label={label('tokensOut')} value={num(totals().tokensOut)} />
        <Show when={totals().costInUsd || totals().costOutUsd}>
          <StatCard
            label={label('costPair')}
            value={`${usd(totals().costInUsd)} / ${usd(totals().costOutUsd)}`}
          />
        </Show>
      </div>
      <div class="usage-tabs">
        <For each={['producer', 'model', 'page', 'recent'] as const}>
          {(value) => (
            <FilterChip active={tab() === value} onClick={() => setTab(value)}>
              {label(value)}
            </FilterChip>
          )}
        </For>
      </div>
      <Show
        when={tab() !== 'recent'}
        fallback={
          <DataTable
            labels={tableLabels()}
            rows={props.recent}
            maxRows={30}
            columns={[
              {
                key: 'when',
                header: label('when'),
                sortValue: (row) => row.ts,
                cell: (row) => new Date(row.ts).toLocaleString(lang()),
              },
              { key: 'ref', header: label('reference'), cell: (row) => row.ref },
              { key: 'producer', header: label('process'), cell: (row) => row.producer },
              { key: 'model', header: label('modelName'), cell: (row) => model(row.model) },
              {
                key: 'in',
                header: label('tokensIn'),
                align: 'right',
                sortValue: (row) => row.tokensIn,
                cell: (row) => num(row.tokensIn),
              },
              {
                key: 'out',
                header: label('tokensOut'),
                align: 'right',
                sortValue: (row) => row.tokensOut,
                cell: (row) => num(row.tokensOut),
              },
              {
                key: 'cost',
                header: label('cost'),
                align: 'right',
                sortValue: (row) => row.costUsd ?? -1,
                cell: (row) => (row.costUsd == null ? '—' : usd(row.costUsd)),
              },
            ]}
          />
        }
      >
        <DataTable
          labels={tableLabels()}
          rows={buckets()}
          initialSort={{ key: 'cost', dir: 'desc' }}
          maxRows={30}
          columns={[
            {
              key: 'name',
              header: label('name'),
              sortValue: (row) => row[0],
              cell: (row) => (tab() === 'model' ? model(row[0]) : row[0]),
            },
            {
              key: 'calls',
              header: label('calls'),
              align: 'right',
              sortValue: (row) => row[1].calls,
              cell: (row) => num(row[1].calls),
            },
            {
              key: 'tokens',
              header: label('tokenPair'),
              align: 'right',
              cell: (row) =>
                row[1].tokensIn || row[1].tokensOut
                  ? `${num(row[1].tokensIn)} / ${num(row[1].tokensOut)}`
                  : '—',
            },
            {
              key: 'split',
              header: label('costPair'),
              align: 'right',
              cell: (row) =>
                row[1].costInUsd || row[1].costOutUsd
                  ? `${usd(row[1].costInUsd)} / ${usd(row[1].costOutUsd)}`
                  : '—',
            },
            {
              key: 'perCall',
              header: label('perCall'),
              align: 'right',
              cell: (row) => (row[1].calls > 0 ? usd(row[1].costUsd / row[1].calls) : '—'),
            },
            {
              key: 'cost',
              header: label('cost'),
              align: 'right',
              sortValue: (row) => row[1].costUsd,
              cell: (row) => (
                <Meter value={row[1].costUsd} max={maxCost()} text={usd(row[1].costUsd)} />
              ),
            },
          ]}
        />
      </Show>
    </main>
  );
}
