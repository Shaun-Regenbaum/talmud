import { Button } from '@corpus/ui/Button';
import { LangToggle } from '@corpus/ui/LangToggle';
import { PageNavigation } from '@corpus/ui/PageNavigation';
import { Select } from '@corpus/ui/Select';
import { ChoiceCard, FilterChip, Input, SectionHeading, StatusMessage } from '@corpus/ui/Study';
import { t } from './i18n';
/**
 * Alignment workbench (tanach) — the chapter's verse SPINE on the left, every
 * cached producer piece on the right, aligned to the verses it anchors to.
 *
 * The tanach analogue of the talmud reader's Alignment page, and built the same
 * way the inspector was: the data is DERIVED (GET /api/chapter-runs gives the
 * pieces + their instances; each piece's verse anchor is computed from its
 * instance — a range for note, a verse for the per-verse pieces, the whole
 * chapter otherwise), and the build-provenance detail is the SHARED
 * @corpus/ui/RunTreeDag (over GET /api/run-tree). Hover a piece to highlight the
 * verses it sits on; click to open its dependency DAG. Read-only — never
 * triggers generation.
 */

import type { RunTree } from '@corpus/ui/RunTree';
import { RunTreeDag } from '@corpus/ui/RunTreeDag';
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { BOOKS, isBook, SECTIONS } from '../lib/books.ts';
import { anchorLabel, versesOf } from './align.ts';

interface Verse {
  n: number;
  he: string;
  en: string;
}
interface ChapterResp {
  book: string;
  chapter: number;
  verses: Verse[];
}
interface RunRow {
  id: string;
  label: string;
  instance: string | null;
  instanceRaw: string | null;
  expandable: boolean;
  cached: boolean;
  model: string | null;
  coldMs: number | null;
  cost: number | null;
  tokens: number | null;
}
interface ChapterRuns {
  book: string;
  chapter: number;
  runs: RunRow[];
  totals: { count: number; cached: number; cost: number; coldMs: number };
}

