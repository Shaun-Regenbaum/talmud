import { Button } from '@corpus/ui/Button';
import { FilterChip, StatusMessage } from '@corpus/ui/Study';
import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { type EgoWire, splitDafLabel } from './egoNetwork';
import { t } from './i18n';

export interface ProfileConnection {
  slug: string | null;
  name: string;
  source?: 'sefaria' | 'llm';
  relation?: string;
}
export interface ConnectionProfile {
  primaryTeacher?: string | null;
  primaryStudent?: string | null;
  teachers: ProfileConnection[];
  students: ProfileConnection[];
  family: ProfileConnection[];
  events: string[];
  refs: { sefariaSlug?: string };
}

export const SAGE_CONNECTION_GROUPS = [
  'relationships',
  'transmission',
  'debate',
  'events',
] as const;
type ConnectionGroup = (typeof SAGE_CONNECTION_GROUPS)[number];

// These are argument links, not evidence that the speakers met. Unknown kinds
// remain outside the four views until their meaning has been checked.
export function argumentGroup(kind: string): ConnectionGroup | null {
  if (kind === 'cites') return 'transmission';
  if (['opposes', 'responds-to', 'supports', 'resolves'].includes(kind)) return 'debate';
  return null;
}

function familyLabel(relation: string): string {
  const key = `sages.family.${relation}`;
  const label = t(key);
  return label === key ? relation : label;
}

function passageHref(label: string): string | null {
  const ref = splitDafLabel(label);
  return ref
    ? `?tractate=${encodeURIComponent(ref.tractate)}&page=${encodeURIComponent(ref.page)}#daf`
    : null;
}

