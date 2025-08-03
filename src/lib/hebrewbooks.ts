// HebrewBooks scraping service
// Uses Cloudflare Browser Rendering to extract structured data from HebrewBooks.org

export interface HebrewBooksPage {
  tractate: string;
  daf: string;
  amud: string;
  mainText: string;
  rashi?: string;
  tosafot?: string;
  otherCommentaries?: Record<string, string>;
  timestamp: number;
}

export interface HebrewBooksParams {
  mesechta: number; // Tractate ID (e.g., 27 for Berakhot)
  daf: number; // Page number
  format?: 'text' | 'pdf';
}

// Tractate ID mapping
export const TRACTATE_IDS: Record<string, number> = {
  'Berakhot': 1,
  'Shabbat': 2,
  'Eruvin': 3,
  'Pesachim': 4,
  'Shekalim': 5,
  'Yoma': 6,
  'Sukkah': 7,
  'Beitzah': 8,
  'Rosh Hashanah': 9,
  'Taanit': 10,
  'Megillah': 11,
  'Moed Katan': 12,
  'Chagigah': 13,
  'Yevamot': 14,
  'Ketubot': 15,
  'Nedarim': 16,
  'Nazir': 17,
  'Sotah': 18,
  'Gittin': 19,
  'Kiddushin': 20,
  'Bava Kamma': 21,
  'Bava Metzia': 22,
  'Bava Batra': 23,
  'Sanhedrin': 24,
  'Makkot': 25,
  'Shevuot': 26,
  'Avodah Zarah': 27,
  'Horayot': 28,
  'Zevachim': 29,
  'Menachot': 30,
  'Chullin': 31,
  'Bekhorot': 32,
  'Arakhin': 33,
  'Temurah': 34,
  'Keritot': 35,
  'Meilah': 36,
  'Niddah': 37
};

class HebrewBooksService {
  private kvNamespace: KVNamespace | null = null;
  private browserInstance: any = null;

  constructor(kvNamespace?: KVNamespace, browserInstance?: any) {
    this.kvNamespace = kvNamespace || null;
    this.browserInstance = browserInstance || null;
  }

  private getCacheKey(mesechta: number, daf: number): string {
    return `hebrewbooks:${mesechta}:${daf}`;
  }

  async getPage(mesechta: number, daf: number): Promise<HebrewBooksPage | null> {
    const cacheKey = this.getCacheKey(mesechta, daf);
    
    // Check cache first
    if (this.kvNamespace) {
      const cached = await this.kvNamespace.get(cacheKey, 'json');
      if (cached) {
        const data = cached as HebrewBooksPage;
        // Cache for 7 days
        if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
          return data;
        }
      }
    }

    // Fetch fresh data
    const freshData = await this.scrapePage(mesechta, daf);
    
    // Cache the result
    if (freshData && this.kvNamespace) {
      await this.kvNamespace.put(cacheKey, JSON.stringify(freshData), {
        expirationTtl: 7 * 24 * 60 * 60, // 7 days in seconds
      });
    }

