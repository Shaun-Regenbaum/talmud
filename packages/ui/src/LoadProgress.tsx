/**
 * @corpus/ui — LoadProgress.
 *
 * One slim reader load bar + status line, shared by every corpus app. It owns
 * the RENDER (spinner + label + percent + a 2px fill track) and the VISIBILITY
 * behaviour (show while work is in flight, linger briefly at 100% so the fill
 * reads as "done", then auto-hide). Each app feeds it normalized signals via a
 * thin adapter — the percent/label computation and the per-app layout glue stay
 * in the app:
 *
 *   - Talmud: a sticky bar pinned in the daf column (`variant="sticky"`), with
 *     an `embedded` mobile-shelf variant.
 *   - Tanach: a centered banner under the topbar (`variant="banner"`).
 *
 * Styling: `.loadprogress*` in loadprogress.css (shared design tokens).
 */

import { createEffect, createSignal, type JSX, onCleanup, Show } from 'solid-js';

/** A top-level alert shown in place of the bar (a budget pause / a wave of
 *  failures) so a stuck generation doesn't read as a silently-frozen bar. */
export interface LoadProgressNotice {
  kind: 'paused' | 'failed';
  text: string;
}

export interface LoadProgressProps {
  /** 0-100 progress. */
  percent: () => number;
  /** Status label shown while the bar is visible. */
  label: () => string;
  /** Raw "work still in flight" state. The bar shows while true and lingers
   *  `lingerMs` after it goes false before hiding. */
  loading: () => boolean;
  /** Optional notice; when present it replaces the bar and persists
   *  independently of the auto-hide. Omit (or return null) for no notice. */
  notice?: () => LoadProgressNotice | null;
  /** Layout: 'sticky' pins it in the content column (default); 'banner'
   *  centers it under a topbar (max-width, not pinned). */
  variant?: 'sticky' | 'banner';
  /** Render flat (static, no bottom margin) for an already-fixed mobile shelf. */
  embedded?: boolean;
  /** ms to linger at 100% after completion before hiding (default 700). */
  lingerMs?: number;
}

export function LoadProgress(props: LoadProgressProps): JSX.Element {
  const variant = () => props.variant ?? 'sticky';
  const notice = () => props.notice?.() ?? null;

  // Show while loading; on completion, linger then hide so the fill animation
  // reads as "done" before the bar slides away.
  const [visible, setVisible] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    if (props.loading()) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
      }
      setVisible(true);
    } else if (visible()) {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), props.lingerMs ?? 700);
    }
  });
  onCleanup(() => {
    if (hideTimer) clearTimeout(hideTimer);
  });

  return (
    <>
      <Show when={notice()}>
        {(n) => (
          <div
            class="loadprogress-notice"
            classList={{
              sticky: variant() === 'sticky',
              banner: variant() === 'banner',
              embedded: !!props.embedded,
              paused: n().kind === 'paused',
              failed: n().kind === 'failed',
            }}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true">{n().kind === 'paused' ? '⏸' : '⚠'}</span>
            <span>{n().text}</span>
          </div>
        )}
      </Show>
      <Show when={visible() && !notice()}>
        <div
          class="loadprogress"
          classList={{
            sticky: variant() === 'sticky',
            banner: variant() === 'banner',
            embedded: !!props.embedded,
          }}
          role="status"
          aria-live="polite"
        >
          <div class="loadprogress-row">
            <span class="loadprogress-spinner" aria-hidden="true" />
            <span class="loadprogress-label">{props.label()}</span>
            <span class="loadprogress-pct" aria-hidden="true">
              {props.percent()}%
            </span>
          </div>
          <div class="loadprogress-track">
            <div class="loadprogress-fill" style={{ width: `${props.percent()}%` }} />
          </div>
        </div>
      </Show>
    </>
  );
}
