/**
 * LinkRef — one cross-text reference, rendered the same way everywhere.
 *
 * Every surface that points at another text (overview cross-references, the
 * Yerushalmi card header, the halacha derivation, …) used to draw its own chip.
 * This is the shared atom: the target's label, a small corpus badge when the
 * label alone doesn't say which corpus it is, clickable into our reader when the
 * target is a Bavli daf and inert otherwise. Corpus + navigation come from the
 * one `linkTarget` resolver, so every chip agrees.
 *
 * It is just the chip — views own their own layout (a list, a card header, a
 * map) and drop this in.
 */

import type { AnchorCoord } from '@corpus/core/context/coord';
import { type JSX, Show } from 'solid-js';
import { type LinkCorpus, linkTarget } from '../lib/context/linkTarget';
import { t } from './i18n';

/** Corpus badge — only for corpora the label alone doesn't make obvious. A Bavli
 *  daf ("Berakhot 13a") and a Tanakh verse ("Genesis 1:1") read for themselves,
 *  so they get none; the Yerushalmi + commentary spines get a tag. */
const CORPUS_BADGE: Partial<Record<LinkCorpus, { label: string; bg: string; fg: string }>> = {
  yerushalmi: { label: 'ירושלמי', bg: '#0e7490', fg: '#ffffff' },
  commentary: { label: 'commentary', bg: '#ece9e1', fg: '#57534e' },
  // A codifier ref (Rambam / Shulchan Arukh / …) — the rich view is the halacha
  // card; the chip just marks the codification. (A pasuk reads for itself, like
  // a Bavli daf, so 'tanach' gets no badge.)
  halacha: { label: 'הלכה', bg: '#7c2d12', fg: '#ffffff' },
};

const BASE: JSX.CSSProperties = {
  display: 'inline-flex',
  'align-items': 'center',
  gap: '0.28rem',
  'font-size': '0.72rem',
  'text-decoration': 'none',
  'border-radius': '5px',
  padding: '0.12rem 0.4rem',
  'white-space': 'nowrap',
};
const NAV: JSX.CSSProperties = {
  ...BASE,
  color: '#1d4ed8',
  background: '#eff6ff',
  border: '1px solid #dbeafe',
};
const INERT: JSX.CSSProperties = {
  ...BASE,
  color: '#6b7280',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
};

/** The corpus tag shown beside a cross-text reference — only for corpora whose
 *  label isn't self-evident (Yerushalmi, commentary). Shared so the overview
 *  chip, the halacha sources, and any other ref list badge the same way. */
export function CorpusBadge(props: { corpus: LinkCorpus }): JSX.Element {
  const b = (): { label: string; bg: string; fg: string } | undefined => CORPUS_BADGE[props.corpus];
  return (
    <Show when={b()}>
      {(badge) => (
        <span
          style={{
            'font-size': '0.6rem',
            'font-weight': 650,
            'border-radius': '999px',
            padding: '0 0.32rem',
            background: badge().bg,
            color: badge().fg,
          }}
        >
          {badge().label}
        </span>
      )}
    </Show>
  );
}

export function LinkRef(props: { coord: AnchorCoord }): JSX.Element {
  const target = () => linkTarget(props.coord);
  return (
    <Show
      when={target().navigable && target().href}
      fallback={
        // Inert: no in-app reader for this corpus (Yerushalmi, a verse, …).
        <span style={INERT} title={target().label}>
          {target().label}
          <CorpusBadge corpus={target().corpus} />
        </span>
      }
    >
      {(href) => (
        // A real href: relative `?tractate=&page=` for our reader (middle-click /
        // open-in-new-tab work), or an absolute cross-app URL (a pasuk → the
        // Tanach reader), which opens in a new tab.
        <a
          style={NAV}
          href={href()}
          {...(target().external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          title={
            target().external ? target().label : t('overview.goToDaf', { daf: target().label })
          }
        >
          {target().label}
          <CorpusBadge corpus={target().corpus} />
        </a>
      )}
    </Show>
  );
}
