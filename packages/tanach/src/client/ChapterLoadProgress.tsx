/**
 * Chapter load bar — the tanach adapter over the shared @corpus/ui LoadProgress
 * bar (the analogue of the talmud reader's daf-load bar). Reads the chapterLoad
 * tracker (each of the chapter's pieces reports its state there), maps it to a
 * single fraction + label, and renders the shared bar as a centered banner. The
 * render + auto-show/hide behaviour live in the shared component.
 */

import { LoadProgress } from '@corpus/ui/LoadProgress';
import { createMemo, type JSX } from 'solid-js';
import { chapterLoadEntries } from './chapterLoad.ts';

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

  const loading = createMemo(() => {
    const c = cohort();
    return c.total > 0 && c.done < c.total;
  });

  const label = createMemo(() => {
    const c = cohort();
    if (c.loadingLabel) return `Loading ${c.loadingLabel.toLowerCase()}…`;
    return 'Up to date';
  });

  return <LoadProgress percent={percent} label={label} loading={loading} variant="banner" />;
}
