import { DetailSection, MetricSummary } from '@corpus/ui/MetricSummary';
import { StatusMessage } from '@corpus/ui/Study';
import { createResource, Show } from 'solid-js';
import { DataTable } from './DataTable';
import { lang, t } from './i18n';

export interface LedgerSummary {
  from: string;
  through: string;
  totals: {
    attempts: number;
    unresolved: number;
    gatewayHits: number;
    billedNanos: number;
    firstRecordedAt: string | null;
  };
  byProducer: Array<{ producer: string; attempts: number; billedNanos: number }>;
}

export function BillingLedger() {
  const [ledger] = createResource(async () => {
    const response = await fetch('/api/billing');
    if (!response.ok) throw new Error('Billing ledger unavailable');
    return (await response.json()) as LedgerSummary;
  });
  const dollars = (n: number) => `$${(n / 1e9).toFixed(4)}`;
  const count = (n: number) => new Intl.NumberFormat(lang()).format(n);
  return (
    <>
      <Show when={ledger.state === 'errored'}>
        <StatusMessage tone="error">{t('usage.ledger.unavailable')}</StatusMessage>
      </Show>
      <Show when={ledger.state === 'pending'}>
        <StatusMessage tone="loading">{t('usage.ledger.loading')}</StatusMessage>
      </Show>
      <Show when={ledger.state === 'ready' && ledger()}>
        {(data) => (
          <MetricSummary
            title={t('usage.ledger.title')}
            value={<span dir="ltr">{dollars(data().totals.billedNanos)}</span>}
            valueLabel={t('usage.ledger.known')}
            period={
              <span dir="ltr">
                {data().from} – {data().through} UTC
              </span>
            }
            metrics={[
              { label: t('usage.ledger.attempts'), value: count(data().totals.attempts) },
              {
                label: t('usage.ledger.cached'),
                value: count(data().totals.gatewayHits ?? 0),
                detail: t('usage.ledger.cachedDetail'),
              },
              {
                label: t('usage.ledger.unknown'),
                value: count(data().totals.unresolved ?? 0),
                detail: t('usage.ledger.unknownDetail'),
              },
            ]}
            notes={[
              t('usage.ledger.scope'),
              ...(data().totals.firstRecordedAt
                ? [t('usage.ledger.first', { date: data().totals.firstRecordedAt!.slice(0, 10) })]
                : []),
            ]}
          >
            <Show when={data().byProducer.length > 0}>
              <DetailSection
                title={t('usage.ledger.producers')}
                description={t('usage.ledger.producersHint')}
              >
                <DataTable
                  rows={data().byProducer}
                  columns={[
                    {
                      key: 'producer',
                      header: t('usage.ledger.producer'),
                      cell: (row) => row.producer,
                    },
                    {
                      key: 'attempts',
                      header: t('usage.ledger.attempts'),
                      align: 'right',
                      cell: (row) => count(row.attempts),
                      sortValue: (row) => row.attempts,
                    },
                    {
                      key: 'charges',
                      header: t('usage.ledger.known'),
                      align: 'right',
                      cell: (row) => dollars(row.billedNanos),
                      sortValue: (row) => row.billedNanos,
                    },
                  ]}
                />
              </DetailSection>
            </Show>
          </MetricSummary>
        )}
      </Show>
    </>
  );
}
