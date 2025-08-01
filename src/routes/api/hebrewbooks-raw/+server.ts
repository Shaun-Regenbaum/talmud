import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const mesechta = url.searchParams.get('mesechta');
  const daf = url.searchParams.get('daf');
  
  if (!mesechta || !daf) {
    return json({ error: 'Missing required parameters: mesechta and daf' }, { status: 400 });
  }

  try {
    // Fetch the raw HTML from HebrewBooks.org exactly as the worker would see it
    const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
    console.log('Fetching raw HTML from:', targetUrl);
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DafSupplier/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    return json({
      mesechta: parseInt(mesechta),
      daf,
      url: targetUrl,
      htmlLength: html.length,
      html: html, // Return the complete, unstripped HTML
      timestamp: Date.now(),
      headers: Object.fromEntries(response.headers.entries())
    });

  } catch (error) {
    console.error('Failed to fetch HTML:', error);
    return json({ 
      error: 'Failed to fetch HTML',
      details: error instanceof Error ? error.message : 'Unknown error',
      mesechta: parseInt(mesechta),
      daf,
      timestamp: Date.now()
    }, { status: 500 });
  }
};