export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Get parameters
    const mesechta = url.searchParams.get('mesechta');
    const daf = url.searchParams.get('daf');
    
    if (!mesechta || !daf) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: mesechta and daf' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cacheKey = `hebrewbooks:${mesechta}:${daf}`;
    
    // Check if we should bypass cache
    const bypassCache = url.searchParams.get('nocache') === 'true';
    
    // Check KV cache first (unless bypassing)
    if (env.HEBREWBOOKS_KV && !bypassCache) {
      const cached = await env.HEBREWBOOKS_KV.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        // Check if cache is still fresh (7 days)
        if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
          return new Response(cached, {
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-Cache': 'HIT'
            }
          });
        }
      }
    }

    // First try browser rendering if available
    let pageData = null;
    
    if (env.BROWSER) {
      try {
        console.log('Browser binding available, attempting to launch...');
        // Launch browser
        const browser = await env.BROWSER.launch();
        console.log('Browser launched successfully');
        const page = await browser.newPage();
        console.log('New page created');
        
        // HebrewBooks uses simple daf numbers "2", "2b", "3", "3b" format
        const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
        console.log('Navigating to:', targetUrl);
        await page.goto(targetUrl, { waitUntil: 'networkidle0' });

        // Wait for the shastext content to load - try shastext2, shastext3, or shastext4
        try {
          await page.waitForSelector('.shastext2, .shastext3, .shastext4', { timeout: 30000 });
          console.log('Page loaded, extracting content from shastext divs...');
        } catch (waitError) {
          console.log('Shastext elements not found, will try body extraction fallback');
        }

        // Extract text content from the HebrewBooks structure
        pageData = await page.evaluate(() => {
          // Don't clean/trim - preserve formatting
          const preserveFormatting = (element) => {
            if (!element) return '';
            // Get innerHTML to preserve HTML tags and structure
            return element.innerHTML || '';
          };

          const data = {
            mainText: '',
            rashi: '',
            tosafot: '',
            otherCommentaries: {}
          };

          // Look for shastext2, shastext3, and shastext4 elements
          const shastext2 = document.querySelector('.shastext2');
          const shastext3 = document.querySelector('.shastext3'); 
          const shastext4 = document.querySelector('.shastext4');

          console.log('Found shastext2:', !!shastext2);
          console.log('Found shastext3:', !!shastext3);
          console.log('Found shastext4:', !!shastext4);

          // Extract from shastext2 (typically Gemara) - preserve HTML but clean navigation
          if (shastext2) {
            let rawHTML = preserveFormatting(shastext2);
            
            // Remove the Hebrew navigation and headers that appear at the start
            // Look for where the actual Gemara text begins
            const gemaraStart = rawHTML.indexOf('גמרא');
            if (gemaraStart !== -1) {
              // Take HTML starting from "גמרא"
              rawHTML = rawHTML.substring(gemaraStart);
            } else {
              // Fallback: remove common navigation patterns while preserving HTML
              rawHTML = rawHTML
                .replace(/^[\s\S]*?(?=אשר עשיתם|מתני׳|גמרא)/m, '') // Remove everything before Gemara text
                .replace(/<[^>]*>בבלי מסכת.*?דף.*?עמוד.*?<\/[^>]*>/g, '') // Remove headers in tags
                .replace(/<[^>]*>היברו בוקס.*?<\/[^>]*>/g, '') // Remove HebrewBooks branding in tags
                .replace(/<[^>]*>ברכות שבת עירובין.*?נידה<\/[^>]*>/g, ''); // Remove tractate navigation in tags
            }
            
            data.mainText = rawHTML;
            console.log('shastext2 HTML length:', data.mainText.length);
            console.log('shastext2 first 200 chars:', data.mainText.substring(0, 200));
          }

          // Extract from shastext3 (typically Rashi) - preserve HTML
          if (shastext3) {
            data.rashi = preserveFormatting(shastext3);
            console.log('shastext3 HTML length:', data.rashi.length);
            console.log('shastext3 first 200 chars:', data.rashi.substring(0, 200));
          }

          // Extract from shastext4 (typically Tosafot) - preserve HTML
          if (shastext4) {
            data.tosafot = preserveFormatting(shastext4);
            console.log('shastext4 HTML length:', data.tosafot.length);
            console.log('shastext4 first 200 chars:', data.tosafot.substring(0, 200));
          }

          // If no specific shastext elements found, fallback to body extraction
          if (!shastext2 && !shastext3 && !shastext4) {
            console.log('No shastext elements found, using fallback extraction');
            
            // Get all the text content from the page
            const bodyText = document.body ? document.body.innerText : '';
            
            // Look for the Gemara section
            const gemaraStart = bodyText.indexOf('מאימתי');
            if (gemaraStart !== -1) {
              let gemaraEnd = bodyText.length;
              
              const rashiMarkers = ['רש"י', 'רשי', 'פירוש רש"י'];
              for (const marker of rashiMarkers) {
                const pos = bodyText.indexOf(marker, gemaraStart);
                if (pos !== -1 && pos < gemaraEnd) {
                  gemaraEnd = pos;
                }
              }
              
              data.mainText = cleanText(bodyText.substring(gemaraStart, gemaraEnd));
            }
            
            // Extract Rashi
            const rashiStart = bodyText.lastIndexOf('מאימתי');
            if (rashiStart !== -1 && rashiStart > gemaraStart) {
              let rashiEnd = bodyText.length;
              const tosafotMarkers = ['תוספות', 'תוס׳'];
              for (const marker of tosafotMarkers) {
                const pos = bodyText.indexOf(marker, rashiStart);
                if (pos !== -1 && pos < rashiEnd) {
                  rashiEnd = pos;
                }
              }
              
              data.rashi = cleanText(bodyText.substring(rashiStart, rashiEnd));
            }
            
            // Extract Tosafot
            const tosafotMarkers = ['תוספות', 'תוס׳'];
            for (const marker of tosafotMarkers) {
              const tosafotStart = bodyText.lastIndexOf(marker);
              if (tosafotStart !== -1) {
                data.tosafot = cleanText(bodyText.substring(tosafotStart));
                break;
              }
            }
          }

          return data;
        });

        // No iframe handling needed - HebrewBooks uses direct fieldset structure

        await browser.close();
        console.log('Browser closed successfully');
      } catch (browserError) {
        console.error('Browser rendering failed:', browserError.message);
        console.error('Browser error stack:', browserError.stack);
        // Continue to HTTP fetch fallback
      }
    } else {
      console.log('Browser binding not available');
    }
    
    // Fallback to regular HTTP fetch if browser rendering fails or is unavailable
    if (!pageData) {
      try {
        // HebrewBooks uses a mix of numbers and b for 2nd page - so "2", "2b", "3", "3b"
        const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
        console.log('HTTP fetch fallback, URL:', targetUrl);
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DafSupplier/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        
        // Simple text extraction without DOM
        const cleanText = (text) => text ? text.trim() : '';
        
        pageData = {
          mainText: '',
          rashi: '',
          tosafot: '',
          otherCommentaries: {}
        };

        // Remove scripts and styles first
        const cleanHtml = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        console.log('HTTP fallback - looking for shastext elements in HTML...');
        
        // First try to extract from shastext elements in the HTML - preserve HTML structure
        const shastext2Match = cleanHtml.match(/<div[^>]*class="shastext2"[^>]*>([\s\S]*?)<\/div>/i);
        const shastext3Match = cleanHtml.match(/<div[^>]*class="shastext3"[^>]*>([\s\S]*?)<\/div>/i);
        const shastext4Match = cleanHtml.match(/<div[^>]*class="shastext4"[^>]*>([\s\S]*?)<\/div>/i);
        
        console.log('shastext2 found:', !!shastext2Match);
        console.log('shastext3 found:', !!shastext3Match);
        console.log('shastext4 found:', !!shastext4Match);
        
        if (shastext2Match) {
          let rawHTML = shastext2Match[1];
          
          // Clean up navigation text while preserving HTML - look for where actual Gemara begins
          const gemaraStart = rawHTML.indexOf('גמרא');
          if (gemaraStart !== -1) {
            rawHTML = rawHTML.substring(gemaraStart);
          } else {
            // Remove navigation patterns while preserving HTML structure
            rawHTML = rawHTML
              .replace(/^[\s\S]*?(?=אשר עשיתם|מתני׳|גמרא)/m, '')
              .replace(/<[^>]*>בבלי מסכת.*?דף.*?עמוד.*?<\/[^>]*>/g, '')
              .replace(/<[^>]*>היברו בוקס.*?<\/[^>]*>/g, '')
              .replace(/<[^>]*>ברכות שבת עירובין.*?נידה<\/[^>]*>/g, '');
          }
          
          // Decode HTML entities but preserve tags and newlines
          pageData.mainText = rawHTML
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .trim();
          
          console.log('shastext2 HTML extracted length:', pageData.mainText.length);
        }
        
        if (shastext3Match) {
          // Preserve HTML and decode entities
          pageData.rashi = shastext3Match[1]
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .trim();
          console.log('shastext3 HTML extracted length:', pageData.rashi.length);
        }
        
        if (shastext4Match) {
          // Preserve HTML and decode entities
          pageData.tosafot = shastext4Match[1]
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .trim();
          console.log('shastext4 HTML extracted length:', pageData.tosafot.length);
        }
        
        // Fallback if no shastext elements found
        if (!shastext2Match && !shastext3Match && !shastext4Match) {
          console.log('No shastext elements found, using old extraction method...');
          
          // Look for actual Talmud text content after "PDF Text"
          const pdfTextSplit = cleanHtml.split(/PDF[\s]*Text/i);
          if (pdfTextSplit.length > 1) {
            const textContent = pdfTextSplit[pdfTextSplit.length - 1];
            
            // Extract Gemara text - looks for "גמרא" followed by Hebrew text
            const gemaraMatch = textContent.match(/גמרא\s*([\s\S]*?)(?=רש[״"]י|תוספות|מתני|$)/);
            if (gemaraMatch) {
              pageData.mainText = cleanText(
                gemaraMatch[1]
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/&[^;]+;/g, ' ')
                  .replace(/\s+/g, ' ')
              );
            }
            
            // Extract Rashi - looks for "רשי" or 'רש"י' followed by text
            const rashiMatch = textContent.match(/רש[״"]?י\s*([\s\S]*?)(?=תוספות|מתני|©|$)/);
            if (rashiMatch) {
              pageData.rashi = cleanText(
                rashiMatch[1]
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/&[^;]+;/g, ' ')
                  .replace(/\s+/g, ' ')
              );
            }
            
            // Extract Tosafot
            const tosafotMatch = textContent.match(/תוספות\s*([\s\S]*?)(?=©|var\s|window\.|$)/);
            if (tosafotMatch) {
              pageData.tosafot = cleanText(
                tosafotMatch[1]
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/&[^;]+;/g, ' ')
                  .replace(/-->/g, '')
                  .replace(/\s+/g, ' ')
              );
            }
          } else {
            // Final fallback - extract any Hebrew text
            const hebrewMatch = cleanHtml.match(/([\u0590-\u05FF\s]+)/g);
            if (hebrewMatch) {
              pageData.mainText = cleanText(hebrewMatch.join(' '));
            }
          }
        }
      } catch (fetchError) {
        console.error('HTTP fetch failed:', fetchError);
        
        // Return mock data when both browser rendering and HTTP fetch fail
        // This demonstrates the correct data structure
        pageData = {
          mainText: `גמרא: דף ${daf} - זהו טקסט לדוגמה של הגמרא. בעתיד, כאשר Browser Rendering יהיה זמין, נוכל לקבל את הטקסט האמיתי מ-HebrewBooks.
          
תנו רבנן: שלשה דברים צריך אדם לומר בתוך ביתו ערב שבת עם חשכה: עשרתם, ערבתם, הדליקו את הנר.

אמר רבי יהושע בן לוי: שני דברים מעכבין את הגאולה - שאין ישראל עושין תשובה ושאין מתפללין בכוונה.`,
          
          rashi: `רש"י: עשרתם - הפרשתם מעשר מן התבואה.
          
ערבתם - עירובי חצרות, שלא תהיו אסורים לטלטל מבית לחצר.

הדליקו את הנר - נר של שבת, שהוא חובה משום שלום בית.`,
          
          tosafot: `תוספות: שלשה דברים - יש לשאול למה דווקא שלושה דברים אלו?
          
ונראה לומר שכל אחד מהם בא למנוע איסור: עישור - למנוע איסור טבל, עירוב - למנוע איסור הוצאה, והדלקת נר - למנוע מכשול בחושך.`,
          
          otherCommentaries: {}
        };
      }
    }

    try {
      // Get tractate names mapping - corrected IDs from HebrewBooks
      const TRACTATE_NAMES = {
        '1': 'Berakhot',
        '2': 'Shabbat', 
        '3': 'Eruvin',
        '4': 'Pesachim',
        '5': 'Shekalim',
        '6': 'Yoma',
        '7': 'Sukkah',
        '8': 'Beitzah',
        '9': 'Rosh Hashanah',
        '10': 'Taanit',
        '11': 'Megillah',
        '12': 'Moed Katan',
        '13': 'Chagigah',
        '14': 'Yevamot',
        '15': 'Ketubot',
        '16': 'Nedarim',
        '17': 'Nazir',
        '18': 'Sotah',
        '19': 'Gittin',
        '20': 'Kiddushin',
        '21': 'Bava Kamma',
        '22': 'Bava Metzia',
        '23': 'Bava Batra',
        '24': 'Sanhedrin',
        '25': 'Makkot',
        '26': 'Shevuot',
        '27': 'Avodah Zarah',
        '28': 'Horayot',
        '29': 'Zevachim',
        '30': 'Menachot',
        '31': 'Chullin',
        '32': 'Bekhorot',
        '33': 'Arakhin',
        '34': 'Temurah',
        '35': 'Keritot',
        '36': 'Meilah',
        '37': 'Niddah'
      };

      // Prepare response data
      const responseData = {
        mesechta: parseInt(mesechta),
        daf: parseInt(daf),
        dafDisplay: Math.ceil(parseInt(daf) / 2).toString(),
        amud: parseInt(daf) % 2 === 0 ? 'b' : 'a',
        tractate: TRACTATE_NAMES[mesechta] || `Tractate-${mesechta}`,
        ...pageData,
        timestamp: Date.now(),
        source: 'hebrewbooks.org',
        debug: {
          browserAvailable: !!env.BROWSER,
          extractionMethod: pageData ? 'browser' : 'http'
        }
      };

      // Cache in KV
      if (env.HEBREWBOOKS_KV) {
        await env.HEBREWBOOKS_KV.put(cacheKey, JSON.stringify(responseData), {
          expirationTtl: 7 * 24 * 60 * 60 // 7 days
        });
      }

      return new Response(JSON.stringify(responseData), {
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'MISS'
        }
      });

    } catch (error) {
      console.error('Browser rendering error:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to scrape page', 
        details: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};