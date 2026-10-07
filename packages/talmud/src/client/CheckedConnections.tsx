import { SectionHeading, StatusMessage } from '@corpus/ui/Study';
import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type { CheckedConnection, CheckedGraph, CheckedNode } from '../lib/sage-graph/types';
import { fetchCheckedGraph, type GraphQuery } from './checkedGraph';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';
import './checkedConnections.css';

export function CheckedConnections(props: {
  query?: GraphQuery;
  data?: CheckedGraph;
  onPerson?: (slug: string) => void;
  onRetry?: () => void;
}) {
  const [cursor, setCursor] = createSignal('');
  const [fixedRevision, setFixedRevision] = createSignal('');
  createEffect(() => {
    void JSON.stringify(props.query);
    setCursor('');
    setFixedRevision('');
  });
  const [result, { refetch }] = createResource(
    () => (props.query ? { query: props.query, after: cursor(), revision: fixedRevision() } : null),
    async (args) => {
      try {
        return {
          data: await fetchCheckedGraph(args.query, args.after, args.revision),
          failed: false,
        };
      } catch {
        return { data: null, failed: true };
      }
    },
  );
  const data = () =>
    !cursor() && props.data ? props.data : result.loading ? undefined : result()?.data;
  const node = (id: string) => data()?.nodes.find((n) => n.id === id);
  const label = (n: CheckedNode) => (lang() === 'he' ? n.nameHe : n.name);
  const Person = (p: { id: string }) => (
    <Show when={node(p.id)}>
      {(n) => (
        <Show when={n().identityResolved} fallback={<bdi>{label(n())}</bdi>}>
          <a
            href={`#sages/${encodeURIComponent(p.id)}`}
            onClick={(event) => {
              if (props.onPerson) {
                event.preventDefault();
                props.onPerson(p.id);
              }
            }}
          >
            <bdi>{label(n())}</bdi>
          </a>
        </Show>
      )}
    </Show>
  );
  const relation = (row: CheckedConnection) => {
    if (row.outcome === 'failed') return t('checked.failedAttempt');
    const key = row.relation ?? row.type;
    return t(`checked.relation.${key}`);
  };
  const subject = () => (props.query && 'person' in props.query ? props.query.person : undefined);
  const groups = createMemo(() => {
    const grouped = new Map<string, { a: string; b: string; rows: CheckedConnection[] }>();
    for (const row of data()?.connections ?? []) {
      const key = JSON.stringify([row.a, row.b].sort());
      const group = grouped.get(key);
      if (group) group.rows.push(row);
      else grouped.set(key, { a: row.a, b: row.b, rows: [row] });
    }
    return [...grouped.values()];
  });
  const shortRelation = (row: CheckedConnection) => {
    if (!subject() || !row.relation) return relation(row);
    const role = row.a === subject() ? 'incoming' : 'outgoing';
    return t(`checked.role.${row.relation}.${role}`);
  };
  const openPassage = (ref: string) => {
    const match = ref.match(/^(.*?) (\d+[ab]):(\d+)$/);
    return match
      ? `/?tractate=${encodeURIComponent(match[1])}&page=${match[2]}&lang=${lang()}#daf`
      : sefariaUrl(ref);
  };
  const retry = () => {
    if (props.query)
      void fetchCheckedGraph(props.query, cursor(), fixedRevision(), true).catch(() => {});
    props.onRetry?.();
    void refetch();
  };
  return (
    <section class="checked-connections" aria-label={t('checked.title')}>
      <Show when={!result.loading && result()?.failed}>
        <StatusMessage tone="error" onRetry={retry} retryLabel={t('sages.connections.retry')}>
          {t('checked.error')}
        </StatusMessage>
      </Show>
      <Show when={data()?.connections.length}>
        <SectionHeading title={t('checked.title')} />
        <p class="checked-scope">{t('checked.scope')}</p>
        <ul class="checked-map">
          <For each={groups()}>
            {(group) => (
              <li class="checked-connection">
                <div class="checked-pair">
                  <Show
                    when={subject() && (group.a === subject() || group.b === subject())}
                    fallback={
                      <>
                        <Person id={group.a} />
                        <span class="checked-separator" aria-hidden="true">
                          ·
                        </span>
                        <Person id={group.b} />
                      </>
                    }
                  >
                    <Person id={group.a === subject() ? group.b : group.a} />
                  </Show>
                </div>
                <details>
                  <summary>
                    <span class="checked-overview">
                      <span class="checked-kinds">
                        <For each={[...new Set(group.rows.map(shortRelation))]}>
                          {(kind) => <span class="checked-kind">{kind}</span>}
                        </For>
                      </span>
                      <span class="checked-sources">
                        <For each={[...new Set(group.rows.map((row) => row.ref))]}>
                          {(ref) => <span dir="ltr">{ref}</span>}
                        </For>
                      </span>
                    </span>
                    <span class="checked-disclosure" aria-hidden="true" />
                  </summary>
                  <For each={group.rows}>
                    {(row) => (
                      <div class="checked-evidence">
                        <p class="checked-statement">
                          <Person id={row.a} /> · {relation(row)} · <Person id={row.b} />
                        </p>
                        <Show when={!row.historicalIdentityResolved}>
                          <p>{t('checked.unresolved')}</p>
                        </Show>
                        <Show when={row.type === 'intellectual'}>
                          <p>{t('checked.intellectual')}</p>
                        </Show>
                        <Show when={lang() === 'en'}>
                          <p>{row.reason}</p>
                        </Show>
                        <For each={row.evidence}>
                          {(e) => (
                            <blockquote dir="rtl" lang="he">
                              {e.quote}
                            </blockquote>
                          )}
                        </For>
                        <Show when={row.premiseConnectionIds?.length}>
                          <h5>{t('checked.familySteps')}</h5>
                          <For each={row.premiseConnectionIds}>
                            {(id) => {
                              const premise = () =>
                                [
                                  ...(data()?.connections ?? []),
                                  ...(data()?.supporting ?? []),
                                ].find((r) => r.id === id);
                              return (
                                <Show when={premise()}>
                                  {(p) => (
                                    <div class="checked-premise">
                                      <p>
                                        <Person id={p().a} /> · {relation(p())} ·{' '}
                                        <Person id={p().b} />
                                      </p>
                                      <For each={p().evidence}>
                                        {(e) => (
                                          <blockquote dir="rtl" lang="he">
                                            {e.quote}
                                          </blockquote>
                                        )}
                                      </For>
                                    </div>
                                  )}
                                </Show>
                              );
                            }}
                          </For>
                        </Show>
                        <div class="checked-source-links">
                          <a href={openPassage(row.ref) ?? undefined}>{t('checked.openPassage')}</a>
                          <Show when={sefariaUrl(row.ref)}>
                            {(url) => (
                              <a href={url()} target="_blank" rel="noopener noreferrer">
                                {t('sages.pair.source')}
                              </a>
                            )}
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </details>
              </li>
            )}
          </For>
        </ul>
        <Show when={data()?.nextCursor}>
          <button
            type="button"
            onClick={() => {
              setFixedRevision(data()!.revision);
              setCursor(data()!.nextCursor!);
            }}
          >
            {t('checked.next')}
          </button>
        </Show>
        <Show when={cursor()}>
          <button type="button" onClick={() => setCursor('')}>
            {t('checked.first')}
          </button>
        </Show>
      </Show>
    </section>
  );
}
