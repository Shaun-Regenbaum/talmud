import { t } from './i18n';
import {
  resetTextZoom,
  TEXT_ZOOM_DEFAULT,
  TEXT_ZOOM_MAX,
  TEXT_ZOOM_MIN,
  textZoom,
  textZoomPercent,
  zoomIn,
  zoomOut,
} from './textZoom';

/** Desktop text-size control: smaller, current size (click to reset), larger, and reset. */
export function TextZoomControl() {
  const atMin = () => textZoom() <= TEXT_ZOOM_MIN;
  const atMax = () => textZoom() >= TEXT_ZOOM_MAX;
  const atDefault = () => textZoom() === TEXT_ZOOM_DEFAULT;
  const percent = () => textZoomPercent(textZoom());

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings UA margin/min-inline-size that changes the segmented layout; div+role="group" carries the same semantics
    <div class="text-zoom" role="group" aria-label={t('header.textSize')} data-testid="text-zoom">
      <span class="text-zoom-label">{t('header.textSize')}</span>
      <button
        type="button"
        aria-label={t('header.textSize.smaller')}
        title={t('header.textSize.smaller.title')}
        aria-keyshortcuts="-"
        disabled={atMin()}
        onClick={() => zoomOut()}
      >
        <span class="text-zoom-a text-zoom-a-small" aria-hidden="true">
          A
        </span>
        −
      </button>
      <button
        type="button"
        class="text-zoom-level"
        aria-label={t('header.textSize.level', { percent: percent() })}
        title={t('header.textSize.reset.title')}
        aria-keyshortcuts="0"
        onClick={() => resetTextZoom()}
      >
        {percent()}%
      </button>
      <button
        type="button"
        aria-label={t('header.textSize.larger')}
        title={t('header.textSize.larger.title')}
        aria-keyshortcuts="+"
        disabled={atMax()}
        onClick={() => zoomIn()}
      >
        <span class="text-zoom-a text-zoom-a-large" aria-hidden="true">
          A
        </span>
        +
      </button>
      <button
        type="button"
        class="text-zoom-reset"
        aria-label={t('header.textSize.reset')}
        title={t('header.textSize.reset.title')}
        disabled={atDefault()}
        onClick={() => resetTextZoom()}
      >
        {t('header.textSize.reset.short')}
      </button>
    </div>
  );
}
