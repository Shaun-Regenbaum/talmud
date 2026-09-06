import { createResource, For, Show } from 'solid-js';
import { lang } from './i18n';

interface LedgerSummary {
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
  const he = () => lang() === 'he';
  const dollars = (n: number) => `$${(n / 1e9).toFixed(4)}`;
  return (
    <section style={{ margin: '1rem 0' }} aria-label="Recorded charges">
      <h3>{he() ? 'חיובים מתועדים' : 'Recorded charges'}</h3>
      <Show when={ledger.state === 'errored'}>
        <p>{he() ? 'רישום החיובים אינו זמין כרגע.' : 'The charge ledger is unavailable.'}</p>
      </Show>
      <Show when={ledger.state === 'pending'}>
        <p>{he() ? 'טוען חיובים…' : 'Loading charges…'}</p>
      </Show>
      <Show when={ledger.state === 'ready' && ledger()}>
        {(data) => (
          <>
            <p>
              <strong>{dollars(data().totals.billedNanos)}</strong>{' '}
              {he() ? 'בחיובים ידועים' : 'in known charges'} · {data().from} – {data().through} UTC
            </p>
            <p>
              {data().totals.attempts} {he() ? 'ניסיונות' : 'attempts'} ·{' '}
              {data().totals.gatewayHits ?? 0} {he() ? 'תשובות ממטמון' : 'gateway cache hits'} ·{' '}
              {data().totals.unresolved ?? 0} {he() ? 'עם עלות לא ידועה' : 'with unknown cost'}
            </p>
            <p>
              {he()
                ? 'הרישום החדש אינו כולל חיובים ישנים. עלות לא ידועה אינה אפס. תעריפי הרשימה אינם נכללים בסכום.'
                : 'This new ledger excludes earlier charges. Unknown costs are not zero. List-price estimates are excluded.'}
              {data().totals.firstRecordedAt &&
                ` ${he() ? 'רישום ראשון בתקופה:' : 'First record in this period:'} ${data().totals.firstRecordedAt!.slice(0, 10)}.`}
            </p>
            <Show when={data().byProducer.length > 0}>
              <details>
                <summary>{he() ? 'חיובים לפי פעולה' : 'Charges by producer'}</summary>
                <table>
                  <thead>
                    <tr>
                      <th>{he() ? 'פעולה' : 'Producer'}</th>
                      <th>{he() ? 'ניסיונות' : 'Attempts'}</th>
                      <th>{he() ? 'חיובים ידועים' : 'Known charges'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data().byProducer}>
                      {(row) => (
                        <tr>
                          <td>{row.producer}</td>
                          <td>{row.attempts}</td>
                          <td>{dollars(row.billedNanos)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </details>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
