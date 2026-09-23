import { For, type JSX, Show } from 'solid-js';
import './summaries.css';

export function MetricSummary(props: {
  title: string;
  value: JSX.Element;
  valueLabel: string;
  period?: JSX.Element;
  metrics: { label: string; value: JSX.Element; detail?: string }[];
  notes?: string[];
  children?: JSX.Element;
}): JSX.Element {
  return (
    <section class="ui-metric-summary" aria-label={props.title}>
      <header>
        <h3>{props.title}</h3>
        <Show when={props.period}>
          <span class="ui-summary-period">{props.period}</span>
        </Show>
      </header>
      <div class="ui-summary-lead">
        <strong>{props.value}</strong>
        <span>{props.valueLabel}</span>
      </div>
      <dl class="ui-summary-metrics">
        <For each={props.metrics}>
          {(metric) => (
            <div>
              <dt>{metric.label}</dt>
              <dd>
                {metric.value}
                <Show when={metric.detail}>
                  <small>{metric.detail}</small>
                </Show>
              </dd>
            </div>
          )}
        </For>
      </dl>
      <Show when={props.notes?.length}>
        <ul class="ui-summary-notes">
          <For each={props.notes}>{(note) => <li>{note}</li>}</For>
        </ul>
      </Show>
      {props.children}
    </section>
  );
}

export function DetailSection(props: {
  title: string;
  description?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <details
      class="ui-detail-section"
      open={props.open}
      onToggle={(event) => props.onToggle?.(event.currentTarget.open)}
    >
      <summary>
        <span class="ui-detail-chevron" aria-hidden="true">
          ›
        </span>
        <span class="ui-detail-copy">
          <strong>{props.title}</strong>
          <Show when={props.description}>
            <span>{props.description}</span>
          </Show>
        </span>
      </summary>
      <div class="ui-detail-body">{props.children}</div>
    </details>
  );
}
