/**
 * Tanach LLM-usage dashboard. A thin wrapper: fetch the KV ledger from
 * /api/usage (a @corpus/core/telemetry UsageLedger) and hand it to the shared
 * @corpus/ui UsagePage, which renders the tabbed breakdown. Nothing about the
 * tables is built here — the page is a projection of the recorded usage.
 */

import type { UsageEntry, UsageSummary } from '@corpus/core/telemetry/types';
import { UsagePage as SharedUsagePage } from '@corpus/ui/UsagePage';
import { createResource, type JSX, Show } from 'solid-js';

interface UsageLedger {
  summary: UsageSummary;
  recent: UsageEntry[];
}

async function fetchUsage(): Promise<UsageLedger> {
  const res = await fetch('/api/usage');
  return (await res.json()) as UsageLedger;
}

export function UsagePage(): JSX.Element {
  const [led] = createResource(fetchUsage);

  return (
    <>
      <Show when={led.loading}>
        <p class="status">Loading…</p>
      </Show>
      <Show when={led()}>
        {(d) => (
          <SharedUsagePage
            summary={d().summary}
            recent={d().recent}
            title="LLM Usage"
            backHref="/"
            backLabel="Tanach"
          />
        )}
      </Show>
    </>
  );
}
