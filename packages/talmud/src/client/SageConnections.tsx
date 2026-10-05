import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, For, Show } from 'solid-js';
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

export function SageConnections(props: {
  slug: string;
  profile: ConnectionProfile | null | undefined;
  profileLoading?: boolean;
  profileFailed?: boolean;
  nameFor: (slug: string) => string;
  onSelect: (slug: string) => void;
}) {
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
      <Show when={props.profileLoading}>
        <StatusMessage tone="loading">{t('sages.detail.loadingSage')}</StatusMessage>
      </Show>
      <Show when={props.profileFailed}>
        <StatusMessage tone="error">{t('sages.connections.profileError')}</StatusMessage>
      </Show>
      <Show when={!props.profileLoading && !props.profileFailed}>
        <Show
          when={roles().length}
          fallback={<p class="sages-note">{t('sages.connections.noRoles')}</p>}
        >
          <p class="sages-note">{t('sages.connections.profileNote')}</p>
          <dl class="sage-relationship-groups">
            <For each={[...new Set(roles().map((edge) => edge.label))]}>
              {(label) => (
                <div class="sage-role-group">
                  <dt>{label}</dt>
                  <dd class="sages-name-links">
                    <For each={roles().filter((edge) => edge.label === label)}>
                      {(edge) => (
                        <Show when={edge.slug} fallback={<span>{edge.name}</span>}>
                          <a
                            class="sages-person-link"
                            href={`#sages/${encodeURIComponent(edge.slug!)}`}
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                                return;
                              event.preventDefault();
                              props.onSelect(edge.slug!);
                            }}
                          >
                            {props.nameFor(edge.slug!) === edge.slug
                              ? edge.name
                              : props.nameFor(edge.slug!)}
                          </a>
                        </Show>
                      )}
                    </For>
                  </dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
      </Show>
      <Show when={!props.profileLoading && !props.profileFailed}>
        <Show when={props.profile?.events.length}>
          <p class="sages-note">{t('sages.connections.eventNote')}</p>
          <ul class="sage-events">
            <For each={props.profile?.events}>{(event) => <li>{event}</li>}</For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
