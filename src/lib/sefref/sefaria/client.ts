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

/** SA-commentary bundle: one CommentatorSnippet per Acharon. Keys are the
 *  canonical book names (Mishnah Berurah, Biur Halakhah, Magen Avraham, etc.). */
export type SaCommentaryBundle = Record<string, CommentatorSnippet>;

/** Sefaria topic with cross-Shas sources. */
export interface SefariaTopic {
  slug: string;
  titleEn?: string;
  titleHe?: string;
  description?: string;
  /** Top refs from Sefaria's topic page, truncated to N. */
  sources: Array<{ ref: string; category?: string; order?: number }>;
}
export type SefariaTopicBundle = SefariaTopic[];

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

  /**
   * Walk the commentary chain off a Shulchan Aruch reference.
   *
   * Sefaria links Gemara → SA refs directly, but the Acharonim commentary
   * (Mishnah Berurah, Biur Halakhah, Sha'ar HaTziyun, Magen Avraham,
   * Turei Zahav, Siftei Kohen, Ba'er Heitev, etc.) lives on the SA ref
   * side — not the Gemara side. To surface them we need a second-step
   * traversal: take a SA ref like "Shulchan Arukh, Orach Chayim 235:1",
   * hit /api/related on it, and filter to the post-medieval commentaries.
   *
   * Returns one SaCommentarySnippet per commentary book, with concatenated
   * Hebrew + English text of matching passages. Empty object if no SA-
   * commentary is linked for this ref (e.g. obscure simanim).
   */
  async fetchSaCommentary(
    saRef: string,
    opts: { maxPerBook?: number } = {}
  ): Promise<SaCommentaryBundle> {
    const maxPerBook = opts.maxPerBook ?? 4;
    const related = await this.getRelated(saRef).catch(() => null);
    if (!related) return {};

    // Known SA-commentary books. Sefaria index_titles may include siman
    // suffixes (e.g. "Mishnah Berurah, Siman 1"), so we match by prefix.
    const SA_COMMENTARY_BOOKS = [
      'Mishnah Berurah',
      'Biur Halakhah',
      "Sha'ar HaTziyun",
      'Beit Yosef',
      'Magen Avraham',
      'Turei Zahav',
      'Siftei Kohen',
      "Ba'er Heitev",
      'Arukh HaShulchan',
      'Kaf HaChaim',
      'Chayei Adam',
      'Chochmat Adam',
      'Kitzur Shulchan Arukh',
      'Pri Megadim',
      'Mishbetzot Zahav',
      'Eshel Avraham',
    ] as const;

    const byBook = new Map<string, string[]>();
    for (const link of related.links) {
      const title = link.index_title || '';
      for (const book of SA_COMMENTARY_BOOKS) {
        if (title === book || title.startsWith(`${book},`) || title.startsWith(`${book} on`)) {
          const refs = byBook.get(book) ?? [];
          if (!refs.includes(link.ref)) refs.push(link.ref);
          byBook.set(book, refs);
          break;
        }
      }
    }

    const out: SaCommentaryBundle = {};
    await Promise.all(
      Array.from(byBook.entries()).map(async ([book, refs]) => {
        const capped = refs.slice(0, maxPerBook);
        const texts = await Promise.all(
          capped.map(r => this.getText(r).catch(() => null))
        );
        const hebrewParts: string[] = [];
        const englishParts: string[] = [];
        const refParts: string[] = [];
        for (const t of texts) {
          if (!t) continue;
          const hebrew = Array.isArray(t.he) ? t.he.join(' ') : (t.he ?? '');
          const english = Array.isArray(t.text) ? t.text.join(' ') : (t.text ?? '');
          if (hebrew) hebrewParts.push(hebrew);
          if (english) englishParts.push(english);
          if (t.ref) refParts.push(t.ref);
        }
        if (hebrewParts.length || englishParts.length) {
          out[book] = {
            hebrew: hebrewParts.join('\n\n'),
            english: englishParts.join('\n\n'),
            ref: refParts.join(' | '),
          };
        }
      })
    );
    return out;
  }
  async fetchDafTopics(
    ref: string,
    maxSourcesPerTopic = 10,
  ): Promise<SefariaTopicBundle> {
    // 1. Use /api/related/{ref}?lang=en which returns a `topics` array with
    //    full topic metadata (slug, title, description, tfidf, anchorRef).
    //    /api/ref-topic-links requires a specific `?lang=` and is redundant.
    const relatedUrl = `${SEFARIA_API_BASE}/related/${ref}?lang=en`;
    const relatedRes = await fetch(relatedUrl);
    if (!relatedRes.ok) return [];
    const related = (await relatedRes.json()) as {
      topics?: Array<{
        topic: string;
        title?: { en?: string; he?: string };
        description?: { en?: string };
        descriptions?: { en?: { title?: string; prompt?: string } };
        order?: { tfidf?: number; curatedPrimacy?: { en?: number } };
        anchorRef?: string;
      }>;
    };
    const topicLinks = related.topics;
    if (!Array.isArray(topicLinks) || topicLinks.length === 0) return [];

    // Dedupe by slug, keep highest-ranked entry. Rank by tfidf primarily,
    // then by curatedPrimacy as a tiebreaker. Keep top 8.
    const bySlug = new Map<string, typeof topicLinks[number]>();
    for (const t of topicLinks) {
      const existing = bySlug.get(t.topic);
      if (!existing) { bySlug.set(t.topic, t); continue; }
      const curScore = (t.order?.tfidf ?? 0) + (t.order?.curatedPrimacy?.en ?? 0) * 0.1;
      const oldScore = (existing.order?.tfidf ?? 0) + (existing.order?.curatedPrimacy?.en ?? 0) * 0.1;
      if (curScore > oldScore) bySlug.set(t.topic, t);
    }
    const ranked = Array.from(bySlug.values())
      .sort((a, b) => (b.order?.tfidf ?? 0) - (a.order?.tfidf ?? 0))
      .slice(0, 8);

    // 2. For each topic slug, fetch topic page (with refs). Prefer the
    //    curator title + prompt over the raw topic title when available.
    const out: SefariaTopicBundle = [];
    await Promise.all(
      ranked.map(async (lnk) => {
        try {
          const tUrl = `${SEFARIA_API_BASE}/topics/${encodeURIComponent(lnk.topic)}?with_refs=1&annotate_time_period=0&annotate_links=0`;
          const res = await fetch(tUrl);
          if (!res.ok) return;
          const body = (await res.json()) as {
            slug?: string;
            primaryTitle?: { en?: string; he?: string };
            description?: { en?: string };
            refs?: Array<{
              ref: string;
              linkType?: string;
              order?: { tfidf?: number; curatedPrimacy?: { en?: number }; pr?: number };
              descriptions?: { en?: { title?: string; prompt?: string } };
            }>;
          };
          const sources: Array<{ ref: string; category?: string; order?: number }> = [];
          if (Array.isArray(body.refs)) {
            const seen = new Set<string>();
            // Dedupe by ref; prefer the highest-ranked entry.
            const byRef = new Map<string, (typeof body.refs)[number]>();
            for (const r of body.refs) {
              if (!r.ref) continue;
              const cur = r.order?.tfidf ?? 0;
              const old = byRef.get(r.ref)?.order?.tfidf ?? 0;
              if (!byRef.has(r.ref) || cur > old) byRef.set(r.ref, r);
            }
            const ranked = Array.from(byRef.values())
              .sort((a, b) => (b.order?.tfidf ?? 0) - (a.order?.tfidf ?? 0));
            for (const r of ranked) {
              if (seen.has(r.ref)) continue;
              seen.add(r.ref);
              sources.push({
                ref: r.ref,
                category: r.linkType,
                order: r.order?.curatedPrimacy?.en ?? r.order?.tfidf,
              });
            }
          }
          const capped = sources.slice(0, maxSourcesPerTopic);
          out.push({
            slug: body.slug ?? lnk.topic,
            titleEn: lnk.descriptions?.en?.title ?? lnk.title?.en ?? body.primaryTitle?.en,
            titleHe: lnk.title?.he ?? body.primaryTitle?.he,
            description: lnk.descriptions?.en?.prompt ?? lnk.description?.en ?? body.description?.en,
            sources: capped,
          });
        } catch {
          // skip on error
        }
      })
    );
    return out;
  }
}

export const sefariaAPI = new SefariaAPI();
