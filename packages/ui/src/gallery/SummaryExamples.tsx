import { createResource, Show } from 'solid-js';
import type { LedgerSummary } from '../../../talmud/src/client/BillingLedger';
import { DailyComparison } from '../DailyComparison';
import { DataTable } from '../DataTable';
import { DetailSection, MetricSummary } from '../MetricSummary';
import { StatusMessage } from '../Study';
import { type GalleryLang, t } from './i18n';

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/gallery-api${path}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('unavailable');
  return response.json();
}
interface Surfaces {
  configured: boolean;
  apps: {
    talmud: { ok: boolean; byDay: { date: string; app: number; mcp: number; api: number }[] };
  };
}
export function SummaryExamples(props: { lang: GalleryLang }) {
  const label = (key: Parameters<typeof t>[0]) => t(key, props.lang);
  const [surfaces] = createResource(async () => {
    const data = await read<Surfaces>('/api/usage/surfaces');
    if (!data.configured || !data.apps.talmud.ok) throw new Error('unavailable');
    return data;
  });
  const [ledger] = createResource(() => read<LedgerSummary>('/api/billing'));
  const money = (n: number) => `$${(n / 1e9).toFixed(4)}`;
  const number = (n: number) => new Intl.NumberFormat(props.lang).format(n);
  return (
    <section id="usageSummaries">
      <h2>{label('usageSummaries')}</h2>
      <p>{label('summaryLiveHint')}</p>
      <Show when={surfaces.loading || ledger.loading}>
        <StatusMessage tone="loading">{label('loading')}</StatusMessage>
      </Show>
      <Show when={surfaces.error || ledger.error}>
        <StatusMessage tone="error">{label('unavailable')}</StatusMessage>
      </Show>
      <Show when={!surfaces.error && surfaces()}>
        {(data) => (
          <DailyComparison
            title={label('dailyChannels')}
            description={label('dailyScale')}
            series={[
              { id: 'app', label: label('channelApp'), color: '#6c8d64' },
              { id: 'mcp', label: 'MCP', color: 'var(--accent)' },
              { id: 'api', label: 'API', color: '#7a9cc0' },
            ]}
            rows={(data().apps.talmud.byDay ?? []).map((row) => ({
              date: row.date,
              values: { app: row.app, mcp: row.mcp, api: row.api },
            }))}
            formatValue={number}
            formatDate={(date) =>
              new Date(`${date}T00:00:00Z`).toLocaleDateString(props.lang, {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'UTC',
              })
            }
            emptyLabel={label('noData')}
          />
        )}
      </Show>
      <code class="gallery-source">@corpus/ui/DailyComparison</code>
      <Show when={!ledger.error && ledger()}>
        {(data) => (
          <MetricSummary
            title={label('recordedCharges')}
            value={<span dir="ltr">{money(data().totals.billedNanos)}</span>}
            valueLabel={label('knownCharges')}
            period={
              <span dir="ltr">
                {data().from} – {data().through} UTC
              </span>
            }
            metrics={[
              { label: label('attempts'), value: number(data().totals.attempts) },
              { label: label('cachedReplies'), value: number(data().totals.gatewayHits ?? 0) },
              {
                label: label('unknownCosts'),
                value: number(data().totals.unresolved ?? 0),
                detail: label('notZero'),
              },
            ]}
            notes={[
              label('ledgerScope'),
              ...(data().totals.firstRecordedAt
                ? [`${label('firstRecord')} ${data().totals.firstRecordedAt!.slice(0, 10)}`]
                : []),
            ]}
          >
            <DetailSection title={label('chargesByProducer')} description={label('producerDetail')}>
              <DataTable
                rows={data().byProducer}
                columns={[
                  { key: 'producer', header: label('producer'), cell: (row) => row.producer },
                  {
                    key: 'attempts',
                    header: label('attempts'),
                    cell: (row) => number(row.attempts),
                    align: 'right',
                  },
                  {
                    key: 'cost',
                    header: label('knownCharges'),
                    cell: (row) => money(row.billedNanos),
                    align: 'right',
                  },
                ]}
                labels={{
                  empty: label('noData'),
                  showLess: label('less'),
                  showMore: (n) => `${label('more')} (${n})`,
                }}
              />
            </DetailSection>
          </MetricSummary>
        )}
      </Show>
      <code class="gallery-source">@corpus/ui/MetricSummary · DetailSection</code>
    </section>
  );
}
