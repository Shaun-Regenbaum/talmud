// Sefaria API service for fetching Jewish texts

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
    hebrewFormatted: string;
    english: string;
  };
  rashi?: {
    hebrew: string;
    hebrewFormatted: string;
    english: string;
  };
  tosafot?: {
    hebrew: string;
    hebrewFormatted: string;
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
    try {
      // Fetch main text
      const mainRef = `${tractate}.${page}`;
      const mainTextResponse = await this.getText(mainRef);
      
      // Fetch related texts to get commentary references
      const relatedResponse = await this.getRelated(mainRef);
      
      // Find Rashi and Tosafot references
      const rashiLink = relatedResponse.links.find(link => 
        link.index_title === `Rashi on ${tractate}` && 
        link.type === 'commentary'
      );
      
      const tosafotLink = relatedResponse.links.find(link => 
        link.index_title === `Tosafot on ${tractate}` && 
        link.type === 'commentary'
      );
      
      // Fetch commentaries
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
      
      // Process and format the data
      const formatText = (text: string | string[]): string => {
        return Array.isArray(text) ? text.join(' ') : text;
      };
      
      // Convert plain text to HTML format expected by daf-renderer
      const formatForDafRenderer = (text: string, prefix: string): string => {
        // Split text into words
        const words = text.split(/\s+/);
        let html = '';
        let wordId = 0;
        
        // Group words into sentences (rough approximation)
        const sentences = text.split(/[.!?:]/).filter(s => s.trim());
        let sentenceId = 0;
        
        sentences.forEach(sentence => {
          const sentenceWords = sentence.trim().split(/\s+/);
          if (sentenceWords.length > 0 && sentenceWords[0]) {
            html += `<span class='sentence' id='sentence-${prefix}-${sentenceId}'>`;
            sentenceWords.forEach(word => {
              if (word) {
                html += `<span class='word' id='word-${prefix}-${wordId}'>${word}</span> `;
                wordId++;
              }
            });
            html += '</span> ';
            sentenceId++;
          }
        });
        
        return html.trim();
      };
      
      const mainHebrew = formatText(mainTextResponse.he);
      const rashiHebrew = rashiData ? formatText(rashiData.he) : '';
      const tosafotHebrew = tosafotData ? formatText(tosafotData.he) : '';
      
      return {
        mainText: {
          hebrew: mainHebrew,
          hebrewFormatted: formatForDafRenderer(mainHebrew, 'main'),
          english: formatText(mainTextResponse.text)
        },
        rashi: rashiData ? {
          hebrew: rashiHebrew,
          hebrewFormatted: formatForDafRenderer(rashiHebrew, 'rashi'),
          english: formatText(rashiData.text)
        } : undefined,
        tosafot: tosafotData ? {
          hebrew: tosafotHebrew,
          hebrewFormatted: formatForDafRenderer(tosafotHebrew, 'tosafot'),
          english: formatText(tosafotData.text)
        } : undefined
      };
    } catch (error) {
      console.error('Error fetching Talmud page:', error);
      throw error;
    }
  }
}

export const sefariaAPI = new SefariaAPI();