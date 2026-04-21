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
}

export const sefariaAPI = new SefariaAPI();
