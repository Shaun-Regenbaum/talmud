/** The unreviewed machine readings, counted apart from the reviewed network. */
import { createResource, For, type JSX, Show } from 'solid-js';
import type { MachineSummary } from '../lib/sage-graph/machine-summary';
import { lang, t } from './i18n';

async function load(): Promise<MachineSummary | null> {
  try {
    const response = await fetch('/api/sage-graph/machine');
    return response.ok ? ((await response.json()) as MachineSummary) : null;
  } catch {
    return null;
  }
}

export function MachineReadings(): JSX.Element {
  const [data] = createResource(load);
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  return (
    <Show when={data()}>
      {(summary) => (
        <section class="sages-machine" aria-labelledby="sages-machine-title">
          <h3 id="sages-machine-title">{t('machine.sages.title')}</h3>
          <p class="sages-overview-lead">{t('machine.sages.lead')}</p>
          <ul class="sages-open">
            <li>
              <span class="sages-open-n">{number(summary().readings)}</span>
              <span>{t('machine.sages.readings')}</span>
            </li>
            <li>
              <span class="sages-open-n">{number(summary().people.total)}</span>
              <span>
                {t('machine.sages.people', {
                  named: number(
                    (summary().people.byForm.named ?? 0) +
                      (summary().people.byForm.embedded_parent ?? 0),
                  ),
                })}
              </span>
            </li>
            <li>
              <span class="sages-open-n">{number(summary().connections.total)}</span>
              <span>
                {t('machine.sages.connections', {
                  held: number(summary().held.reduce((n, h) => n + h.n, 0)),
                })}
              </span>
            </li>
          </ul>
          <h4>{t('machine.sages.kindsTitle')}</h4>
          <ul class="sages-works">
            <For each={summary().connections.byRelation}>
              {(r) => (
                <li>
                  <span class="sages-works-name">{t(`machine.rel.${r.relation}`)}</span>
                  <span
                    class="sages-works-bar"
                    style={{
                      width: `${Math.max(4, (r.n / summary().connections.byRelation[0].n) * 100)}%`,
                    }}
                  />
                  <span class="sages-works-n">{number(r.n)}</span>
                </li>
              )}
            </For>
          </ul>
          <Show when={summary().pairs.length}>
            <h4>{t('machine.sages.pairsTitle')}</h4>
            <p class="sages-overview-foot">{t('machine.sages.pairsNote')}</p>
            <ul class="sages-works">
              <For each={summary().pairs.slice(0, 15)}>
                {(p) => (
                  <li>
                    <span class="sages-works-name">
                      <bdi>{p.a}</bdi> {p.symmetric ? '↔' : '→'} <bdi>{p.b}</bdi>{' '}
                      <small>{t(`machine.rel.${p.relation}`)}</small>
                    </span>
                    <span
                      class="sages-works-bar"
                      style={{ width: `${Math.max(4, (p.n / summary().pairs[0].n) * 100)}%` }}
                    />
                    <span class="sages-works-n">{number(p.n)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <h4>{t('machine.sages.worksTitle')}</h4>
          <ul class="sages-works">
            <For each={summary().works.slice(0, 12)}>
              {(w) => (
                <li>
                  <span class="sages-works-name">{w.work}</span>
                  <span
                    class="sages-works-bar"
                    style={{
                      width: `${Math.max(4, (w.readings / summary().works[0].readings) * 100)}%`,
                    }}
                  />
                  <span class="sages-works-n">{number(w.readings)}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      )}
    </Show>
  );
}
