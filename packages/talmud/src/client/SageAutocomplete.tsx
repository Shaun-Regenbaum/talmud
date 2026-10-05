import { Input, StatusMessage } from '@corpus/ui/Study';
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { lang, t } from './i18n';
import { type IndexRow, isHebrewQuery, normalize, scoreRow } from './sageSearch';

export function SageAutocomplete(props: {
  rows: IndexRow[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onSelect: (slug: string) => void;
}) {
  const id = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1);
  const matches = createMemo(() => {
    const q = query().trim();
    const rows = props.rows;
    if (!q)
      return ['abaye', 'rava', 'hillel', 'rabbi-akiva'].flatMap((slug) =>
        rows.filter((r) => r.slug === slug),
      );
    const hebrew = isHebrewQuery(q);
    const scored = rows
      .map((row) => ({ row, score: scoreRow(hebrew ? '' : normalize(q), hebrew ? q : null, row) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.row.canonical.localeCompare(b.row.canonical));
    const direct = scored.filter((r) => r.score > 80);
    return (direct.length ? direct : scored).slice(0, 10).map((r) => r.row);
  });
  createEffect(() => {
    const index = active();
    if (open() && index >= 0)
      document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: 'nearest' });
  });
  const select = (row: IndexRow) => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    props.onSelect(row.slug);
  };
  const name = (row: IndexRow) =>
    lang() === 'he' && row.canonicalHe ? row.canonicalHe : row.canonical;
  return (
    <div
      class="sage-search"
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label for={`${id}-input`}>{t('sages.search.label')}</label>
      <Input
        id={`${id}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open()}
        aria-controls={open() ? `${id}-results` : undefined}
        aria-activedescendant={
          open() && active() >= 0 && matches()[active()] ? `${id}-${active()}` : undefined
        }
        autocomplete="off"
        placeholder={t('sages.search.short')}
        value={query()}
        onFocus={() => setOpen(true)}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.isComposing) return;
          if (event.key === 'Escape') {
            setOpen(false);
            setActive(-1);
            event.preventDefault();
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            const count = matches().length;
            if (count)
              setActive((current) =>
                event.key === 'ArrowDown'
                  ? (current + 1) % count
                  : current <= 0
                    ? count - 1
                    : current - 1,
              );
          }
          if (event.key === 'Enter' && open() && matches().length) {
            event.preventDefault();
            select(matches()[Math.max(0, active())]);
          }
        }}
      />
      <Show when={open()}>
        <div class="sage-search-popup">
          <Show when={props.loading}>
            <StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>
          </Show>
          <Show when={props.failed}>
            <StatusMessage
              tone="error"
              onRetry={props.onRetry}
              retryLabel={t('sages.connections.retry')}
            >
              {t('sages.directory.error')}
            </StatusMessage>
          </Show>
          <Show when={!props.loading && !props.failed && matches().length === 0}>
            <StatusMessage tone="empty">{t('sages.list.noMatches')}</StatusMessage>
          </Show>
          <div id={`${id}-results`} role="listbox" aria-label={t('sages.search.label')}>
            <For each={matches()}>
              {(row, i) => (
                <button
                  type="button"
                  role="option"
                  id={`${id}-${i()}`}
                  aria-selected={active() === i()}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(row)}
                >
                  <strong>{name(row)}</strong>
                  <span class="sage-search-secondary" dir="auto">
                    {lang() === 'he' ? row.canonical : row.canonicalHe}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
