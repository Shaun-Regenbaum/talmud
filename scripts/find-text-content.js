// Script to find the actual text content in HebrewBooks response

async function findTextContent() {
  const url = 'https://daf-supplier.402.workers.dev?mesechta=27&daf=44';
  
  console.log('Fetching from:', url);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Look for iframe URL
    const iframeSrcMatch = data.mainText.match(/acroframe[^"]*src\s*=\s*["']([^"']+)["']/i);
    if (iframeSrcMatch) {
      console.log('\n=== FOUND IFRAME SRC ===');
      console.log('URL:', iframeSrcMatch[1]);
    }
    
    // Look for specific Hebrew text sections after removing scripts/styles
    const withoutScripts = data.mainText
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Look for text between PDF and Text markers (common pattern)
    const pdfTextMatch = withoutScripts.match(/PDF[\s\S]*?Text[\s\S]*?([\u0590-\u05FF\s\n]+)/);
    if (pdfTextMatch) {
      console.log('\n=== FOUND TEXT AFTER PDF/TEXT ===');
      console.log(pdfTextMatch[1].trim().substring(0, 200));
    }
    
    // Look for patterns like גמרא followed by Hebrew text
    const gemaraMatch = withoutScripts.match(/גמרא[\s:]*([^\n<]+)/);
    if (gemaraMatch) {
      console.log('\n=== FOUND GEMARA TEXT ===');
      console.log(gemaraMatch[1].trim());
    }
    
    // Look for רש"י patterns
    const rashiMatch = withoutScripts.match(/רש[״"]י[\s:]*([^\n<]+)/);
    if (rashiMatch) {
      console.log('\n=== FOUND RASHI TEXT ===');
      console.log(rashiMatch[1].trim());
    }
    
    // Look for תוספות patterns
    const tosafotMatch = withoutScripts.match(/תוספות[\s:]*([^\n<]+)/);
    if (tosafotMatch) {
      console.log('\n=== FOUND TOSAFOT TEXT ===');
      console.log(tosafotMatch[1].trim());
    }
    
    // Look for the actual frame URL pattern
    console.log('\n=== CHECKING FOR FRAME PATTERNS ===');
    const framePatterns = [
      /pdftotext\.aspx[^"']*/gi,
      /pagefeed\.aspx[^"']*/gi,
      /shas\.aspx[^"']*/gi
    ];
    
    framePatterns.forEach(pattern => {
      const matches = data.mainText.match(pattern);
      if (matches) {
        console.log('Found pattern:', matches[0]);
      }
    });
    
    // Extract everything that looks like Hebrew text
    console.log('\n=== ALL HEBREW SECTIONS ===');
    const hebrewSections = withoutScripts.match(/[\u0590-\u05FF\s]{50,}/g);
    if (hebrewSections) {
      hebrewSections.slice(0, 5).forEach((section, i) => {
        console.log(`\nSection ${i + 1}:`, section.trim().substring(0, 100) + '...');
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the analysis
findTextContent();