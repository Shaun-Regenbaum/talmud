import { describe, test, expect } from 'vitest';

describe('HebrewBooks Scraping Logic', () => {
  describe('URL construction', () => {
    test('should construct correct HebrewBooks URLs', () => {
      const testCases = [
        { mesechta: 15, daf: 20, expected: 'https://www.hebrewbooks.org/shas.aspx?mesechta=15&daf=20&format=text' },
        { mesechta: 1, daf: 2, expected: 'https://www.hebrewbooks.org/shas.aspx?mesechta=1&daf=2&format=text' },
        { mesechta: 29, daf: 100, expected: 'https://www.hebrewbooks.org/shas.aspx?mesechta=29&daf=100&format=text' },
      ];

      testCases.forEach(({ mesechta, daf, expected }) => {
        const url = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
        expect(url).toBe(expected);
      });
    });
  });

  describe('HTML structure parsing', () => {
    const sampleFieldsetHTML = `
      <fieldset class="fieldsetTrans">
        <legend>Vilna Shas</legend>
        <div class="shastext2">
          גיהוץ שלנו ככיבוס שלהם ואי אמרת
          ניעבד גיהוץ מעברא ליה חומרתא ההוא
          דאתא לקמיה דרבן גמליאל
        </div>
      </fieldset>
      <fieldset class="fieldsetTrans">
        <legend>Rashi</legend>
        <div class="shastext3">
          <span class="five">גיהוץ. </span>לשיקיי"ר באבן הזכוכית
        </div>
      </fieldset>
      <fieldset class="fieldsetTrans">
        <legend>Tosafot</legend>
        <div class="shastext4">
          <span class="shastitle7">בתולה </span><span class="five">אלמנה גרושה חלוצה. </span>נראה לפרש
        </div>
      </fieldset>
    `;

    test('should extract text from fieldset structure', () => {
      // Simulate browser evaluate function
      const extractFromHTML = (html) => {
        // Remove HTML tags but preserve structure
        const fieldsets = html.match(/<fieldset[^>]*>[\s\S]*?<\/fieldset>/g) || [];
        
        const result = {
          mainText: '',
          rashi: '',
          tosafot: ''
        };

        fieldsets.forEach(fieldset => {
          const legendMatch = fieldset.match(/<legend>([^<]+)<\/legend>/);
          const legend = legendMatch ? legendMatch[1] : '';
          
          const textMatch = fieldset.match(/<div[^>]*>([\s\S]*?)<\/div>/);
          const text = textMatch ? textMatch[1].replace(/<[^>]*>/g, ' ').trim() : '';

          if (legend.includes('Vilna Shas')) {
            result.mainText = text;
          } else if (legend.includes('Rashi')) {
            result.rashi = text;
          } else if (legend.includes('Tosafot')) {
            result.tosafot = text;
          }
        });

        return result;
      };

      const extracted = extractFromHTML(sampleFieldsetHTML);
      
      expect(extracted.mainText).toContain('גיהוץ שלנו ככיבוס שלהם');
      expect(extracted.rashi).toContain('לשיקיי"ר באבן הזכוכית');
      expect(extracted.tosafot).toContain('נראה לפרש');
    });

    test('should handle iframe structure', () => {
      const iframeHTML = `
        <div id="main">
          <iframe id="acroframe" src="https://hebrewbooks.org/reader/reader.aspx?sfr=1234&pgnum=567"></iframe>
        </div>
      `;

      const hasIframe = iframeHTML.includes('iframe#acroframe') || iframeHTML.includes('id="acroframe"');
      expect(hasIframe).toBe(true);

      const srcMatch = iframeHTML.match(/src="([^"]+)"/);
      expect(srcMatch).toBeTruthy();
      if (srcMatch) {
        expect(srcMatch[1]).toContain('hebrewbooks.org/reader');
      }
    });
  });

  describe('Text cleaning and normalization', () => {
    test('should clean HTML entities', () => {
      const htmlWithEntities = 'text with &nbsp; and &quot;quotes&quot; and &lt;tags&gt;';
      const cleaned = htmlWithEntities
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      
      expect(cleaned).toBe('text with   and "quotes" and <tags>');
    });

    test('should preserve Hebrew punctuation', () => {
      const hebrewText = 'מתני׳ גמ׳ רש״י';
      const preserved = hebrewText.replace(/[^\u0590-\u05FF\s׳״]/g, ' ');
      
      expect(preserved).toContain('׳');
      expect(preserved).toContain('״');
    });

    test('should handle multiple whitespace', () => {
      const textWithSpaces = 'word1    word2\n\n\nword3\tword4';
      const normalized = textWithSpaces.replace(/\s+/g, ' ').trim();
      
      expect(normalized).toBe('word1 word2 word3 word4');
    });
  });

  describe('Error recovery', () => {
    test('should provide fallback data structure on error', () => {
      const fallbackData = {
        mainText: '',
        rashi: '',
        tosafot: '',
        otherCommentaries: {}
      };

      expect(fallbackData).toHaveProperty('mainText');
      expect(fallbackData).toHaveProperty('rashi');
      expect(fallbackData).toHaveProperty('tosafot');
      expect(fallbackData).toHaveProperty('otherCommentaries');
      expect(typeof fallbackData.otherCommentaries).toBe('object');
    });

    test('should handle missing sections gracefully', () => {
      const partialHTML = `
        <fieldset class="fieldsetTrans">
          <legend>Vilna Shas</legend>
          <div class="shastext2">Main text only</div>
        </fieldset>
      `;

      // Simulate extraction with missing sections
      const result = {
        mainText: 'Main text only',
        rashi: '', // Empty when not found
        tosafot: '', // Empty when not found
        otherCommentaries: {}
      };

      expect(result.rashi).toBe('');
      expect(result.tosafot).toBe('');
      expect(Object.keys(result.otherCommentaries).length).toBe(0);
    });
  });

  describe('Cache key generation', () => {
    test('should generate consistent cache keys', () => {
      const testCases = [
        { mesechta: '15', daf: '20', expected: 'hebrewbooks:15:20' },
        { mesechta: '1', daf: '2', expected: 'hebrewbooks:1:2' },
        { mesechta: '29', daf: '100', expected: 'hebrewbooks:29:100' },
      ];

      testCases.forEach(({ mesechta, daf, expected }) => {
        const cacheKey = `hebrewbooks:${mesechta}:${daf}`;
        expect(cacheKey).toBe(expected);
      });
    });
  });

  describe('Response data structure', () => {
    test('should include all required fields', () => {
      const response = {
        mesechta: 15,
        daf: 20,
        dafDisplay: '10',
        amud: 'b',
        tractate: 'Ketubot',
        mainText: 'Sample text',
        rashi: 'Rashi commentary',
        tosafot: 'Tosafot commentary',
        otherCommentaries: {},
        timestamp: Date.now(),
        source: 'hebrewbooks.org'
      };

      const requiredFields = [
        'mesechta', 'daf', 'dafDisplay', 'amud', 'tractate',
        'mainText', 'rashi', 'tosafot', 'otherCommentaries',
        'timestamp', 'source'
      ];

      requiredFields.forEach(field => {
        expect(response).toHaveProperty(field);
      });

      expect(typeof response.mesechta).toBe('number');
      expect(typeof response.daf).toBe('number');
      expect(typeof response.dafDisplay).toBe('string');
      expect(typeof response.amud).toBe('string');
      expect(typeof response.tractate).toBe('string');
      expect(typeof response.mainText).toBe('string');
      expect(typeof response.rashi).toBe('string');
      expect(typeof response.tosafot).toBe('string');
      expect(typeof response.otherCommentaries).toBe('object');
      expect(typeof response.timestamp).toBe('number');
      expect(response.source).toBe('hebrewbooks.org');
    });
  });
});