const SEFARIA_API_BASE = 'https://www.sefaria.org/api';

export interface SefariaTextResponse {
  ref: string;
  heRef: string;
  text: string | string[];
  he: string | string[];
  type?: string;
  book?: string;
  sections?: number[];
  toSections?: number[];
  sectionRef?: string;
  heSectionRef?: string;
  isComplex?: boolean;
  versions?: Array<{
    title: string;
    language: string;
    versionTitle: string;
    versionSource?: string;
  }>;
  commentary?: any[];
  sheets?: any[];
  notes?: any[];
  links?: any[];
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
  sheets: any[];
  notes: any[];
}

export interface TalmudPageData {
  mainText: {
    hebrew: string;
    english: string;
  };
  rashi?: {
    hebrew: string;
    english: string;
  };
  tosafot?: {
    hebrew: string;
    english: string;
  };
}

export interface CommentatorSnippet {
  hebrew: string;
  english: string;
  ref: string;
}

export type RishonimBundle = Record<string, CommentatorSnippet>;

export interface HalachicSnippet {
  ref: string;
  hebrew: string;
  english: string;
}

export type HalachicRefBundle = Record<string, HalachicSnippet[]>;

/**
 * Classical Rishonim / Acharonim on the Talmud. Keys are the short labels we
 * expose to the LLM; values are how the book appears in Sefaria's index_title
 * or getText ref. Not every tractate has every commentator — missing ones are
 * simply omitted from the bundle.
 */
const RISHONIM_BOOKS: ReadonlyArray<{ label: string; book: string }> = [
  { label: 'Rashba',              book: 'Rashba' },
  { label: 'Ritva',               book: 'Ritva' },
  { label: 'Ramban',              book: 'Ramban' },
  { label: 'Meiri',               book: 'Beit HaBechira' },
  { label: 'Rosh',                book: 'Rosh' },
  { label: 'Maharsha',            book: 'Maharsha' },
  { label: 'Chidushei Aggadot',   book: 'Chidushei Aggadot of the Maharsha' },
];

class SefariaAPI {
  async getText(ref: string, options?: {
    lang?: string;
    version?: string;
    commentary?: boolean;
    context?: number;
  }): Promise<SefariaTextResponse> {
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

  async getRelated(ref: string): Promise<SefariaRelatedResponse> {
    const url = `${SEFARIA_API_BASE}/related/${ref}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch related texts: ${response.statusText}`);
    }

    return response.json();
  }

  async getTalmudPageWithCommentaries(tractate: string, page: string): Promise<TalmudPageData> {
    const mainRef = `${tractate}.${page}`;
    const mainTextResponse = await this.getText(mainRef);
    const relatedResponse = await this.getRelated(mainRef);

    const rashiLink = relatedResponse.links.find(link =>
      link.index_title === `Rashi on ${tractate}` &&
      link.type === 'commentary'
    );

    const tosafotLink = relatedResponse.links.find(link =>
      link.index_title === `Tosafot on ${tractate}` &&
      link.type === 'commentary'
    );

    let rashiData = null;
    let tosafotData = null;

    if (rashiLink) {
      try {
        rashiData = await this.getText(rashiLink.ref);
      } catch (e) {
        console.warn('Failed to fetch Rashi:', e);
      }
    }

    if (tosafotLink) {
      try {
        tosafotData = await this.getText(tosafotLink.ref);
      } catch (e) {
        console.warn('Failed to fetch Tosafot:', e);
      }
    }

    const formatText = (text: string | string[]): string => {
      return Array.isArray(text) ? text.join(' ') : text;
    };

    return {
      mainText: {
        hebrew: formatText(mainTextResponse.he),
        english: formatText(mainTextResponse.text)
      },
      rashi: rashiData ? {
        hebrew: formatText(rashiData.he),
        english: formatText(rashiData.text)
      } : undefined,
      tosafot: tosafotData ? {
        hebrew: formatText(tosafotData.he),
        english: formatText(tosafotData.text)
      } : undefined
    };
  }

  /**
   * Fetch classical Rishonim commentary on a given amud (Rashba, Ritva,
   * Ramban, Meiri/Beit HaBechira, Rosh, Maharsha, Chidushei Aggadot).
   * Returns only the commentators Sefaria has for this tractate+page.
   */
  async fetchRishonim(tractate: string, page: string): Promise<RishonimBundle> {
    const ref = `${tractate}.${page}`;
    const out: RishonimBundle = {};
    await Promise.all(
      RISHONIM_BOOKS.map(async ({ label, book }) => {
        try {
          const text = await this.getText(`${book} on ${ref}`);
          const hebrew = Array.isArray(text.he) ? text.he.join(' ') : (text.he ?? '');
          const english = Array.isArray(text.text) ? text.text.join(' ') : (text.text ?? '');
          if (hebrew || english) {
            out[label] = { hebrew, english, ref: text.ref };
          }
        } catch {
          // commentator not available for this daf — skip silently
        }
      })
    );
    return out;
  }

  /**
   * Fetch halachic codifications (Mishneh Torah / Rambam, Shulchan Aruch,
   * Tur) that Sefaria links to a given amud. Returns up to N snippets per
   * codification book, grouped by book title.
   */
  async fetchHalachicRefs(
    tractate: string,
    page: string,
    opts: { maxPerBook?: number } = {}
  ): Promise<HalachicRefBundle> {
    const maxPerBook = opts.maxPerBook ?? 6;
    const ref = `${tractate}.${page}`;
    const related = await this.getRelated(ref).catch(() => null);
    if (!related) return {};
    const halakhahLinks = related.links.filter(l => l.category === 'Halakhah');
    const grouped = new Map<string, string[]>();
    for (const link of halakhahLinks) {
      const book = link.index_title;
      const refs = grouped.get(book) ?? [];
      if (!refs.includes(link.ref)) refs.push(link.ref);
      grouped.set(book, refs);
    }
    const out: HalachicRefBundle = {};
    await Promise.all(
      Array.from(grouped.entries()).map(async ([book, refs]) => {
        const capped = refs.slice(0, maxPerBook);
        const texts = await Promise.all(
          capped.map(r => this.getText(r).catch(() => null))
        );
        const snippets: HalachicSnippet[] = [];
        for (const t of texts) {
          if (!t) continue;
          const hebrew = Array.isArray(t.he) ? t.he.join(' ') : (t.he ?? '');
          const english = Array.isArray(t.text) ? t.text.join(' ') : (t.text ?? '');
          if (hebrew || english) snippets.push({ ref: t.ref, hebrew, english });
        }
        if (snippets.length) out[book] = snippets;
      })
    );
    return out;
  }
}

export const sefariaAPI = new SefariaAPI();
