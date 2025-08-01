// Test script to verify HebrewBooks parsing logic
// Simulates the format: main text, "rashi;" marker, Rashi text, "tosafot:" marker, Tosafot text

// Sample text in the exact format from HebrewBooks
const sampleHebrewBooksText = `אמר רב יהודה אמר רב אסור לאדם שיאכל קודם שיתן מאכל לבהמתו שנאמר ונתתי עשב בשדך לבהמתך והדר ואכלת ושבעת. תנו רבנן שלשה אין נכנסין לגיהנם אלו הן הדר בארץ ישראל והמגדל בניו לתלמוד תורה והמבדיל על היין במוצאי שבתות. הדר בארץ ישראל מאי טעמא אמר ר' אלעזר כל הדר בארץ ישראל שרוי בלא עון.

rashi;

קודם שיתן מאכל לבהמתו - דכתיב ונתתי עשב בשדך לבהמתך ברישא והדר ואכלת ושבעת. אין נכנסין לגיהנם - שזכות ארץ ישראל מגינה עליהם. שרוי בלא עון - שאויר ארץ ישראל מכפר.

tosafot:

אסור לאדם שיאכל - אע"ג דבקרא כתיב ואכלת אחר ונתתי עשב לבהמתך מכל מקום כיון דהקדים הכתוב מאכל בהמה למאכל אדם ש"מ דאסור לאכול קודם. הדר בארץ ישראל - ודוקא הדר שם לשם מצוה אבל הדר שם לסחורה או לשאר דברים לא.`;

// The parsing logic from our scraper
function parseHebrewBooksText(allText) {
  const cleanText = (text) => {
    // Only trim start and end, preserve internal whitespace and newlines
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
console.log('Testing HebrewBooks parser with sample text...\n');
const parsed = parseHebrewBooksText(sampleHebrewBooksText);

console.log('=== PARSED MAIN TEXT ===');
console.log(parsed.mainText);
console.log('\n=== PARSED RASHI ===');
console.log(parsed.rashi);
console.log('\n=== PARSED TOSAFOT ===');
console.log(parsed.tosafot);

// Verify the parsing worked correctly
console.log('\n=== VERIFICATION ===');
console.log('Main text starts with:', parsed.mainText.substring(0, 50) + '...');
console.log('Rashi starts with:', parsed.rashi.substring(0, 50) + '...');
console.log('Tosafot starts with:', parsed.tosafot.substring(0, 50) + '...');
console.log('Main text length:', parsed.mainText.length);
console.log('Rashi length:', parsed.rashi.length);
console.log('Tosafot length:', parsed.tosafot.length);

// Check for preserved newlines
console.log('\n=== NEWLINE PRESERVATION CHECK ===');
console.log('Main text has', (parsed.mainText.match(/\n/g) || []).length, 'newlines');
console.log('Rashi has', (parsed.rashi.match(/\n/g) || []).length, 'newlines');
console.log('Tosafot has', (parsed.tosafot.match(/\n/g) || []).length, 'newlines');

// Export for use in mock API
const testData = {
  mesechta: 27,
  daf: 44,
  dafDisplay: '22',
  amud: 'b',
  ...parsed,
  timestamp: Date.now(),
  source: 'hebrewbooks.org'
};

console.log('\n=== FULL API RESPONSE FORMAT ===');
console.log(JSON.stringify(testData, null, 2));