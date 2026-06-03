/**
 * @fileoverview Normalized structured shape for dafyomi.co.il (Kollel Iyun
 * HaDaf) per-daf study content.
 *
 * One `DafyomiDaf` is the committed-JSON unit (one file per daf, both amudim,
 * every content type that exists for that daf). Per-content-type bodies are a
 * discriminated union on `DafyomiBody.type`. The parsers
 * (`./parse/*.ts`) turn raw HTML into these; the worker route and the
 * alignment-page UI consume them. This is the single contract between the
 * ingestion half (Half A) and the workbench half (Half B).
 *
 * Standing rule baked into the shape: missing pages are recorded in `absent`,
 * never fabricated; a parser that finds a page but no entries leaves the body
 * empty and pushes a `parseWarnings` note.
 */

import type { DafyomiContentType } from './masechtos.ts';

export type { DafyomiContentType };

/** A source citation lifted from inline parens / bold (e.g. "(RASHI 76a DH
 *  Tzomes)"). Best-effort structuring; `raw` is always the verbatim text. */
export interface DafyomiRef {
  raw: string;
  kind?: 'gemara' | 'mishnah' | 'rashi' | 'tosfos' | 'pasuk' | 'rambam' | 'shulchanAruch' | 'rishon' | 'acharon' | 'yerushalmi' | 'other';
  /** Resolved app tractate value when a cross-reference is recognizable. */
  tractate?: string;
  /** Resolved daf-amud (e.g. "76a") when present. */
  page?: string;
  /** Trailing siman/seif/perek/halacha detail left unparsed. */
  detail?: string;
}

/** Bilingual text. dafyomi.co.il content is English study notes with embedded
 *  Hebrew lemmas/citations, so `en` is usually the prose and `he` carries any
 *  embedded Hebrew. Hebrew-only content types populate `he`. */
export interface DafyomiText {
  he?: string;
  en?: string;
}

/** A hierarchical entry mirroring the source's 1. / (a) / i. nesting. */
export interface DafyomiEntry {
  /** Verbatim list marker, e.g. "1)", "(a)", "i.", or "" when label-only. */
  marker?: string;
  /** 0 = top numbered, 1 = lettered, 2 = roman/numeric sub-sub. */
  level: number;
  /** Inline label before the body, e.g. "QUESTION:", "ANSWERS:", "HALACHAH:". */
  label?: string;
  /** Entry heading (for `subject`-style headings). */
  title?: DafyomiText;
  /** Entry prose. */
  body: DafyomiText;
  /** Inline citations found in this entry. */
  refs?: DafyomiRef[];
  children?: DafyomiEntry[];
}

/** Tosfos piece — carries the DH ("Dibur ha'Maschil") opening words so a later
 *  matcher can align it to Sefaria's tosafot `pieceKeys`. */
export interface DafyomiTosfosPiece {
  /** Hebrew opening words after "TOSFOS DH ". */
  dhHe: string;
  /** niqqud/punctuation-stripped form of `dhHe`, for fuzzy matching. */
  dhNormalized: string;
  /** Transliterated DH as printed (e.g. "ELA"), when present. */
  dhTranslit?: string;
  body: DafyomiText;
  refs?: DafyomiRef[];
}

/** Points entry — carries the argument-flow speaker tag, e.g.
 *  "(Gemara - Rav Yehudah)" / "(Question - Ula)". */
export interface DafyomiPointsEntry extends DafyomiEntry {
  speaker?: { roleEn?: string; rabbiEn?: string; raw: string };
}

/** A simple table (charts). Cells are plain strings; header row separate. */
export interface DafyomiTable {
  caption?: DafyomiText;
  headers: DafyomiText[];
  rows: DafyomiText[][];
  /** Footnotes keyed by their printed marker ("[1]", "1") -> text. */
  notes?: { marker: string; text: DafyomiText }[];
}

export type DafyomiBody =
  | { type: 'insights';   entries: DafyomiEntry[] }
  | { type: 'background'; girsa: DafyomiEntry[]; glossary: DafyomiEntry[] }
  | { type: 'halacha';    question?: DafyomiText; gemara: DafyomiEntry[]; rishonim: DafyomiEntry[]; poskim: DafyomiEntry[] }
  | { type: 'tosfos';     pieces: DafyomiTosfosPiece[] }
  | { type: 'review';     entries: DafyomiEntry[] }
  | { type: 'points';     entries: DafyomiPointsEntry[] }
  | { type: 'hebcharts';  tables: DafyomiTable[] }
  | { type: 'yerushalmi'; entries: DafyomiEntry[] }
  // Revach l'Daf: each entry pairs a brief SUMMARY highlight (entry.title) with
  // its "A BIT MORE" elaboration (entry.body), keyed by the printed number.
  | { type: 'revach';     entries: DafyomiEntry[] };

/** One content type's parsed result, scoped to one amud. Content types that
 *  don't subdivide by amud on the site report a single `amud: 'a'` block whose
 *  `wholeDaf` flag is true. */
export interface DafyomiAmudContent {
  type: DafyomiContentType;
  amud: 'a' | 'b';
  /** True when the source doesn't split this content type by amud (the block
   *  covers the whole daf and was filed under 'a'). */
  wholeDaf?: boolean;
  /** Page title line, e.g. "INSIGHTS TO THE DAF - CHULIN 76". */
  titleLine?: string;
  body: DafyomiBody;
  /** Non-fatal parse anomalies, surfaced in the scraper run summary. */
  parseWarnings?: string[];
}

/** The committed per-daf file. */
export interface DafyomiDaf {
  schemaVersion: 1;
  /** App tractate value, e.g. "Chullin". */
  tractate: string;
  daf: number;
  source: {
    site: 'dafyomi.co.il';
    publisher: 'Kollel Iyun HaDaf';
    /** Per-type source URL, for attribution + click-through. */
    urls: Partial<Record<DafyomiContentType, string>>;
    fetchedAt: string;
  };
  /** Per-amud, per-type content actually present. */
  amudim: {
    a?: Partial<Record<DafyomiContentType, DafyomiAmudContent>>;
    b?: Partial<Record<DafyomiContentType, DafyomiAmudContent>>;
  };
  /** Content types with no page on the site — explicit, never fabricated. */
  absent: DafyomiContentType[];
}
