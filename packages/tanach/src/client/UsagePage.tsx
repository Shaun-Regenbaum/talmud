import type { UsageEntry, UsageSummary } from '@corpus/core/telemetry/types';
import { StatusMessage } from '@corpus/ui/Study';
import { UsagePage as SharedUsagePage } from '@corpus/ui/UsagePage';
import { createResource, createSignal, type JSX, Show } from 'solid-js';
import { t } from './i18n';

interface UsageLedger {
  summary: UsageSummary;
  recent: UsageEntry[];
}
async function fetchUsage(): Promise<UsageLedger> {
  const response = await fetch('/api/usage');
  if (!response.ok) throw new Error('Usage unavailable');
  return response.json();
}
export function UsagePage(): JSX.Element {
  const [lang, setLang] = createSignal<'en' | 'he'>(
    new URLSearchParams(window.location.search).get('lang') === 'he' ? 'he' : 'en',
  );
  const [ledger, { refetch }] = createResource(fetchUsage);
  return (
    <>
      <Show when={ledger.loading || ledger.error}>
        <div class="usage-page" dir={lang() === 'he' ? 'rtl' : 'ltr'}>
          <Show when={ledger.loading}>
            <StatusMessage tone="loading">{t('loading', lang())}</StatusMessage>
          </Show>
          <Show when={ledger.error}>
            <StatusMessage
              tone="error"
              onRetry={() => void refetch()}
              retryLabel={t('retry', lang())}
            >
              {t('unavailable', lang())}
            </StatusMessage>
          </Show>
        </div>
      </Show>
      <Show when={!ledger.error && ledger()}>
        {(data) => (
          <SharedUsagePage
            summary={data().summary}
            recent={data().recent}
            title={t('usage', lang())}
            backHref={`/?lang=${lang()}`}
            backLabel={t('title', lang())}
            lang={lang()}
            onLangChange={(value) => {
              setLang(value);
              const url = new URL(location.href);
              url.searchParams.set('lang', value);
              history.replaceState(null, '', url);
            }}
          />
        )}
      </Show>
    </>
  );
}
