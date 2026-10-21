import { For, Show } from 'solid-js';
import type { InitialReading } from '../lib/sage-graph/initial-readings';
import { type ReadingPins, sourcePersonHash } from '../lib/sage-graph/reading-pins';
import { lang, t } from './i18n';
import { PersonStatus } from './PersonStatus';

export function PersonReadingBasis(props: { reading: InitialReading; pins?: ReadingPins }) {
  return (
    <details class="person-passage">
      <summary>{t('initial.basis')}</summary>
      <p>{props.reading.reason}</p>
      <Show when={props.reading.checked && !props.reading.checked.wholeReadingFullyChecked}>
        <p>{t('checked.partial')}</p>
      </Show>
      <For each={props.reading.reviewedPeople}>
        {(reviewed) => (
          <p>
            {t('initial.reviewedAtWords')}{' '}
            <a
              href={
                reviewed.id.startsWith('local:')
                  ? sourcePersonHash(reviewed.id, props.pins)
                  : `#sages/${encodeURIComponent(reviewed.id)}`
              }
            >
              {reviewed.name}
            </a>
          </p>
        )}
      </For>
      <For each={props.reading.proposals}>
        {(proposal) => (
          <section>
            <Show when={proposal.sourceWarning}>
              <PersonStatus error>{t('initial.sourceWarning')}</PersonStatus>
            </Show>
            <Show when={proposal.candidate}>
              {(candidate) => (
                <p>
                  {t(
                    proposal.reviewDecision === 'rejected' ||
                      proposal.reviewDecision === 'superseded'
                      ? 'initial.earlierMatch'
                      : proposal.reviewDecision === 'current'
                        ? 'initial.currentMatch'
                        : 'initial.possibleMatch',
                  )}{' '}
                  <a href={`#sages/${encodeURIComponent(candidate().id)}`}>
                    {lang() === 'he' ? candidate().nameHe : candidate().name}
                  </a>
                </p>
              )}
            </Show>
            <Show when={proposal.reviewDecision}>
              <p>{t(`initial.assessment.${proposal.reviewDecision}`)}</p>
            </Show>
            <p>{proposal.reason}</p>
            <Show when={proposal.registryEntries}>
              {(entries) => (
                <p>
                  {t('initial.registryEntries')}{' '}
                  <For each={entries().listed}>
                    {(entry, i) => (
                      <>
                        {i() > 0 ? ', ' : ''}
                        <a href={`#sages/${encodeURIComponent(entry.id)}`}>
                          {lang() === 'he' ? entry.nameHe : entry.name}
                        </a>
                      </>
                    )}
                  </For>
                  <Show when={entries().total > entries().listed.length}>
                    {' '}
                    {t('initial.registryEntriesMore', {
                      count: entries().total - entries().listed.length,
                    })}
                  </Show>
                </p>
              )}
            </Show>
            <For each={proposal.alternatives}>{(reason) => <p>{reason}</p>}</For>
            <Show when={proposal.eraReason}>
              <p>
                {t('initial.eraReason')} {proposal.eraReason}
              </p>
            </Show>
            <For each={proposal.evidence}>
              {(evidence) => (
                <details class="person-passage">
                  <summary>
                    {evidence.ref}
                    <Show when={evidence.location && evidence.location !== 'passage'}>
                      {' '}
                      · {t('initial.context')}
                    </Show>
                  </summary>
                  <blockquote lang="he" dir="rtl">
                    {evidence.quote}
                  </blockquote>
                </details>
              )}
            </For>
          </section>
        )}
      </For>
      <For each={props.reading.alternatives}>{(alternative) => <p>{alternative.reason}</p>}</For>
      <For each={props.reading.neededContext}>
        {(context) => (
          <p>
            {t('initial.needsContext')} {context}
          </p>
        )}
      </For>
    </details>
  );
}
