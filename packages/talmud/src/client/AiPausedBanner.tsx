/**
 * Talmud's AI-paused banner: the shared <AiStatusBanner/> wired with a
 * self-funding / sponsorship ask grounded in the LIVE "cost to finish Shas"
 * figure (GET /api/shas-cost — the same estimateShasCost the usage page shows),
 * so the number is the real one, never a hand-typed guess. The estimate is
 * fetched lazily the first time the banner is about to appear, so an ordinary
 * reader load never pays for it.
 */

import { AiStatusBanner } from '@corpus/ui/AiStatusBanner';
import { aiStatus } from '@corpus/ui/aiStatus';
import { createEffect, createSignal, type JSX } from 'solid-js';

const CONTACT_HREF = 'mailto:shaunregenbaum@gmail.com?subject=Sponsoring%20the%20Talmud%20project';

export function AiPausedBanner(): JSX.Element {
  const [remainingUsd, setRemainingUsd] = createSignal<number | null>(null);
  let fetched = false;
  createEffect(() => {
    if (!aiStatus() || fetched) return;
    fetched = true;
    fetch('/api/shas-cost')
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        const d = raw as { available?: boolean; remainingUsd?: number } | null;
        if (d?.available && typeof d.remainingUsd === 'number' && d.remainingUsd > 0) {
          setRemainingUsd(d.remainingUsd);
        }
      })
      .catch(() => {});
  });

  return (
    <AiStatusBanner
      sponsor={() => {
        const rem = remainingUsd();
        const figure =
          rem != null
            ? ` Bringing the whole Talmud online at full depth takes an estimated ~$${(
                Math.round(rem / 100) * 100
              ).toLocaleString('en-US')} more in AI.`
            : '';
        return {
          message: `This is a self-funded project (about $300/week of AI).${figure} If you'd like to help finish Shas, get in touch.`,
          ctaLabel: 'Sponsor / get in touch',
          ctaHref: CONTACT_HREF,
        };
      }}
    />
  );
}