const fmtMs = (n: number | null) =>
  n == null ? '' : n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`;
const fmtUsd = (u: number | null) =>
  u == null ? '' : u < 0.01 ? `$${u.toFixed(4)}` : `$${u.toFixed(3)}`;

export function AlignPage(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const initialBook = (() => {
    const b = params.get('book');
    return b && isBook(b) ? b : 'Genesis';
  })();
  const [uiLang, setUiLang] = createSignal<'en' | 'he'>(params.get('lang') === 'he' ? 'he' : 'en');
  const label = (key: Parameters<typeof t>[0]) => t(key, uiLang());
  const [book, setBook] = createSignal(initialBook);
  const [chapter, setChapter] = createSignal(Math.max(1, Number(params.get('chapter')) || 1));
  const [lang, setLang] = createSignal<'he' | 'en' | 'both'>('both');
  const [cat, setCat] = createSignal('all');
  const [hl, setHl] = createSignal<Set<number>>(new Set());
  const [picked, setPicked] = createSignal<RunRow | null>(null);

  // DAG node selection/expansion (the shared component is controlled).
  const [dagSel, setDagSel] = createSignal<string | null>(null);
  const [dagExp, setDagExp] = createSignal<Set<string>>(new Set());
  const toggle = (id: string) =>
    setDagExp((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const syncUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set('lang', uiLang());
    u.searchParams.set('book', book());
    u.searchParams.set('chapter', String(chapter()));
    window.history.replaceState(null, '', u);
  };
  const nav = (nextBook: string, nextChapter: number) => {
    setPicked(null);
    setCat('all');
    setHl(new Set<number>());
    setBook(nextBook);
    setChapter(Number.isFinite(nextChapter) ? Math.max(1, Math.floor(nextChapter)) : 1);
    syncUrl();
  };

  const ref = createMemo(() => ({ b: book(), c: chapter() }));
  const [chap, { refetch: retryChapter }] = createResource(ref, (r) =>
    fetch(`/api/chapter/${encodeURIComponent(r.b)}/${r.c}`)
      .then((res) => (res.ok ? (res.json() as Promise<ChapterResp>) : null))
      .catch(() => null),
  );
  const [runs, { refetch: retryRuns }] = createResource(ref, (r) =>
    fetch(`/api/chapter-runs/${encodeURIComponent(r.b)}/${r.c}`)
      .then((res) => (res.ok ? (res.json() as Promise<ChapterRuns>) : null))
      .catch(() => null),
  );

  const verses = () => chap()?.verses ?? [];
  const total = () => verses().length;
  const rows = () => runs()?.runs ?? [];
  const cachedRows = () => rows().filter((r) => r.cached);

  // Filter chips: All + each producer that has a row, in registry order.
  const cats = createMemo(() => {
    const seen = new Map<string, { id: string; label: string; n: number }>();
    for (const r of rows()) {
      const e = seen.get(r.id) ?? { id: r.id, label: r.label, n: 0 };
      if (r.cached) e.n += 1;
      seen.set(r.id, e);
    }
    return [{ id: 'all', label: label('all'), n: cachedRows().length }, ...seen.values()];
  });
  const shownRows = () => {
    const c = cat();
    return rows().filter((r) => c === 'all' || r.id === c);
  };

  // Open a piece: select it + its DAG root, highlight its verses.
  const open = (r: RunRow) => {
    setPicked(r);
    setDagSel(r.id);
    setDagExp(new Set([r.id]));
    setHl(new Set(versesOf(r, total())));
  };

  const [tree] = createResource(
    () => {
      const p = picked();
      return p ? { ...p, b: book(), c: chapter(), lang: lang() === 'he' ? 'he' : 'en' } : null;
    },
    async (k): Promise<RunTree | null> => {
      const qs = new URLSearchParams({ lang: k.lang });
      if (k.instanceRaw) qs.set('inst', k.instanceRaw);
      const res = await fetch(
        `/api/run-tree/${encodeURIComponent(k.b)}/${k.c}/${encodeURIComponent(k.id)}?${qs}`,
      );
      return res.ok ? ((await res.json()) as RunTree) : null;
    },
  );

  return (
    <main class="align-page" dir={uiLang() === 'he' ? 'rtl' : 'ltr'}>
      <style>{STYLE}</style>
      <header class="align-head">
        <a class="ui-button" href={`/?lang=${uiLang()}`}>
          ‹ {label('title')}
        </a>
        <h1 class="align-title">{label('align')}</h1>
        <Select
          aria-label={label('book')}
          value={book()}
          onChange={(e) => nav(e.currentTarget.value, 1)}
        >
          <For each={SECTIONS}>
            {(section) => (
              <optgroup label={section}>
                <For each={BOOKS.filter((b) => b.section === section)}>
                  {(b) => <option value={b.name}>{b.name}</option>}
                </For>
              </optgroup>
            )}
          </For>
        </Select>
        <PageNavigation
          label={label('navigation')}
          previousLabel={label('previous')}
          nextLabel={label('next')}
          previousDisabled={chapter() <= 1}
          onPrevious={() => nav(book(), chapter() - 1)}
          onNext={() => nav(book(), chapter() + 1)}
        >
          <Input
            class="align-chapter-input"
            aria-label={label('chapter')}
            type="number"
            min={1}
            step={1}
            value={chapter()}
            onChange={(e) => nav(book(), Math.floor(Number(e.currentTarget.value)) || 1)}
          />
        </PageNavigation>
        <LangToggle
          lang={uiLang()}
          onChange={(value) => {
            setUiLang(value);
            syncUrl();
          }}
        />
        <fieldset class="align-langs" aria-label={label('textLanguage')}>
          <For each={['both', 'he', 'en'] as const}>
            {(value) => (
              <FilterChip active={lang() === value} onClick={() => setLang(value)}>
                {label(value === 'both' ? 'both' : value === 'he' ? 'hebrew' : 'english')}
              </FilterChip>
            )}
          </For>
        </fieldset>
        <Show when={chap() && runs()}>
          <span class="align-tally">
            {label('verses')}: <b>{total()}</b> · {label('saved')}: <b>{cachedRows().length}</b>
          </span>
        </Show>
      </header>

      <div class="align-work">
        <div>
          <SectionHeading title={label('verses')} detail={label('locate')} />
          <div class="align-spine">
            <Show when={chap.loading}>
              <StatusMessage tone="loading">{label('loading')}</StatusMessage>
            </Show>
            <Show when={chap() === null && !chap.loading}>
              <StatusMessage
                tone="error"
                onRetry={() => void retryChapter()}
                retryLabel={label('retry')}
              >
                {label('noText')}
              </StatusMessage>
            </Show>
            <For each={verses()}>
              {(v) => (
                <div class="align-verse" classList={{ hot: hl().has(v.n) }} data-verse={v.n}>
                  <span class="align-vn">{v.n}</span>
                  {/* innerHTML: Sefaria verse text carries legitimate markup
                      (nikud spans, emphasis, footnotes). This is the SAME trusted
                      source the reader renders the same way (App.tsx scroll/comm). */}
                  <div class="align-vtext">
                    <Show when={lang() !== 'en'}>
                      <div class="align-vhe" dir="rtl" innerHTML={v.he} />
                    </Show>
                    <Show when={lang() !== 'he'}>
                      <div class="align-ven" innerHTML={v.en} />
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div>
          <div class="align-colh">
            <SectionHeading title={label('items')} />
            <div class="align-cats">
              <For each={cats()}>
                {(cc) => (
                  <FilterChip active={cat() === cc.id} onClick={() => setCat(cc.id)} count={cc.n}>
                    {cc.label}
                  </FilterChip>
                )}
              </For>
            </div>
          </div>

          <Show
            when={picked()}
            fallback={
              <>
                <Show when={runs.loading}>
                  <StatusMessage tone="loading">{label('readingCache')}</StatusMessage>
                </Show>
                <Show when={!runs.loading && runs() === null}>
                  <StatusMessage
                    tone="error"
                    onRetry={() => void retryRuns()}
                    retryLabel={label('retry')}
                  >
                    {label('unavailable')}
                  </StatusMessage>
                </Show>
                <div class="align-list">
                  <For
                    each={shownRows()}
                    fallback={
                      <Show when={!runs.loading && runs() !== null}>
                        <StatusMessage tone="empty">{label('emptyCache')}</StatusMessage>
                      </Show>
                    }
                  >
                    {(r) => (
                      <ChoiceCard
                        title={
                          <>
                            {r.label}
                            {r.instance ? ` · ${r.instance}` : ''}
                          </>
                        }
                        detail={anchorLabel(r, uiLang())}
                        meta={r.cached ? `${fmtMs(r.coldMs)} ${fmtUsd(r.cost)}` : label('notSaved')}
                        onMouseEnter={() => setHl(new Set(versesOf(r, total())))}
                        onFocus={() => setHl(new Set(versesOf(r, total())))}
                        onClick={() => open(r)}
                      />
                    )}
                  </For>
                </div>
              </>
            }
          >
            {(p) => (
              <div class="align-detail">
                <Button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setHl(new Set<number>());
                  }}
                >
                  {label('backItems')}
                </Button>
                <div class="align-dtitle">
                  {p().label}
                  <Show when={p().instance}>{(i) => <span class="align-inst"> · {i()}</span>}</Show>
                  <span class="align-danchor">{anchorLabel(p(), uiLang())}</span>
                </div>
                <RunTreeDag
                  tree={tree.error ? null : (tree() ?? null)}
                  loading={tree.loading}
                  selected={dagSel()}
                  onSelect={setDagSel}
                  expanded={dagExp()}
                  onToggleExpand={toggle}
                  emptyLabel={tree.error ? label('unavailable') : label('emptyPiece')}
                />
              </div>
            )}
          </Show>
        </div>
      </div>
    </main>
  );
}

const STYLE = `
.align-page{max-width:1480px;margin:0 auto;padding:24px 28px 80px;font-family:var(--font-ui);color:var(--fg)}
.align-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.align-back{font-size:14px;color:var(--muted);text-decoration:none}.align-back:hover{color:var(--accent)}
.align-title{margin:0;font-size:26px;font-weight:700;font-family:var(--font-serif,var(--font-ui))}
.align-langs{border:0;padding:0;margin:0;display:flex;gap:4px;flex-wrap:wrap}
.align-chapter-input{width:4.5rem;text-align:center}
.align-list{display:grid;gap:8px}
.align-colh{flex-wrap:wrap}
.align-tally{font-size:.82rem;color:var(--muted)}.align-tally b{color:var(--fg)}
.align-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}
.align-hint{font-size:11px;color:var(--muted)}
.align-work{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,1fr);gap:1.4rem;align-items:start}
.align-colh{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.align-spine{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.5rem .7rem;position:sticky;top:.5rem;max-height:calc(100vh - 130px);overflow:auto}
.align-verse{display:flex;gap:.6rem;padding:.4rem .3rem;border-top:1px solid var(--line);border-radius:4px;transition:background .1s}
.align-verse:first-child{border-top:none}
.align-verse.hot{background:#fde68a55;outline:1.5px solid var(--accent)}
.align-vn{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted);min-width:1.6rem;text-align:right;padding-top:.2rem;flex:none}
.align-vtext{flex:1;min-width:0}
.align-vhe{font-family:var(--font-hebrew,"Frank Ruhl Libre",serif);font-size:1.15rem;line-height:1.85;text-align:justify}
.align-ven{font-size:13px;line-height:1.5;color:var(--muted);margin-top:.2rem}
.align-cats{display:flex;gap:.35rem;flex-wrap:wrap;margin-left:auto}
.align-list{max-height:calc(100vh - 160px);overflow-y:auto;padding-right:.3rem}
.align-inst{font-weight:400;color:var(--muted);font-family:ui-monospace,Menlo,monospace;font-size:11px}
.align-detail{}
.align-dtitle{display:flex;align-items:baseline;gap:.5rem;font-size:1rem;font-weight:600;margin-bottom:.7rem}
.align-danchor{font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap}
.align-note{font-size:12px;color:var(--muted);padding:.4rem 0}
@media(max-width:880px){.align-work{grid-template-columns:1fr}.align-spine{position:static;max-height:40dvh}}
`;
