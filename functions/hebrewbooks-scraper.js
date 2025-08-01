// Cloudflare Worker with Browser Rendering for HebrewBooks scraping
// This runs as a separate function with Puppeteer support

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Get parameters
  const mesechta = url.searchParams.get('mesechta');
  const daf = url.searchParams.get('daf');
  
  if (!mesechta || !daf) {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cacheKey = `hebrewbooks:${mesechta}:${daf}`;
  
  // Check KV cache first
  if (env.HEBREWBOOKS_KV) {
    const cached = await env.HEBREWBOOKS_KV.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      // Check if cache is still fresh (7 days)
      if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return new Response(cached, {
          headers: { 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          }
        });
      }
    }
  }

  try {
    // Launch browser
    const browser = await context.env.BROWSER.launch();
    const page = await browser.newPage();
    
    // Navigate to HebrewBooks
    const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });

    // Wait for content
    await page.waitForSelector('body', { timeout: 30000 });

    // Extract text content
    const pageData = await page.evaluate(() => {
      // Helper function to clean text
      const cleanText = (text) => {
        // Only trim start and end, preserve internal whitespace, newlines, and HTML
        return text ? text.trim() : '';
      };

      // Try multiple selectors for different page structures
      const extractText = () => {
        const data = {
          mainText: '',
          rashi: '',
          tosafot: '',
          otherCommentaries: {}
        };

        // Get all text content
        const allText = document.body.innerText || document.body.textContent || '';
        
        // Method 1: Check if text contains rashi; and tosafot: markers
        if (allText.includes('rashi;') || allText.includes('tosafot:')) {
          // Split by rashi marker
          const parts = allText.split(/rashi[;:]/i);
          if (parts.length > 0) {
            data.mainText = cleanText(parts[0]);
          }
          
          if (parts.length > 1) {
            // Now split the remaining by tosafot marker
            const rashiAndTosafot = parts[1].split(/tosafot[;:]/i);
            if (rashiAndTosafot.length > 0) {
              data.rashi = cleanText(rashiAndTosafot[0]);
            }
            if (rashiAndTosafot.length > 1) {
              data.tosafot = cleanText(rashiAndTosafot[1]);
            }
          }
        } else {
          // Method 2: Look for table-based layout
          const tables = document.querySelectorAll('table');
          let foundContent = false;
          
          tables.forEach(table => {
            const cells = table.querySelectorAll('td');
            if (cells.length >= 3) {
              // Three column layout: Rashi | Main | Tosafot
              const leftText = cleanText(cells[0].innerText);
              const centerText = cleanText(cells[1].innerText);
              const rightText = cleanText(cells[2].innerText);
              
              if (centerText.length > 100) {
                data.mainText = centerText;
                data.rashi = leftText;
                data.tosafot = rightText;
                foundContent = true;
              }
            }
          });
          
          // Method 3: Fallback to all text
          if (!foundContent) {
            data.mainText = cleanText(allText);
          }
        }

        return data;
      };

      return extractText();
    });

    await browser.close();

    // Prepare response data
    const responseData = {
      mesechta: parseInt(mesechta),
      daf: parseInt(daf),
      dafDisplay: Math.ceil(parseInt(daf) / 2).toString(),
      amud: parseInt(daf) % 2 === 0 ? 'b' : 'a',
      ...pageData,
      timestamp: Date.now(),
      source: 'hebrewbooks.org'
    };

    // Cache in KV
    if (env.HEBREWBOOKS_KV) {
      await env.HEBREWBOOKS_KV.put(cacheKey, JSON.stringify(responseData), {
        expirationTtl: 7 * 24 * 60 * 60 // 7 days
      });
    }

    return new Response(JSON.stringify(responseData), {
      headers: { 
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
      headers: { 'Content-Type': 'application/json' }
    });
  }
}