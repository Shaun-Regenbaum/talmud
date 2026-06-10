/**
 * Seed marks — code-defined registry entries that wrap the existing
 * DafViewer toggles (Commentaries, Underline Rabbis, Arguments, etc.).
 * Each entry carries anchor + render metadata so the unified marks panel
 * shows them alongside KV-defined marks, and a (getValue, setValue) pair
 * that wires the toggle to the existing Solid signals in DafViewer.
 *
 * The data side (fetching + rendering) of these marks is still handled by
 * the legacy code paths in DafViewer — this file does not move that. It
 * just exposes them in the unified toggle list so the user has one place
 * to flip everything on/off.
 *
 * Future migration: replace each `getValue/setValue` with a real
 * runLLM-backed extractor + the renderer interface, and delete the legacy
 * code path.
 */

export type SeedAnchor = 'phrase' | 'segment-range' | 'segment' | 'whole-daf';
export type SeedRender =
  | 'inline'
  | 'gutter+sidebar'
  | 'row-tag'
  | 'meta-component'
  | 'visualization'
  | 'side-panel';

export interface SeedMark {
  id: string;
  label: string;
  description: string;
  anchor: SeedAnchor;
  render: SeedRender;
  /** Read the current toggle state (a Solid accessor). */
  getValue: () => boolean;
  /** Set the toggle state (a Solid setter wrapping a signal). */
  setValue: (v: boolean) => void;
}

export interface SeedMarkInputs {
  showGenMarkers: () => boolean;
  setShowGenMarkers: (v: boolean) => void; // dormant — rabbi is ported to the worker registry
  showArguments: () => boolean;
  setShowArguments: (v: boolean) => void;
  showHalachot: () => boolean;
  setShowHalachot: (v: boolean) => void;
  showAggadatot: () => boolean;
  setShowAggadatot: (v: boolean) => void;
  showPesukim: () => boolean;
  setShowPesukim: (v: boolean) => void;
}

/**
 * Build the seed-mark list bound to the DafViewer's signals. Order here
 * dictates display order in the marks panel.
 */
export function buildSeedMarks(_io: SeedMarkInputs): SeedMark[] {
  return [
    // The seeds below have been ported to code-defined registry entries
    // (src/worker/code-marks.ts). They are kept here as fallbacks only —
    // when the worker registry returns a same-id entry the panel hides the
    // seed automatically. The bridge in DafViewer flips these legacy
    // signals when a registry mark of the same id is toggled, so the
    // legacy renderers (gutter icons, sidebars) keep working.
    //   - rabbi     → code-marks.ts (LLM extractor, full port)
    //   - argument  → code-marks.ts (legacy-endpoint proxy)
    //   - halacha   → code-marks.ts (legacy-endpoint proxy)
    //   - aggadata  → code-marks.ts (legacy-endpoint proxy)
    //   - pesukim   → code-marks.ts (legacy-endpoint proxy)
    //   - places    → code-marks.ts (LLM extractor; drives inline .city-marker wraps)
    //   - commentary → code-marks.ts (computed extractor; per-segment digest with click-to-open inspector)
    //
    // TODO(geography-rederive): the 'geography' seed was removed when the
    // GeographyStrip / GeographyMap was uninstalled. Rederive a whole-daf
    // map from the per-rabbi `rabbi.geography` enrichment data (which the
    // sidebar's RabbiPlacesTimeline already consumes), then reintroduce
    // the seed entry with a real data binding.
  ];
}
