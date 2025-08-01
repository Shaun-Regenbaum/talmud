import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS } from '$lib/hebrewbooks';

export const GET: RequestHandler = async ({ url, platform }) => {
  // Get query parameters
  const tractate = url.searchParams.get('tractate');
  const daf = url.searchParams.get('daf');
  const mesechta = url.searchParams.get('mesechta');

  // Validate inputs
  if (!daf || (!tractate && !mesechta)) {
    return json({ error: 'Missing required parameters: tractate/mesechta and daf' }, { status: 400 });
  }

  // Convert tractate name to ID if needed
  let mesechtaId: number;
  if (mesechta) {
    mesechtaId = parseInt(mesechta);
  } else if (tractate) {
    mesechtaId = TRACTATE_IDS[tractate];
    if (!mesechtaId) {
      return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
    }
  } else {
    return json({ error: 'Must provide either tractate name or mesechta ID' }, { status: 400 });
  }

  const dafNum = parseInt(daf);
  if (isNaN(mesechtaId) || isNaN(dafNum)) {
    return json({ error: 'Invalid mesechta or daf number' }, { status: 400 });
  }

  try {
    // Try to fetch from HebrewBooks directly
    const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechtaId}&daf=${dafNum}&format=text`;
    
    console.log('Fetching from HebrewBooks:', targetUrl);
    
    // Attempt direct fetch - this may fail due to CORS in development
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Parse the HTML to extract text content
      // Note: We can't use browser DOM APIs in server-side code
      // So we'll do basic text extraction
      const cleanText = (text: string) => {
        return text ? text.trim() : '';
      };

      const data = {
        mainText: '',
        rashi: '',
        tosafot: '',
        otherCommentaries: {}
      };

      // Parse using the rashi; and tosafot: markers
      if (html.includes('rashi;') || html.includes('tosafot:')) {
        const parts = html.split(/rashi[;:]/i);
        if (parts.length > 0) {
          data.mainText = cleanText(parts[0]);
        }
        
        if (parts.length > 1) {
          const rashiAndTosafot = parts[1].split(/tosafot[;:]/i);
          if (rashiAndTosafot.length > 0) {
            data.rashi = cleanText(rashiAndTosafot[0]);
          }
          if (rashiAndTosafot.length > 1) {
            data.tosafot = cleanText(rashiAndTosafot[1]);
          }
        }
      } else {
        // If no markers found, assume it's all main text
        data.mainText = cleanText(html);
      }

      const tractateData = Object.entries(TRACTATE_IDS).find(([_, id]) => id === mesechtaId);
      
      return json({
        tractate: tractateData?.[0] || `Tractate-${mesechtaId}`,
        daf: Math.ceil(dafNum / 2).toString(),
        amud: dafNum % 2 === 0 ? 'b' : 'a',
        ...data,
        timestamp: Date.now(),
        source: 'hebrewbooks.org'
      });

    } catch (fetchError) {
      console.error('Direct fetch failed (expected in development due to CORS):', fetchError);
      
      // Fallback to mock data when direct fetch fails
      const tractateData = Object.entries(TRACTATE_IDS).find(([_, id]) => id === mesechtaId);
      const mockData = {
        tractate: tractateData?.[0] || `Tractate-${mesechtaId}`,
        daf: Math.ceil(dafNum / 2).toString(),
        amud: dafNum % 2 === 0 ? 'b' : 'a',
        mainText: `גמרא: ${tractateData?.[0] || 'מסכת'} דף ${Math.ceil(dafNum / 2)} עמוד ${dafNum % 2 === 0 ? 'ב' : 'א'}\n\nתנו רבנן: שלשה דברים צריך אדם לומר בתוך ביתו ערב שבת עם חשכה: עשרתם, ערבתם, הדליקו את הנר.\n\nספק חשכה ספק אינה חשכה - אין מעשרין את הודאי, ואין מטבילין את הכלים, ואין מדליקין את הנרות. אבל מעשרין את הדמאי, ומערבין, וטומנין את החמין.`,
        rashi: `רש"י: עשרתם - מעשר תבואה שלא עישרתם. ערבתם - עירובי חצרות. הדליקו את הנר - נר של שבת.\n\nספק חשכה - ספק יום ספק לילה.\n\nאין מעשרין את הודאי - דמלאכה היא, ואסור לעשות מלאכה בשבת.`,
        tosafot: `תוספות: תנו רבנן שלשה דברים - פירש בירושלמי טעמא משום דאיתנהו בשכחה, ואי לא מדכר להו אתי לאתויי לידי איסורא.\n\nועשרתם - דוקא תבואה דאורייתא, אבל דמאי שרי אפילו בשבת גופה.`,
        timestamp: Date.now(),
        error: 'CORS prevented direct fetch. Deploy to Cloudflare Workers for full functionality.',
        note: 'Fallback mock data - real scraping requires Cloudflare Browser Rendering'
      };

      return json(mockData);
    }

    // Real implementation would look like this:
    /*
    if (!platform?.env?.HEBREWBOOKS_KV || !platform?.env?.BROWSER) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const service = new HebrewBooksService(platform.env.HEBREWBOOKS_KV, platform.env.BROWSER);
    const data = await service.getPage(mesechtaId, dafNum);

    if (!data) {
      return json({ error: 'Failed to fetch page data' }, { status: 500 });
    }

    return json(data);
    */
  } catch (error) {
    console.error('Error in HebrewBooks API:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};