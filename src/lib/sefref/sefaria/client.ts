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
    /** Per-piece Hebrew text. Sefaria returns commentary as an array where
     *  each entry is one Rashi piece — preserved here so the renderer can
     *  wrap each piece with a data-piece-idx marker for the bidirectional
     *  daf↔commentary anchor highlight. */
    pieces?: string[];
  };
  tosafot?: {
    hebrew: string;
    english: string;
    /** Same shape as rashi.pieces. */
    pieces?: string[];
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

/** A single Mishnah anchored to a gemara daf. `anchorStartSeg` and
 *  `anchorEndSeg` are 0-indexed against the gemara segment array (Sefaria's
 *  ref segments are 1-indexed; we convert here so callers can compare
 *  directly to mark `startSegIdx` / `endSegIdx`). */
export interface MishnaSnippet {
  ref: string;
  anchorRef: string;
  anchorStartSeg: number;
  anchorEndSeg: number;
  hebrew: string;
  english: string;
}
export type MishnaBundle = MishnaSnippet[];

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

/** Parse the trailing segment range from a Sefaria ref like
 *  "Berakhot 2a:1-5" → { start: 1, end: 5 } or "Shabbat 20b:5" →
 *  { start: 5, end: 5 }. Returns null if no trailing segment is present.
 *  Numbers are kept in Sefaria's 1-indexed convention; callers convert. */
function parseAnchorRefRange(anchorRef: string): { start: number; end: number } | null {
  const m = anchorRef.match(/:(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

/**
 * v3 response shape. Unlike v1, v3 returns the actual text shape Sefaria
 * stores: Talmud commentary is depth-2 (`string[][]`, one inner array per
 * main-text segment), while the v1 `/api/texts/` endpoint silently flattens
 * to segment 0 only — losing every piece past the first segment. See
 * `flattenPieces` for the unwrap.
 */
interface SefariaV3Response {
  ref: string;
  versions: Array<{
    language?: string;
    actualLanguage?: string;
    text: unknown;
  }>;
}

/**
 * Flatten any depth of nested string arrays into a flat list of non-empty
 * strings. Sefaria stores Talmud commentary as `string[][]` (segment →
 * pieces), Rishonim as `string[]`, and individual snippets as `string`.
 *
 * @internal Exported for unit tests.
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
 *
 * @internal Exported for unit tests.
 */
export function pickV3Version(versions: SefariaV3Response['versions'], lang: 'he' | 'en'): unknown {
  for (const v of versions) {
    const tag = (v.actualLanguage ?? v.language ?? '').toLowerCase();
    if (lang === 'he' && (tag === 'he' || tag === 'hebrew')) return v.text;
    if (lang === 'en' && (tag === 'en' || tag === 'english')) return v.text;
  }
  return undefined;
}

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

  /**
   * Fetch a ref via the v3 texts endpoint, requesting both Hebrew and English
   * versions in one round-trip. Required for Talmud commentary (Rashi /
   * Tosafot), which v1 silently truncates to its first segment.
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

    // Talmud commentary lives at depth-2 (`he: string[][]`); v1 only returns
    // segment 0. v3 preserves the full shape — we flatten to one piece per
    // lemma so the renderer's anchor markers map 1:1 to actual Rashi /
    // Tosafot entries.
    const [rashiV3, tosafotV3] = await Promise.all([
      rashiLink ? this.getTextV3(rashiLink.ref).catch((e) => {
        console.warn('Failed to fetch Rashi:', e);
        return null;
      }) : Promise.resolve(null),
      tosafotLink ? this.getTextV3(tosafotLink.ref).catch((e) => {
        console.warn('Failed to fetch Tosafot:', e);
        return null;
      }) : Promise.resolve(null),
    ]);

    const formatText = (text: string | string[]): string => {
      return Array.isArray(text) ? text.join(' ') : text;
    };
    const buildCommentary = (data: SefariaV3Response | null) => {
      if (!data) return undefined;
      const hePieces = flattenPieces(pickV3Version(data.versions, 'he'));
      const enPieces = flattenPieces(pickV3Version(data.versions, 'en'));
      if (hePieces.length === 0 && enPieces.length === 0) return undefined;
      return {
        hebrew: hePieces.join(' '),
        english: enPieces.join(' '),
        pieces: hePieces.length > 0 ? hePieces : undefined,
      };
    };

    return {
      mainText: {
        hebrew: formatText(mainTextResponse.he),
        english: formatText(mainTextResponse.text)
      },
      rashi: buildCommentary(rashiV3),
      tosafot: buildCommentary(tosafotV3),
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
   * Fetch the Mishnayot that the gemara on this daf is discussing. Sefaria's
   * /api/related surfaces these as `category: "Mishnah"` links — typically
   * 1-2 per daf, with `type: "mishnah in talmud"` marking the canonical
   * "this gemara discusses this mishna" anchor (other types like
   * "mesorat hashas" are cross-references and excluded).
   *
   * `anchorRef` (e.g. "Berakhot 2a:1-5") is parsed into 0-indexed segment
   * bounds against the gemara so callers can match against an argument's
   * (startSegIdx, endSegIdx) range without re-parsing.
   */
  async fetchMishnaForDaf(tractate: string, page: string): Promise<MishnaBundle> {
    const ref = `${tractate}.${page}`;
    const related = await this.getRelated(ref).catch(() => null);
    if (!related) return [];

    const mishnaLinks = related.links.filter(
      l => l.category === 'Mishnah' && l.type === 'mishnah in talmud'
    );
    if (mishnaLinks.length === 0) return [];

    // Dedupe by mishna ref — same mishna can appear with multiple anchorRef
    // entries (different anchor types or sub-segments). Keep the widest
    // anchor range we see.
    const byRef = new Map<string, { anchorStart: number; anchorEnd: number; anchorRef: string }>();
    for (const l of mishnaLinks) {
      const range = parseAnchorRefRange(l.anchorRef);
      if (!range) continue;
      const existing = byRef.get(l.ref);
      if (!existing) {
        byRef.set(l.ref, { anchorStart: range.start, anchorEnd: range.end, anchorRef: l.anchorRef });
      } else {
        if (range.start < existing.anchorStart) existing.anchorStart = range.start;
        if (range.end > existing.anchorEnd) existing.anchorEnd = range.end;
      }
    }

    const out: MishnaBundle = [];
    await Promise.all(
      Array.from(byRef.entries()).map(async ([mishnaRef, anchor]) => {
        try {
          const t = await this.getText(mishnaRef);
          const hebrew = Array.isArray(t.he) ? t.he.join(' ') : (t.he ?? '');
          const english = Array.isArray(t.text) ? t.text.join(' ') : (t.text ?? '');
          if (!hebrew && !english) return;
          out.push({
            ref: mishnaRef,
            anchorRef: anchor.anchorRef,
            anchorStartSeg: anchor.anchorStart - 1, // Sefaria 1-indexed → mark 0-indexed
            anchorEndSeg: anchor.anchorEnd - 1,
            hebrew,
            english,
          });
        } catch {
          // skip on fetch failure
        }
      })
    );
    out.sort((a, b) => a.anchorStartSeg - b.anchorStartSeg);
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
