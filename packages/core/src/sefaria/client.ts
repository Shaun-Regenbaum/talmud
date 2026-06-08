/**
 * Generic Sefaria API client — corpus-agnostic. `getText` / `getTextV3` /
 * `getRelated` fetch ANY Sefaria ref ("Genesis 1:1", "Rashi on Genesis 1:1",
 * "Berakhot 2a", a Shulchan Aruch ref, …) identically; the flatten/pick helpers
 * parse Sefaria's nested text + version shapes. Apps extend `SefariaClient` with
 * their own corpus-specific fetchers (e.g. the Talmud app's page-with-
 * commentaries / rishonim / mishnah methods; a Tanach app's verse-with-
 * commentaries). No app logic lives here.
 */

export const SEFARIA_API_BASE = 'https://www.sefaria.org/api';

export interface SefariaTextResponse {
  ref: string;
  heRef: string;
  text: string | string[];
  he: string | string[];
  /** Present (with a message) when the ref couldn't be resolved — e.g. a
   *  tractate that has no Yerushalmi. Callers should treat it as "no text". */
  error?: string;
  type?: string;
  book?: string;
  sections?: number[];
  toSections?: number[];
  sectionRef?: string;
  heSectionRef?: string;
  isComplex?: boolean;
  /** Next/previous section refs ("Genesis 2" / null at the book edge), as
   *  returned by the texts API. Drives chapter navigation without hand-kept
   *  per-book chapter counts. */
  next?: string | null;
  prev?: string | null;
  versions?: Array<{
    title: string;
    language: string;
    versionTitle: string;
    versionSource?: string;
  }>;
  commentary?: unknown[];
  sheets?: unknown[];
  notes?: unknown[];
  links?: unknown[];
}

export interface SefariaRelatedResponse {
  links: Array<{
    _id: string;
    index_title: string;
    category: string;
    type: string;
    ref: string;
    anchorRef: string;
    sourceRef: string;
    sourceHeRef: string;
    anchorRefExpanded?: string[];
    sourceHasEn: boolean;
    commentaryNum?: number;
  }>;
  sheets: unknown[];
  notes: unknown[];
}

export interface SefariaV3Response {
  ref: string;
  versions: Array<{
    language?: string;
    actualLanguage?: string;
    text: unknown;
  }>;
}

/**
 * Flatten Sefaria's arbitrarily-nested text array into a flat list of non-empty
 * strings (depth-first, array order preserved). A plain string yields a
 * single-element list; scalars and other shapes yield [].
 */
export function flattenPieces(text: unknown): string[] {
  if (typeof text === 'string') return text.length > 0 ? [text] : [];
  if (!Array.isArray(text)) return [];
  const out: string[] = [];
  for (const entry of text) {
    if (typeof entry === 'string') {
      if (entry.length > 0) out.push(entry);
    } else if (Array.isArray(entry)) {
      out.push(...flattenPieces(entry));
    }
  }
  return out;
}

/**
 * Pick the version whose `actualLanguage`/`language` matches the requested
 * tag. Sefaria returns versions[] in catalog order, which is not necessarily
 * the language order we asked for.
 */
export function pickV3Version(versions: SefariaV3Response['versions'], lang: 'he' | 'en'): unknown {
  for (const v of versions) {
    const tag = (v.actualLanguage ?? v.language ?? '').toLowerCase();
    if (lang === 'he' && (tag === 'he' || tag === 'hebrew')) return v.text;
    if (lang === 'en' && (tag === 'en' || tag === 'english')) return v.text;
  }
  return undefined;
}

/** The generic Sefaria HTTP surface. Subclass to add corpus-specific fetchers. */
export class SefariaClient {
  async getText(
    ref: string,
    options?: { lang?: string; version?: string; commentary?: boolean; context?: number },
  ): Promise<SefariaTextResponse> {
    const params = new URLSearchParams();
    if (options?.lang) params.append('lang', options.lang);
    if (options?.version) params.append('version', options.version);
    if (options?.commentary !== undefined) params.append('commentary', options.commentary ? '1' : '0');
    if (options?.context !== undefined) params.append('context', options.context.toString());
    const queryString = params.toString();
    const url = `${SEFARIA_API_BASE}/texts/${ref}${queryString ? '?' + queryString : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch text: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch a ref via the v3 texts endpoint, requesting both Hebrew and English
   * versions in one round-trip. Required for commentary (e.g. Rashi), which v1
   * silently truncates to its first segment.
   */
  async getTextV3(ref: string): Promise<SefariaV3Response> {
    const url = `${SEFARIA_API_BASE}/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=english`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch v3 text: ${response.statusText}`);
    }
    return response.json();
  }

  async getRelated(ref: string): Promise<SefariaRelatedResponse> {
    const url = `${SEFARIA_API_BASE}/related/${ref}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch related texts: ${response.statusText}`);
    }
    return response.json();
  }
}
