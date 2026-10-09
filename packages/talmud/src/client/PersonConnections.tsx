import { SourceCard } from '@corpus/ui/Study';
import { createMemo, createResource, For, Show } from 'solid-js';
import { canonicalSlug } from '../lib/rabbi/identity';
import type { CheckedConnection, CheckedGraph } from '../lib/sage-graph/types';
import { fetchCheckedGraph } from './checkedGraph';
import { lang, t } from './i18n';
import { PersonStatus } from './PersonStatus';
import RabbiInteractions from './RabbiInteractions';
import {
  fetchSageInteractions,
  type Partner,
  type SageInteractions,
  sefariaUrl,
} from './sageInteractions';
import './personCard.css';

export function mergePersonConnections(
  subject: string,
  graph: CheckedGraph | null,
  summary: SageInteractions | null,
): SageInteractions {
  const partners: Partner[] = (summary?.partners ?? []).map((p) => ({ ...p }));
  const relevant = (graph?.connections ?? []).filter((c) => c.a === subject || c.b === subject);
  const ids = new Set(relevant.map((c) => (c.a === subject ? c.b : c.a)));
  for (const id of ids) {
    if (partners.some((p) => p.slug === id)) continue;
    const node = graph?.nodes.find((n) => n.id === id);
    if (!node) continue;
    const rows = relevant.filter((c) => c.a === id || c.b === id);
    const groups = {
      direct: new Set<string>(),
      response: new Set<string>(),
      cites: new Set<string>(),
      action: new Set<string>(),
      kin: new Set<string>(),
    };
    for (const c of rows)
      groups[
        c.type === 'family'
          ? 'kin'
          : c.type === 'intellectual'
            ? c.relation === 'quoted_teaching'
              ? 'cites'
              : 'response'
            : c.type === 'action'
              ? 'action'
              : 'direct'
      ].add(c.ref);
    partners.push({
      slug: id,
      name: node.name,
      nameHe: node.nameHe,
      total: new Set(rows.map((c) => c.ref)).size,
      kinds: Object.fromEntries(
        Object.entries(groups)
          .filter(([, v]) => v.size)
          .map(([k, v]) => [k, v.size]),
      ),
      out: groups.cites.size
        ? {
            cites: new Set(
              rows
                .filter((c) => c.relation === 'quoted_teaching' && c.a === subject)
                .map((c) => c.ref),
            ).size,
          }
        : {},
      in: groups.cites.size
        ? {
            cites: new Set(
              rows
                .filter((c) => c.relation === 'quoted_teaching' && c.b === subject)
                .map((c) => c.ref),
            ).size,
          }
        : {},
      refs: groups.cites.size ? { cites: [...groups.cites] } : {},
    });
  }
  partners.sort((a, b) => b.total - a.total);
  const n = graph?.nodes.find((n) => n.id === subject);
  return {
    slug: subject,
    name: summary?.name ?? n?.name ?? '',
    nameHe: summary?.nameHe ?? n?.nameHe ?? '',
    generated: summary?.generated ?? '',
    partners,
    partnersInAll: partners.length,
  };
}
export function PersonConnections(props: {
  id: string;
  name?: string;
  revision?: string;
  onPerson?: (id: string) => void;
}) {
  const [data, { refetch }] = createResource(
    () => ({ id: canonicalSlug(props.id), revision: props.revision }),
    async ({ id, revision }) => {
      const graphJob = async () => {
        let g = await fetchCheckedGraph({ person: id }, '', revision ?? '', true);
        const visited = new Set<string>();
        while (g.nextCursor) {
          if (visited.has(g.nextCursor)) throw Error('Repeated graph cursor');
          visited.add(g.nextCursor);
          const p = await fetchCheckedGraph({ person: id }, g.nextCursor, g.revision, true);
          g = {
            ...p,
            connections: [...g.connections, ...p.connections],
            supporting: [...g.supporting, ...p.supporting],
            nodes: [...new Map([...g.nodes, ...p.nodes].map((n) => [n.id, n])).values()],
          };
        }
        return g;
      };
      const [g, s] = await Promise.allSettled([
        graphJob(),
        id.startsWith('local:') ? Promise.resolve(null) : fetchSageInteractions(id, true),
      ]);
      return {
        graph: g.status === 'fulfilled' ? g.value : null,
        summary: s.status === 'fulfilled' ? s.value : null,
        failed: g.status === 'rejected' || s.status === 'rejected',
      };
    },
  );
  const combined = createMemo(() =>
    mergePersonConnections(canonicalSlug(props.id), data()?.graph ?? null, data()?.summary ?? null),
  );
  const matches = (p: Partner) =>
    (data()?.graph?.connections ?? []).filter((c) => c.a === p.slug || c.b === p.slug);
  const personLink = (id: string) =>
    id.startsWith('local:')
      ? `#source-person/${encodeURIComponent(id)}`
      : `#sages/${encodeURIComponent(id)}`;
  const label = (id: string) => {
    const n = data()?.graph?.nodes.find((n) => n.id === id);
    return n ? (lang() === 'he' ? n.nameHe : n.name) : id;
  };
  const relation = (row: CheckedConnection) =>
    row.outcome === 'failed'
      ? t('checked.failedAttempt')
      : t(`checked.relation.${row.relation ?? row.type}`);
  const familyRole = (row: CheckedConnection) =>
    row.relation
      ? t(
          `checked.role.${row.relation}.${row.a === canonicalSlug(props.id) ? 'incoming' : 'outgoing'}`,
        )
      : relation(row);
  return (
    <section class="person-connections">
      <Show when={data.loading}>
        <PersonStatus>{t('person.connectionsLoading')}</PersonStatus>
      </Show>
      <Show when={!data.loading}>
        <Show when={data()?.failed}>
          <PersonStatus error onRetry={() => void refetch()}>
            {t('person.connectionsError')}
          </PersonStatus>
        </Show>
        <Show
          when={combined().partners.length}
          fallback={
            <Show when={!data()?.failed}>
              <PersonStatus>{t('person.connectionsEmpty')}</PersonStatus>
            </Show>
          }
        >
          <RabbiInteractions
            data={combined()}
            subjectName={props.name ?? combined().name}
            footer={t(data()?.summary ? 'person.mixedCounts' : 'person.checkedCounts')}
            renderEvidence={(partner) => (
              <>
                <Show when={matches(partner).length}>
                  <details class="person-checked-evidence">
                    <summary>
                      {t('person.checkedPassages')} ·{' '}
                      {new Set(matches(partner).map((c) => c.ref)).size}
                    </summary>
                    <For each={matches(partner)}>
                      {(row) => (
                        <SourceCard
                          title={row.type === 'family' ? familyRole(row) : relation(row)}
                          reference={
                            <a
                              href={sefariaUrl(row.ref) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {row.ref}
                            </a>
                          }
                        >
                          <Show when={row.type === 'intellectual'}>
                            <p>{t('checked.intellectual')}</p>
                          </Show>
                          <Show when={!row.historicalIdentityResolved}>
                            <p>{t('checked.unresolved')}</p>
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
                            <details class="person-supporting">
                              <summary>{t('checked.familySteps')}</summary>
                              <For each={row.premiseConnectionIds}>
                                {(id) => {
                                  const premise = () =>
                                    [
                                      ...(data()?.graph?.connections ?? []),
                                      ...(data()?.graph?.supporting ?? []),
                                    ].find((c) => c.id === id);
                                  return (
                                    <Show when={premise()}>
                                      {(p) => (
                                        <div>
                                          <p>
                                            <bdi>{label(p().a)}</bdi> · {relation(p())} ·{' '}
                                            <bdi>{label(p().b)}</bdi> ·{' '}
                                            <a
                                              href={sefariaUrl(p().ref) ?? undefined}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              {p().ref}
                                            </a>
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
                            </details>
                          </Show>
                        </SourceCard>
                      )}
                    </For>
                  </details>
                </Show>
                <Show
                  when={
                    partner.slug &&
                    (data()?.graph?.nodes.some(
                      (n) => n.id === partner.slug && (n.identityResolved || n.hasSourceProfile),
                    ) ||
                      !partner.slug.startsWith('local:'))
                  }
                >
                  <a
                    class="person-partner-link"
                    href={personLink(partner.slug!)}
                    onClick={(e) => {
                      if (props.onPerson && !partner.slug!.startsWith('local:')) {
                        e.preventDefault();
                        props.onPerson(partner.slug!);
                      }
                    }}
                  >
                    {t('rabbi.interactions.openCard')}
                  </a>
                </Show>
              </>
            )}
          />
        </Show>
      </Show>
    </section>
  );
}
