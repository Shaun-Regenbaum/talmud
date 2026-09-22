import { createMemo, For, type JSX, Show } from 'solid-js';
import './summaries.css';

export interface DailySeries {
  id: string;
  label: string;
  color: string;
}
export interface DailyValues {
  date: string;
  values: Record<string, number | null | undefined>;
}
/** Non-negative counts share one scale. Missing values remain distinct from zero. */
export function DailyComparison(props: {
  title: string;
  description: string;
  series: DailySeries[];
  rows: DailyValues[];
  formatValue: (value: number) => string;
  formatDate: (date: string) => string;
  emptyLabel: string;
}): JSX.Element {
  const valid = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const maximum = createMemo(() =>
    Math.max(
      1,
      ...props.rows.flatMap((row) =>
        props.series.map((series) => (valid(row.values[series.id]) ? row.values[series.id]! : 0)),
      ),
    ),
  );
  return (
    <section class="ui-daily" aria-label={props.title}>
      <div class="ui-daily-heading">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div class="ui-daily-legend">
        <For each={props.series}>
          {(series) => (
            <span>
              <i style={{ background: series.color }} />
              {series.label}
            </span>
          )}
        </For>
      </div>
      <Show when={props.rows.length} fallback={<p class="ui-summary-note">{props.emptyLabel}</p>}>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the overflowing chart must be reachable for keyboard scrolling */}
        <section class="ui-daily-scroll" tabIndex={0} aria-label={props.title}>
          <div class="ui-daily-days">
            <For each={props.rows}>
              {(row) => (
                <div class="ui-daily-day">
                  <div class="ui-daily-bars" aria-hidden="true">
                    <For each={props.series}>
                      {(series) => {
                        const value = () => row.values[series.id];
                        return (
                          <div class="ui-daily-bar-slot">
                            <span
                              classList={{
                                'is-missing': !valid(value()),
                                'is-zero': value() === 0,
                              }}
                              style={{
                                background: series.color,
                                height: valid(value()) ? `${(value()! / maximum()) * 100}%` : '0%',
                              }}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                  <time dateTime={row.date} title={row.date}>
                    {props.formatDate(row.date)}
                  </time>
                  <dl class="ui-daily-values">
                    <For each={props.series}>
                      {(series) => (
                        <div>
                          <dt>
                            <i style={{ background: series.color }} />
                            <span class="ui-summary-sr-only">{series.label}</span>
                          </dt>
                          <dd>
                            {valid(row.values[series.id])
                              ? props.formatValue(row.values[series.id]!)
                              : '—'}
                          </dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>
    </section>
  );
}