    return freshData;
  }

  private async scrapePage(mesechta: number, daf: number): Promise<HebrewBooksPage | null> {
    if (!this.browserInstance) {
      throw new Error('Browser instance not available');
    }

    const url = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
    
    try {
      const page = await this.browserInstance.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });

      // Wait for content to load
      await page.waitForSelector('.shastext', { timeout: 10000 });

      // Extract the data
      const data = await page.evaluate(() => {
        const getTextContent = (selector: string): string => {
          const element = document.querySelector(selector);
          return element ? element.textContent?.trim() || '' : '';
        };

        // Main gemara text is usually in the center column
        const mainTextElement = document.querySelector('.shastext .maintext, .shastext center');
        const mainText = mainTextElement ? mainTextElement.textContent?.trim() || '' : '';

        // Rashi is typically in the inner margin
        const rashiElement = document.querySelector('.shastext .rashi, .shastext .commentary.inner');
        const rashi = rashiElement ? rashiElement.textContent?.trim() || '' : '';

        // Tosafot is typically in the outer margin
        const tosafotElement = document.querySelector('.shastext .tosafot, .shastext .commentary.outer');
        const tosafot = tosafotElement ? tosafotElement.textContent?.trim() || '' : '';

        // Try to extract other commentaries
        const otherCommentaries: Record<string, string> = {};
        document.querySelectorAll('.shastext .commentary').forEach((el) => {
          const title = el.querySelector('.commentary-title')?.textContent?.trim();
          const text = el.querySelector('.commentary-text')?.textContent?.trim();
          if (title && text && title !== 'רש"י' && title !== 'תוספות') {
            otherCommentaries[title] = text;
          }
        });

        return {
          mainText,
          rashi,
          tosafot,
          otherCommentaries: Object.keys(otherCommentaries).length > 0 ? otherCommentaries : undefined,
        };
      });

      await page.close();

      // Get tractate name from ID
      const tractateName = Object.entries(TRACTATE_IDS).find(([_, id]) => id === mesechta)?.[0] || `Tractate-${mesechta}`;
      
      // Determine amud (a or b)
      const amud = daf % 2 === 0 ? 'b' : 'a';
      const actualDaf = Math.ceil(daf / 2).toString();

      return {
        tractate: tractateName,
        daf: actualDaf,
        amud,
        ...data,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error scraping HebrewBooks:', error);
      return null;
    }
  }

  // Fallback method using regular fetch (won't work due to CORS, but included for completeness)
  private async fetchPageHTML(mesechta: number, daf: number): Promise<string | null> {
    const url = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error('Error fetching HebrewBooks page:', error);
      return null;
    }
  }
}

// Client-side API wrapper
class HebrewBooksAPI {
  async fetchPage(tractate: string, daf: string, options: { br?: string } = {}): Promise<HebrewBooksPage | null> {
    try {
      console.log('HebrewBooksAPI.fetchPage called with:', { tractate, daf, options });
      
      // First try the browser rendering endpoint
      const mesechtaId = TRACTATE_IDS[tractate];
      if (!mesechtaId) {
        throw new Error(`Unknown tractate: ${tractate}`);
      }

      // HebrewBooks expects daf in format: "2", "2b", "3", "3b" etc.
      // So for "2a" we send "2", for "2b" we send "2b"
      const dafNum = parseInt(daf.replace(/[ab]/, ''));
      const amud = daf.includes('b') ? 'b' : 'a';
      const dafParam = amud === 'a' ? dafNum.toString() : `${dafNum}b`;
      
      console.log('Conversion:', { input: daf, dafNum, amud, dafParam });

      // Use the deployed daf-supplier worker
      const params = new URLSearchParams({
        mesechta: mesechtaId,
        daf: dafParam,
        ...options // Include any additional options like br=true
      });
      const endpoint = `https://daf-supplier.402.workers.dev?${params.toString()}`;
      console.log('Fetching from endpoint:', endpoint);
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Failed to fetch HebrewBooks data');
      }

      const data = await response.json();
      console.log('Response from daf-supplier:', data);
      console.log('daf-supplier mainText contains <br>:', data.mainText?.includes('<br>'));
      
      // The daf-supplier returns a different structure than our HebrewBooksPage interface expects
      // IMPORTANT: daf-supplier returns the actual daf number (e.g., for input "17b", it returns dafDisplay: "9", amud: "a")
      // We need to use our original input values, not the returned values
      const mappedData: HebrewBooksPage = {
        tractate: data.tractate || tractate,
        daf: daf.replace(/[ab]$/, ''), // Use our input, not data.dafDisplay
        amud: daf.includes('b') ? 'b' : 'a', // Use our input, not data.amud
        mainText: data.mainText || '',
        rashi: data.rashi || '',
        tosafot: data.tosafot || '',
        otherCommentaries: data.otherCommentaries,
        timestamp: data.timestamp || Date.now()
      };
      
      console.log('mappedData mainText contains <br>:', mappedData.mainText?.includes('<br>'));
      
      console.log('Mapped data for component:', mappedData);
      return mappedData;
    } catch (error) {
      console.error('Error fetching HebrewBooks page:', error);
      return null;
    }
  }
}

export const hebrewBooksService = HebrewBooksService;
export const hebrewBooksAPI = new HebrewBooksAPI();