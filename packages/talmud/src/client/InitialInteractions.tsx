import { SourceCard } from '@corpus/ui/Study';
import { createMemo, For, Show } from 'solid-js';
import type { InitialReading, InitialRelationship } from '../lib/sage-graph/initial-readings';
import { type ReadingPins, sourcePersonHash } from '../lib/sage-graph/reading-pins';
import { lang, t } from './i18n';
import { PersonStatus } from './PersonStatus';
import RabbiInteractions from './RabbiInteractions';
import type { Partner, SageInteractions } from './sageInteractions';
import { sefariaUrl } from './sageInteractions';

const category = (r: InitialRelationship) =>
  r.reading.category === 'family'
    ? 'kin'
    : r.reading.modality === 'response_to_teaching'
      ? 'response'
      : r.reading.category === 'teaching'
        ? 'cites'
        : r.reading.relation === 'acts_on'
          ? 'action'
          : 'direct';

export const countedInitialRelationship = (row: InitialRelationship) =>
  row.countable !== false &&
  !!row.partnerId &&
  row.evidence.some((e) => e.published ?? e.primary) &&
  row.reading.scene_status === 'actual_report' &&
  row.reading.polarity === 'positive' &&
  row.reading.modality !== 'hypothetical';

export function initialSummary(
  id: string,
  name: string,
  reading: InitialReading,
): SageInteractions {
  const groups = new Map<string, InitialRelationship[]>();
  for (const row of reading.relationships) {
    if (!countedInitialRelationship(row)) continue;
    groups.set(row.partnerId!, [...(groups.get(row.partnerId!) ?? []), row]);
  }
  const partners: Partner[] = [...groups].map(([slug, rows]) => {
    const all = new Set<string>();
    const kinds = new Map<string, Set<string>>();
    for (const row of rows) {
      const kind = category(row);
      const keys = kinds.get(kind) ?? new Set<string>();
      for (const evidence of row.evidence.filter((e) => e.published ?? e.primary)) {
        const passage = JSON.stringify([
          evidence.edition,
          evidence.segmentId ?? evidence.ref,
          evidence.segmentSha256 ?? evidence.source_sha256,
        ]);
        all.add(passage);
        keys.add(passage);
      }
      kinds.set(kind, keys);
    }
    return {
      slug,
      name: rows[0].partnerName,
      nameHe: rows[0].partnerNameHe,
      total: all.size,
      kinds: Object.fromEntries([...kinds].map(([key, values]) => [key, values.size])),
      out: {},
      in: {},
      refs: {},
    };
  });
  partners.sort((a, b) => b.total - a.total);
  return { slug: id, name, nameHe: name, generated: '', partners, partnersInAll: partners.length };
}

export function InitialInteractions(props: {
  id: string;
  name: string;
  reading: InitialReading;
  pins?: ReadingPins;
}) {
  const data = createMemo(() => initialSummary(props.id, props.name, props.reading));
  const evidence = (rows: InitialRelationship[]) => (
    <For each={rows}>
      {(row) => (
        <SourceCard
          title={
            <>
              <bdi>
                {row.subject
                  ? lang() === 'he'
                    ? row.subject.nameHe
                    : row.subject.name
                  : t('initial.uncertainPerson')}
              </bdi>
              {' · '}
              {t(`initial.relation.${row.reading.relation}`)}{' '}
              <span aria-hidden="true">{row.reading.direction === 'symmetric' ? '↔' : '→'}</span>{' '}
              <bdi>
                {row.object
                  ? lang() === 'he'
                    ? row.object.nameHe
                    : row.object.name
                  : t('initial.uncertainPerson')}
              </bdi>
            </>
          }
          reference={row.evidence[0]?.ref}
        >
          <p>{row.reading.reason}</p>
          <Show when={row.reviewStatus}>
            <p>{t(`initial.review.${row.reviewStatus}`)}</p>
          </Show>
          <Show when={row.reading.scene_status !== 'actual_report'}>
            <p>{t(`initial.scene.${row.reading.scene_status}`)}</p>
          </Show>
          <Show when={row.reading.modality !== 'asserted'}>
            <p>{t(`initial.mode.${row.reading.modality}`)}</p>
          </Show>
          <Show when={row.reading.polarity !== 'positive'}>
            <p>{t(`initial.polarity.${row.reading.polarity}`)}</p>
          </Show>
          <For each={row.reading.alternatives}>{(alternative) => <p>{alternative.reason}</p>}</For>
          <For each={row.evidence}>
            {(anchor) => (
              <details class="person-passage">
                <summary>
                  {anchor.ref}
                  <Show when={anchor.location && anchor.location !== 'passage'}>
                    {' '}
                    · {t('initial.context')}
                  </Show>
                </summary>
                <blockquote lang="he" dir="rtl">
                  {anchor.quote}
                </blockquote>
                <a
                  href={sefariaUrl(anchor.ref) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('person.openSource')}
                </a>
              </details>
            )}
          </For>
        </SourceCard>
      )}
    </For>
  );
  const uncounted = () => props.reading.relationships.filter((r) => !countedInitialRelationship(r));
  return (
    <section class="person-connections">
      <Show
        when={data().partners.length}
        fallback={<PersonStatus>{t('person.connectionsEmpty')}</PersonStatus>}
      >
        <RabbiInteractions
          data={data()}
          subjectName={props.name}
          footer={t('initial.counts')}
          renderEvidence={(partner) => (
            <>
              <Show
                when={props.reading.relationships.some(
                  (r) => r.partnerId === partner.slug && r.partnerNavigable !== false,
                )}
                fallback={<bdi>{lang() === 'he' ? partner.nameHe : partner.name}</bdi>}
              >
                <a href={sourcePersonHash(partner.slug!, props.pins)}>
                  {lang() === 'he' ? partner.nameHe : partner.name}
                </a>
              </Show>
              <details class="person-checked-evidence">
                <summary>{t('initial.evidence')}</summary>
                {evidence(
                  props.reading.relationships.filter(
                    (r) => r.partnerId === partner.slug && countedInitialRelationship(r),
                  ),
                )}
              </details>
            </>
          )}
        />
      </Show>
      <Show when={uncounted().length}>
        <details class="person-checked-evidence">
          <summary>{t('initial.otherEvidence')}</summary>
          {evidence(uncounted())}
        </details>
      </Show>
    </section>
  );
}
