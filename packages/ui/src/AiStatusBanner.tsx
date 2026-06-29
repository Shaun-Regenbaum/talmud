/**
 * @corpus/ui — AiStatusBanner.
 *
 * A full-width strip that appears when AI features are paused, reading the
 * shared `aiStatus` signal. Corpus-agnostic: the headline copy is keyed by the
 * reason, and the optional sponsor block (the funding ask + a call-to-action) is
 * supplied by each app via the `sponsor` render function, so the talmud app can
 * pass its live "cost to finish Shas" figure while tanach passes its own.
 *
 * The framing is deliberately about COST CONTROL, not failure: spend pauses
 * (credits / daily cap / hourly cap) explain that AI is capped to keep the
 * project sustainable; only genuine provider blips read as "temporarily
 * unavailable". Styling: `.ui-banner` in components.css.
 */

import { createMemo, type JSX, Show } from 'solid-js';
import { type AiUnavailableReason, aiStatus, dismissAiStatus } from './aiStatus.ts';

export interface SponsorInfo {
  /** Prose explaining the funding situation / the ask. */
  message: string;
  /** Call-to-action label (e.g. "Sponsor / get in touch"). */
  ctaLabel?: string;
  /** mailto: or https: target for the CTA. */
  ctaHref?: string;
}

export interface AiStatusBannerProps {
  /** Per-reason sponsor block. Return undefined to omit it for a given reason
   *  (e.g. transient provider blips, where a funding ask makes no sense). */
  sponsor?: (reason: AiUnavailableReason) => SponsorInfo | undefined;
}

/** Reasons where a spending-related sponsor ask is appropriate. */
const SPEND_REASONS: ReadonlySet<AiUnavailableReason> = new Set([
  'credits',
  'daily-cap',
  'hourly-cap',
]);

function headline(reason: AiUnavailableReason): string {
  switch (reason) {
    case 'credits':
      return 'AI features are paused — the project is out of AI credits right now.';
    case 'daily-cap':
      return "AI features are paused for today — there's a daily spending cap that keeps this project sustainable.";
    case 'hourly-cap':
      return "AI features are paused briefly — there's an hourly spending limit to keep costs in check.";
    case 'rate-limit':
      return 'AI features are busy right now — please try again in a moment.';
    case 'provider':
      return 'AI features are temporarily unavailable — please try again shortly.';
  }
}

/** A short "when will it be back" hint, derived from the reason alone (the
 *  budget caps roll over predictably — daily by UTC day, hourly by the hour). */
function resumeHint(reason: AiUnavailableReason): string | null {
  if (reason === 'daily-cap') return "They'll be back tomorrow.";
  if (reason === 'hourly-cap') return 'Back within the hour.';
  return null;
}

export function AiStatusBanner(props: AiStatusBannerProps): JSX.Element {
  const st = aiStatus;
  const sponsor = createMemo(() => {
    const s = st();
    if (!s || !props.sponsor) return undefined;
    if (!SPEND_REASONS.has(s.reason)) return undefined;
    return props.sponsor(s.reason);
  });
  const hint = createMemo(() => {
    const s = st();
    return s ? resumeHint(s.reason) : null;
  });

  return (
    <Show when={st()}>
      {(s) => (
        <div class="ui-banner" role="status" aria-live="polite">
          <div class="ui-banner-inner">
            <div class="ui-banner-text">
              <p class="ui-banner-line">
                <span class="ui-banner-dot" aria-hidden="true" />
                {headline(s().reason)}
                <Show when={hint()}>
                  {' '}
                  <span class="ui-banner-hint">{hint()}</span>
                </Show>
              </p>
              <Show when={sponsor()}>
                {(sp) => (
                  <p class="ui-banner-sponsor">
                    {sp().message}
                    <Show when={sp().ctaHref && sp().ctaLabel}>
                      {' '}
                      <a class="ui-banner-cta" href={sp().ctaHref}>
                        {sp().ctaLabel}
                      </a>
                    </Show>
                  </p>
                )}
              </Show>
            </div>
            <button
              type="button"
              class="ui-banner-close"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={() => dismissAiStatus()}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
