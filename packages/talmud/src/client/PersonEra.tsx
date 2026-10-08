import { For, Show } from 'solid-js';
import type { ReviewedEra } from '../lib/sage-graph/types';
import { GENERATION_BY_ID, type GenerationId, generationLabelHe } from './generations';
import { lang, t } from './i18n';
import './personCard.css';

export function generationRange(era: string): [number, number] | null {
  const parts = era.split(/[–—]/);
  if (parts.length !== 2) return null;
  const value = (s: string) => {
    const n = s.match(/\d+/);
    return n ? +n[0] * (/BCE/.test(s) ? -1 : 1) : null;
  };
  const start = value(parts[0]),
    end = value(parts[1]);
  return start != null && end != null && end > start ? [start, end] : null;
}
function eraLabel(era: string) {
  return lang() === 'he'
    ? era
        .replace(/\bBCE\b/g, 'לפנה״ס')
        .replace(/\bCE\b/g, 'לספירה')
        .replace(/\bc\.\s*/g, '~')
    : era;
}
export function PersonEra(props: {
  generation?: string | null;
  uncertain?: boolean;
  reviewed?: ReviewedEra;
}) {
  const gen = () =>
    props.generation && props.generation !== 'unknown'
      ? GENERATION_BY_ID[props.generation as GenerationId]
      : undefined;
  const range = (): [number, number] | null =>
    props.reviewed
      ? [props.reviewed.start, props.reviewed.end]
      : gen()
        ? generationRange(gen()!.era)
        : null;
  const label = () =>
    props.reviewed
      ? lang() === 'he'
        ? props.reviewed.labelHe
        : props.reviewed.label
      : gen()
        ? lang() === 'he'
          ? generationLabelHe(gen()!)
          : gen()!.label
        : t('person.eraUnknown');
  const bounds = () =>
    range()
      ? [Math.floor((range()![0] - 50) / 100) * 100, Math.ceil((range()![1] + 50) / 100) * 100]
      : [200, 500];
  const pct = (n: number) => (100 * (n - bounds()[0])) / (bounds()[1] - bounds()[0]);
  return (
    <section class="person-era" aria-label={t('person.era')}>
      <div class="person-era-heading">
        <strong>{t('person.era')}</strong>
        <Show when={gen()}>
          <span>
            {eraLabel(gen()!.era)}
            {props.uncertain ? ' · ?' : ''}
          </span>
        </Show>
      </div>
      <Show when={range()}>
        <div class="person-era-ruler" dir="ltr" role="img" aria-label={label()}>
          <div class="person-era-line" />
          <Show when={range()}>
            <div
              class="person-era-range"
              classList={{ uncertain: props.uncertain }}
              style={{
                left: `${pct(range()![0])}%`,
                width: `${pct(range()![1]) - pct(range()![0])}%`,
              }}
            />
          </Show>
          <For each={[0, 1, 2, 3, 4]}>
            {(i) => (
              <span class="person-era-tick" style={{ left: `${i * 25}%` }}>
                <span>{Math.round(bounds()[0] + (i * (bounds()[1] - bounds()[0])) / 4)}</span>
              </span>
            )}
          </For>
        </div>
      </Show>
      <p class="person-era-caption" title={t('person.generationRange')}>
        {label()}
      </p>
      <Show when={props.reviewed}>
        {(era) => (
          <a
            class="person-partner-link"
            href={era().source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {era().source.title}
          </a>
        )}
      </Show>
    </section>
  );
}
