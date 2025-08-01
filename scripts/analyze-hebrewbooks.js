// Script to analyze what HebrewBooks actually returns
// This will help us understand the structure better

async function analyzeHebrewBooks() {
  const url = 'https://daf-supplier.402.workers.dev?mesechta=27&daf=44';
  
  console.log('Fetching from:', url);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('\n=== RESPONSE STRUCTURE ===');
    console.log('Keys:', Object.keys(data));
    console.log('Tractate:', data.tractate);
    console.log('Daf:', data.daf, data.amud);
    
    console.log('\n=== MAIN TEXT ANALYSIS ===');
    console.log('Length:', data.mainText.length);
    console.log('First 200 chars:', data.mainText.substring(0, 200));
    
    // Check for specific markers
    console.log('\n=== MARKER CHECKS ===');
    console.log('Contains "rashi;":', data.mainText.includes('rashi;'));
    console.log('Contains "tosafot:":', data.mainText.includes('tosafot:'));
    console.log('Contains "גמרא":', data.mainText.includes('גמרא'));
    console.log('Contains "רש"י":', data.mainText.includes('רש"י'));
    console.log('Contains "תוספות":', data.mainText.includes('תוספות'));
    
    // Check for iframe
    console.log('\n=== IFRAME CHECK ===');
    const iframeMatch = data.mainText.match(/<iframe[^>]*>/);
    if (iframeMatch) {
      console.log('Found iframe:', iframeMatch[0]);
      const srcMatch = data.mainText.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        console.log('Iframe src:', srcMatch[1]);
      }
    }
    
    // Look for actual text content
    console.log('\n=== TEXT CONTENT SEARCH ===');
    // Remove all HTML tags and scripts
    const cleanedText = data.mainText
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('Cleaned text length:', cleanedText.length);
    console.log('Cleaned text preview:', cleanedText.substring(0, 500));
    
    // Look for Hebrew text patterns
    const hebrewTextMatch = cleanedText.match(/[\u0590-\u05FF\s]{20,}/);
    if (hebrewTextMatch) {
      console.log('\n=== HEBREW TEXT FOUND ===');
      console.log('First Hebrew section:', hebrewTextMatch[0].trim());
    }
    
    // Check for PDF/Text buttons
    console.log('\n=== FORMAT OPTIONS ===');
    console.log('Contains "PDF":', data.mainText.includes('PDF'));
    console.log('Contains "Text":', data.mainText.includes('Text'));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the analysis
analyzeHebrewBooks();