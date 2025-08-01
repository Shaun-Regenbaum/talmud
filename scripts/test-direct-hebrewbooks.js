// Test fetching directly from HebrewBooks to see what we get
// This helps us understand if we need browser rendering or if we can parse the HTML

async function testDirectFetch() {
  // Test with Berakhot daf 2a
  const url = 'https://www.hebrewbooks.org/shas.aspx?mesechta=1&daf=2a&format=text';
  
  console.log('Fetching directly from HebrewBooks:', url);
  
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('\n=== RESPONSE INFO ===');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content Length:', html.length);
    
    // Check if it's a redirect or blocked
    if (html.includes('Cloudflare') || html.includes('cf-browser-verification')) {
      console.log('\n=== CLOUDFLARE PROTECTION DETECTED ===');
      console.log('The page is protected by Cloudflare, browser rendering is required');
      return;
    }
    
    // Look for the actual content URL in the HTML
    console.log('\n=== SEARCHING FOR CONTENT URL ===');
    
    // Look for pdftotext.aspx which seems to be the actual text endpoint
    const pdftotextMatch = html.match(/pdftotext\.aspx[^"']*mesechta=\d+[^"']*/i);
    if (pdftotextMatch) {
      console.log('Found pdftotext URL:', pdftotextMatch[0]);
      
      // Try fetching the pdftotext URL
      const pdftotextUrl = `https://www.hebrewbooks.org/${pdftotextMatch[0]}`;
      console.log('\nFetching pdftotext URL:', pdftotextUrl);
      
      const textResponse = await fetch(pdftotextUrl);
      const textContent = await textResponse.text();
      
      console.log('\n=== PDFTOTEXT RESPONSE ===');
      console.log('Status:', textResponse.status);
      console.log('Length:', textContent.length);
      console.log('First 500 chars:', textContent.substring(0, 500));
      
      // Look for Hebrew text
      const hebrewMatch = textContent.match(/[\u0590-\u05FF\s]{50,}/);
      if (hebrewMatch) {
        console.log('\n=== HEBREW TEXT FOUND ===');
        console.log(hebrewMatch[0].trim().substring(0, 200));
      }
    }
    
    // Look for pagefeed.aspx which might be another content endpoint
    const pagefeedMatch = html.match(/pagefeed\.aspx[^"']*mesechta=\d+[^"']*/i);
    if (pagefeedMatch) {
      console.log('\nFound pagefeed URL:', pagefeedMatch[0]);
    }
    
    // Check if there's an iframe with content
    const iframeMatch = html.match(/<iframe[^>]*id="acroframe"[^>]*src="([^"]+)"/i);
    if (iframeMatch) {
      console.log('\nFound iframe src:', iframeMatch[1]);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

testDirectFetch();