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
    u.searchParams.set('book', book());
    u.searchParams.set('chapter', String(chapter()));
    window.history.replaceState(null, '', u);
  };
  const nav = (nextBook: string, nextChapter: number) => {
    setPicked(null);
    setHl(new Set<number>());
    setBook(nextBook);
    setChapter(Math.max(1, nextChapter));
    syncUrl();
  };

  const ref = createMemo(() => ({ b: book(), c: chapter() }));
  const [chap] = createResource(ref, (r) =>
    fetch(`/api/chapter/${encodeURIComponent(r.b)}/${r.c}`)
      .then((res) => (res.ok ? (res.json() as Promise<ChapterResp>) : null))
      .catch(() => null),
  );
  const [runs] = createResource(ref, (r) =>
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
    return [{ id: 'all', label: 'All', n: cachedRows().length }, ...seen.values()];
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
    <main class="align-page">
      <style>{STYLE}</style>
      <header class="align-head">
        <a class="align-back" href="/">
          ‹ Tanach
        </a>
        <h1 class="align-title">Alignment</h1>
        <select class="align-select" value={book()} onChange={(e) => nav(e.currentTarget.value, 1)}>
          <For each={SECTIONS}>
            {(section) => (
              <optgroup label={section}>
                <For each={BOOKS.filter((b) => b.section === section)}>
                  {(b) => <option value={b.name}>{b.name}</option>}
                </For>
              </optgroup>
            )}
          </For>
        </select>
        <div class="align-nav">
          <button
            type="button"
            class="align-navbtn"
            onClick={() => nav(book(), chapter() - 1)}
            disabled={chapter() <= 1}
          >
            ‹
          </button>
          <input
            class="align-chap"
            value={chapter()}
            onChange={(e) => nav(book(), Number(e.currentTarget.value.trim()) || 1)}
          />
          <button type="button" class="align-navbtn" onClick={() => nav(book(), chapter() + 1)}>
            ›
          </button>
        </div>
        <div class="align-langs">
          <For each={['both', 'he', 'en'] as const}>
            {(l) => (
              <button
                type="button"
                class="align-lang"
                classList={{ on: lang() === l }}
                onClick={() => setLang(l)}
              >
                {l === 'both' ? 'עב/EN' : l === 'he' ? 'עב' : 'EN'}
              </button>
            )}
          </For>
        </div>
        <Show when={chap() && runs()}>
          <span class="align-tally">
            <b>{total()}</b> verses · <b>{cachedRows().length}</b> pieces cached
          </span>
        </Show>
      </header>

      <div class="align-work">
        <div>
          <div class="align-colh">
            <span class="align-label">Spine · verses</span>
            <span class="align-hint">hover a piece to locate it</span>
          </div>
          <div class="align-spine">
            <Show when={chap.loading}>
              <p class="align-note">Loading…</p>
            </Show>
            <Show when={chap() === null && !chap.loading}>
              <p class="align-note">
                No text for {book()} {chapter()}.
              </p>
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
            <span class="align-label">Pieces</span>
            <div class="align-cats">
              <For each={cats()}>
                {(cc) => (
                  <button
                    type="button"
                    class="align-chip"
                    classList={{ on: cat() === cc.id }}
                    onClick={() => setCat(cc.id)}
                  >
                    {cc.label} <span class="align-chipn">{cc.n}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <Show
            when={picked()}
            fallback={
              <>
                <Show when={runs.loading}>
                  <p class="align-note">Reading the cache…</p>
                </Show>
                <div class="align-list">
                  <For
                    each={shownRows()}
                    fallback={<p class="align-note">Nothing cached for this chapter yet.</p>}
                  >
                    {(r) => (
                      <button
                        type="button"
                        class="align-row"
                        classList={{ miss: !r.cached }}
                        onMouseEnter={() => setHl(new Set(versesOf(r, total())))}
                        onClick={() => open(r)}
                      >
                        <span class="align-rlabel">
                          {r.label}
                          <Show when={r.instance}>
                            {(i) => <span class="align-inst"> · {i()}</span>}
                          </Show>
                        </span>
                        <span class="align-ranchor">{anchorLabel(r)}</span>
                        <span class="align-rmeta">
                          <Show when={r.cached} fallback={<span class="align-miss">miss</span>}>
                            <Show when={r.coldMs}>{(ms) => <span>{fmtMs(ms())}</span>}</Show>
                            <Show when={r.cost != null}>
                              <span class="align-cost">{fmtUsd(r.cost)}</span>
                            </Show>
                          </Show>
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </>
            }
          >
            {(p) => (
              <div class="align-detail">
                <button
                  type="button"
                  class="align-back-btn"
                  onClick={() => {
                    setPicked(null);
                    setHl(new Set<number>());
                  }}
                >
                  ← back to pieces
                </button>
                <div class="align-dtitle">
                  {p().label}
                  <Show when={p().instance}>{(i) => <span class="align-inst"> · {i()}</span>}</Show>
                  <span class="align-danchor">{anchorLabel(p())}</span>
                </div>
                <RunTreeDag
                  tree={tree() ?? null}
                  loading={tree.loading}
                  selected={dagSel()}
                  onSelect={setDagSel}
                  expanded={dagExp()}
                  onToggleExpand={toggle}
                  emptyLabel="Nothing cached for this piece yet."
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
.align-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.align-back{font-size:14px;color:var(--muted);text-decoration:none}.align-back:hover{color:var(--accent)}
.align-title{margin:0;font-size:26px;font-weight:700;font-family:var(--font-serif,var(--font-ui))}
.align-select{font:inherit;font-size:13px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg)}
.align-nav{display:inline-flex;align-items:center;gap:4px}
.align-navbtn{font:inherit;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;width:26px;height:26px;cursor:pointer}
.align-navbtn:disabled{opacity:.4;cursor:default}
.align-chap{width:3rem;text-align:center;font:inherit;font-size:13px;padding:3px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg)}
.align-langs{display:inline-flex;gap:4px}
.align-lang{font:inherit;font-size:12px;padding:3px 8px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted);cursor:pointer}
.align-lang.on{background:var(--accent);border-color:var(--accent);color:#fff}
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
.align-chip{font:inherit;font-size:11px;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:.12rem .55rem;cursor:pointer;display:inline-flex;gap:.25rem;align-items:center}
.align-chip:hover{background:var(--surface-sunk)}.align-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.align-chipn{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;opacity:.7}
.align-list{max-height:calc(100vh - 160px);overflow-y:auto;padding-right:.3rem}
.align-row{display:flex;gap:.5rem;align-items:baseline;width:100%;text-align:left;font:inherit;background:none;border:none;border-top:1px solid var(--line);padding:.45rem .35rem;cursor:pointer;border-radius:4px;color:inherit}
.align-row:first-child{border-top:none}
.align-row:hover{background:var(--surface-sunk)}
.align-row.miss{opacity:.5}
.align-rlabel{font-weight:600;color:var(--fg);font-size:13px}
.align-inst{font-weight:400;color:var(--muted);font-family:ui-monospace,Menlo,monospace;font-size:11px}
.align-ranchor{font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap}
.align-rmeta{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--muted);display:inline-flex;gap:.5rem;white-space:nowrap;min-width:3rem;justify-content:flex-end}
.align-cost{color:var(--accent)}
.align-miss{color:#b45309}
.align-detail{}
.align-back-btn{background:transparent;border:none;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;padding:.1rem 0;margin-bottom:.6rem}
.align-back-btn:hover{color:var(--accent)}
.align-dtitle{display:flex;align-items:baseline;gap:.5rem;font-size:1rem;font-weight:600;margin-bottom:.7rem}
.align-danchor{font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap}
.align-note{font-size:12px;color:var(--muted);padding:.4rem 0}
@media(max-width:880px){.align-work{grid-template-columns:1fr}.align-spine{position:static;max-height:none}}
`;
