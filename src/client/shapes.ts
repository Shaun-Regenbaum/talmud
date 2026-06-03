/**
 * Runtime data shapes consumed by the daf-viewer renderers (ArgumentSidebar,
 * GutterIcons, anchor markers, etc.). These were originally defined inside
 * the legacy per-feature panel files (`AnalysisPanel`, `HalachaPanel`,
 * `AggadataDetector`); the panels are gone but their data shapes live on —
 * the registry adapters in `DafViewer.tsx` reshape `markRunsByMarkId()`
 * output into these for the existing renderers to consume.
 */

// ===========================================================================
// Argument structure (mark id: 'argument')
// ===========================================================================

export interface Rabbi {
  name: string;
  nameHe: string;
  period: string;
  location: string;
  role: string;
  opinionStart?: string;
}

export interface Section {
  title: string;
  summary: string;
  excerpt?: string;
  rabbis: Rabbi[];
  startSegIdx?: number;
  endSegIdx?: number;
}

export interface DafAnalysis {
  summary: string;
  sections: Section[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

// ===========================================================================
// Halacha topics (mark id: 'halacha')
// ===========================================================================

export interface Ruling {
  ref: string;
  summary: string;
}

export interface HalachaTopic {
  topic: string;
  topicHe?: string;
  excerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  rulings: {
    mishnehTorah?: Ruling;
    shulchanAruch?: Ruling;
    rema?: Ruling;
  };
}

export interface HalachaResult {
  topics: HalachaTopic[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

// ===========================================================================
// Charts (mark id: 'chart') — EXPERIMENTAL. Comparison tables for dense,
// multi-opinion regions; cells are Hebrew (like the dafyomi.co.il source
// charts). The first cell of each row is its row-label.
// ===========================================================================

export interface ChartTable {
  caption?: string;
  captionHe?: string;
  headers: string[];
  rows: string[][];
  notes?: { marker: string; text: string }[];
  excerpt?: string;
  grounded?: boolean;
  confidence?: string;
  startSegIdx?: number;
  endSegIdx?: number;
}

export interface ChartResult {
  charts: ChartTable[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

// ===========================================================================
// Aggadata stories (mark id: 'aggadata')
// ===========================================================================

export interface AggadataStory {
  title: string;
  titleHe?: string;
  summary: string;
  excerpt: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  /** Word offsets within startSegIdx / endSegIdx for sub-segment-precise
   *  highlighting. Set by the worker's postProcessAggadata when it locates
   *  the verbatim excerpt + endExcerpt in the gemara. Absent → highlight
   *  falls back to anchor-marker behaviour. */
  tokenStart?: number;
  tokenEnd?: number;
  theme?: string;
}

export interface AggadataResult {
  stories: AggadataStory[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

// ===========================================================================
// Yerushalmi parallels (mark id: 'yerushalmi')
// ===========================================================================

export interface YerushalmiParallel {
  /** Canonical Sefaria ref of the parallel, e.g. "Jerusalem Talmud Berakhot 1:1". */
  yerushalmiRef: string;
  /** Hebrew form of the ref. */
  yerushalmiRefHe?: string;
  /** One sentence: what the two Talmuds both discuss here. */
  summary: string;
  /** The substantive Bavli↔Yerushalmi differences — the card's whole point. */
  differences: string;
  /** Verbatim Hebrew opening phrase on the Bavli daf (the anchor). */
  excerpt: string;
  startSegIdx?: number;
  endSegIdx?: number;
}

export interface YerushalmiResult {
  parallels: YerushalmiParallel[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

// ===========================================================================
// Pesukim citations (mark id: 'pesukim')
// ===========================================================================

export interface PasukSynthesize {
  explanation: string;
  groundedIn?: string[];
}

export interface Pasuk {
  verseRef: string;
  verseHe?: string;
  citationMarker?: string;
  citationStyle?: 'explicit' | 'allusion' | 'paraphrase';
  excerpt: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  /** Word offsets within startSegIdx / endSegIdx for sub-segment-precise
   *  highlighting. Set by the worker's postProcessPesukim when it locates
   *  the verbatim excerpt in the gemara. Absent → highlight falls back to
   *  whole-segment behaviour. */
  tokenStart?: number;
  tokenEnd?: number;
  summary: string;
  synthesize?: PasukSynthesize;
}

export interface PesukimResult {
  pesukim: Pasuk[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}