export function SageConnections(props: {
  slug: string;
  profile: ConnectionProfile | null | undefined;
  profileLoading?: boolean;
  profileFailed?: boolean;
  nameFor: (slug: string) => string;
  onSelect: (slug: string) => void;
}) {
  const [group, setGroup] = createSignal<ConnectionGroup>('relationships');
  const [network, { refetch }] = createResource(
    () => props.slug,
    async (slug) => {
      try {
        const response = await fetch(`/api/rabbi-network/${encodeURIComponent(slug)}`);
        if (response.status === 404) return { wire: null, failed: false };
        if (!response.ok) return { wire: null, failed: true };
        return { wire: (await response.json()) as EgoWire, failed: false };
      } catch {
        return { wire: null, failed: true };
      }
    },
  );
  createEffect(() => {
    props.slug;
    setGroup('relationships');
  });
  const edges = createMemo(
    () => network()?.wire?.edges.filter((edge) => argumentGroup(edge.kind) === group()) ?? [],
  );
  const roles = createMemo(() => [
    ...(['primaryTeacher', 'primaryStudent'] as const).flatMap((key) => {
      const slug = props.profile?.[key];
      const listed = key === 'primaryTeacher' ? props.profile?.teachers : props.profile?.students;
      return slug && !listed?.some((edge) => edge.slug === slug)
        ? [{ slug, name: props.nameFor(slug), source: undefined, label: t(`sages.rel.${key}`) }]
        : [];
    }),
    ...(props.profile?.teachers ?? []).map((edge) => ({ ...edge, label: t('sages.rel.teachers') })),
    ...(props.profile?.students ?? []).map((edge) => ({ ...edge, label: t('sages.rel.students') })),
    ...(props.profile?.family ?? []).map((edge) => ({
      ...edge,
      label: familyLabel(edge.relation ?? ''),
    })),
  ]);
  return (
    <section class="sage-connections" aria-label={t('sages.connections.title')}>
      <h3>{t('sages.connections.title')}</h3>
      <fieldset class="sages-group-tabs" aria-label={t('sages.connections.title')}>
        <For each={SAGE_CONNECTION_GROUPS}>
          {(key) => (
            <FilterChip active={group() === key} onClick={() => setGroup(key)}>
              {t(`sages.group.${key}`)}
            </FilterChip>
          )}
        </For>
      </fieldset>
      <p class="sages-group-description">{t(`sages.group.${group()}.description`)}</p>
      <Show when={(group() === 'relationships' || group() === 'events') && props.profileLoading}>
        <StatusMessage tone="loading">{t('sages.detail.loadingSage')}</StatusMessage>
      </Show>
      <Show when={(group() === 'relationships' || group() === 'events') && props.profileFailed}>
        <StatusMessage tone="error">{t('sages.connections.profileError')}</StatusMessage>
      </Show>
      <Show when={group() === 'relationships' && !props.profileLoading && !props.profileFailed}>
        <Show
          when={roles().length}
          fallback={<p class="sages-note">{t('sages.connections.noRoles')}</p>}
        >
          <p class="sages-note">{t('sages.connections.profileNote')}</p>
          <div class="sages-connection-list">
            <For each={roles()}>
              {(edge) => (
                <div class="sages-connection-row">
                  <span class="sages-connection-role">{edge.label}</span>
                  <Show when={edge.slug} fallback={<strong>{edge.name}</strong>}>
                    <button
                      type="button"
                      class="sages-person-link"
                      onClick={() => props.onSelect(edge.slug!)}
                    >
                      {props.nameFor(edge.slug!) === edge.slug
                        ? edge.name
                        : props.nameFor(edge.slug!)}
                    </button>
                  </Show>
                  <span class="sages-connection-source">
                    <Show
                      when={edge.source === 'sefaria' && props.profile?.refs.sefariaSlug}
                      fallback={t('sages.connections.profileSource')}
                    >
                      <a
                        href={`https://www.sefaria.org/topics/${encodeURIComponent(props.profile!.refs.sefariaSlug!)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('sages.refs.sefaria')}
                      </a>
                    </Show>
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={group() === 'transmission' || group() === 'debate'}>
        <Show
          when={!network.loading}
          fallback={<StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>}
        >
          <Show
            when={!network()?.failed}
            fallback={
              <StatusMessage
                tone="error"
                onRetry={() => refetch()}
                retryLabel={t('sages.connections.retry')}
              >
                {t('sages.connections.error')}
              </StatusMessage>
            }
          >
            <Show
              when={edges().length}
              fallback={<p class="sages-note">{t('sages.connections.noPassages')}</p>}
            >
              <p class="sages-note">{t('sages.connections.passageNote')}</p>
              <For each={edges()}>
                {(edge) => (
                  <details class="sages-passage-row">
                    <summary>
                      <span class="sages-passage-statement">
                        <strong>
                          {edge.direction === 'out'
                            ? props.nameFor(props.slug)
                            : props.nameFor(edge.other.slug) === edge.other.slug
                              ? edge.other.name
                              : props.nameFor(edge.other.slug)}
                        </strong>{' '}
                        {t(`sages.argument.${edge.kind}`)}{' '}
                        <strong>
                          {edge.direction === 'out'
                            ? props.nameFor(edge.other.slug) === edge.other.slug
                              ? edge.other.name
                              : props.nameFor(edge.other.slug)
                            : props.nameFor(props.slug)}
                        </strong>
                      </span>
                      <span class="sages-passage-count">
                        {t('sages.connections.references', { count: edge.dafs.length })}
                      </span>
                    </summary>
                    <div class="sages-passage-body">
                      <div class="sages-reference-links">
                        <For each={edge.dafs}>
                          {(label) => (
                            <Show when={passageHref(label)} fallback={<span>{label}</span>}>
                              <a href={passageHref(label)!}>{label}</a>
                            </Show>
                          )}
                        </For>
                      </div>
                      <Button onClick={() => props.onSelect(edge.other.slug)}>
                        {t('sages.connections.openProfile', {
                          name:
                            props.nameFor(edge.other.slug) === edge.other.slug
                              ? edge.other.name
                              : props.nameFor(edge.other.slug),
                        })}
                      </Button>
                    </div>
                  </details>
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </Show>
      <Show when={group() === 'events' && !props.profileLoading && !props.profileFailed}>
        <Show
          when={props.profile?.events.length}
          fallback={<p class="sages-note">{t('sages.connections.noEvents')}</p>}
        >
          <p class="sages-note">{t('sages.connections.eventNote')}</p>
          <ul class="sage-events">
            <For each={props.profile?.events}>{(event) => <li>{event}</li>}</For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
