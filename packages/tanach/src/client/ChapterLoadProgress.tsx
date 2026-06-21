/**
 * Chapter load bar — one slim sticky bar + a status line describing what's
 * still loading for the open chapter, the tanach analogue of the talmud
 * reader's daf-load bar. Reads the chapterLoad tracker (the chapter's pieces
 * report their state there) and shows a single fraction. Auto-hides shortly
 * after everything settles: on a warm chapter (all KV hits) it barely
 * flickers; on a cold one it tracks the real work (Sefaria + the LLM calls).
 */

import { createEffect, createMemo, createSignal, type JSX, onCleanup, Show } from 'solid-js';
import { chapterLoadEntries } from './chapterLoad.ts';

const COMPLETE_LINGER_MS = 700;

export function ChapterLoadProgress(): JSX.Element {
  const cohort = createMemo(() => {
    const all = chapterLoadEntries();
    const done = all.filter((e) => e.state === 'ok' || e.state === 'error').length;
    const loading = all.find((e) => e.state === 'loading');
    return { total: all.length, done, loadingLabel: loading?.label ?? null };
  });

  const percent = createMemo(() => {
    const c = cohort();
    return c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
  });

  const incomplete = createMemo(() => {
    const c = cohort();
    return c.total > 0 && c.done < c.total;
  });

  const label = createMemo(() => {
    const c = cohort();
    if (c.loadingLabel) return `Loading ${c.loadingLabel.toLowerCase()}…`;
    return 'Up to date';
  });

  // Visibility: show while there's incomplete work; linger briefly at 100% so
  // the fill animation reads as "done" before the bar slides away.
  const [visible, setVisible] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    if (incomplete()) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
      }
      setVisible(true);
    } else if (visible()) {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), COMPLETE_LINGER_MS);
    }
  });
  onCleanup(() => {
    if (hideTimer) clearTimeout(hideTimer);
  });

  return (
    <Show when={visible()}>
      <div class="chapter-load" role="status" aria-live="polite">
        <div class="chapter-load-row">
          <span class="chapter-load-spinner" aria-hidden="true" />
          <span class="chapter-load-label">{label()}</span>
          <span class="chapter-load-pct" aria-hidden="true">
            {percent()}%
          </span>
        </div>
        <div class="chapter-load-track">
          <div class="chapter-load-fill" style={{ width: `${percent()}%` }} />
        </div>
      </div>
    </Show>
  );
}
