// Test script with HTML content as HebrewBooks might return it
// This simulates actual HTML with spans, line breaks, etc.

const sampleHebrewBooksHTML = `<span class="main">אמר רב יהודה אמר רב אסור לאדם שיאכל קודם שיתן מאכל לבהמתו
שנאמר ונתתי עשב בשדך לבהמתך והדר ואכלת ושבעת.</span>
<br />
<span class="main">תנו רבנן שלשה אין נכנסין לגיהנם אלו הן הדר בארץ ישראל
והמגדל בניו לתלמוד תורה והמבדיל על היין במוצאי שבתות.</span>
<br />
<span class="main">הדר בארץ ישראל מאי טעמא אמר ר' אלעזר כל הדר בארץ ישראל שרוי בלא עון.</span>

rashi;

<span class="rashi">קודם שיתן מאכל לבהמתו - דכתיב ונתתי עשב בשדך לבהמתך ברישא והדר ואכלת ושבעת.</span>
<br />
<span class="rashi">אין נכנסין לגיהנם - שזכות ארץ ישראל מגינה עליהם.</span>
<br />
<span class="rashi">שרוי בלא עון - שאויר ארץ ישראל מכפר.</span>

tosafot:

<span class="tosafot">אסור לאדם שיאכל - אע"ג דבקרא כתיב ואכלת אחר ונתתי עשב לבהמתך
מכל מקום כיון דהקדים הכתוב מאכל בהמה למאכל אדם ש"מ דאסור לאכול קודם.</span>
<br />
<span class="tosafot">הדר בארץ ישראל - ודוקא הדר שם לשם מצוה אבל הדר שם לסחורה או לשאר דברים לא.</span>`;

// The parsing logic from our scraper
function parseHebrewBooksText(allText) {
  const cleanText = (text) => {
    // Only trim start and end, preserve internal whitespace, newlines, and HTML
    return text ? text.trim() : '';
  };

  const data = {
    mainText: '',
    rashi: '',
    tosafot: '',
    otherCommentaries: {}
  };

  // Check if text contains rashi; and tosafot: markers
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
    // Fallback if no markers found
    data.mainText = cleanText(allText);
  }

  return data;
}

// Test the parser
console.log('Testing HebrewBooks parser with HTML content...\n');
const parsed = parseHebrewBooksText(sampleHebrewBooksHTML);

console.log('=== PARSED MAIN TEXT (RAW) ===');
console.log(JSON.stringify(parsed.mainText));
console.log('\n=== PARSED RASHI (RAW) ===');
console.log(JSON.stringify(parsed.rashi));
console.log('\n=== PARSED TOSAFOT (RAW) ===');
console.log(JSON.stringify(parsed.tosafot));

// Check for preserved HTML and newlines
console.log('\n=== HTML & NEWLINE PRESERVATION CHECK ===');
console.log('Main text has', (parsed.mainText.match(/\n/g) || []).length, 'newlines');
console.log('Main text has', (parsed.mainText.match(/<br\s*\/?>/gi) || []).length, '<br> tags');
console.log('Main text has', (parsed.mainText.match(/<span/gi) || []).length, '<span> tags');
console.log('Rashi has', (parsed.rashi.match(/\n/g) || []).length, 'newlines');
console.log('Rashi has', (parsed.rashi.match(/<br\s*\/?>/gi) || []).length, '<br> tags');
console.log('Rashi has', (parsed.rashi.match(/<span/gi) || []).length, '<span> tags');
console.log('Tosafot has', (parsed.tosafot.match(/\n/g) || []).length, 'newlines');
console.log('Tosafot has', (parsed.tosafot.match(/<br\s*\/?>/gi) || []).length, '<br> tags');
console.log('Tosafot has', (parsed.tosafot.match(/<span/gi) || []).length, '<span> tags');

// Preview the formatted output for daf-renderer
console.log('\n=== PREVIEW FOR DAF-RENDERER ===');
const formatForDafRenderer = (text, prefix) => {
  if (!text || text.trim() === '') {
    return `<span class='sentence' id='sentence-${prefix}-0'></span>`;
  }
  
  // In real usage, we'd process the HTML and convert it to daf-renderer format
  // For now, let's show what we have
  return text.substring(0, 150) + '...';
};

console.log('Main formatted:', formatForDafRenderer(parsed.mainText, 'main'));
console.log('Rashi formatted:', formatForDafRenderer(parsed.rashi, 'rashi'));
console.log('Tosafot formatted:', formatForDafRenderer(parsed.tosafot, 'tosafot'));