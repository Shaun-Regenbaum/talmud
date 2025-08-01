import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock environment for tests
const mockEnv = {
  CORS_ORIGIN: '*',
  HEBREWBOOKS_KV: {
    get: vi.fn(),
    put: vi.fn()
  },
  BROWSER: {
    launch: vi.fn()
  }
};

// Import the worker
import worker from '../src/index.js';

describe('daf-supplier Worker', () => {
  describe('CORS handling', () => {
    test('should handle OPTIONS preflight requests', async () => {
      const request = new Request('https://example.com/api', {
        method: 'OPTIONS'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    });

    test('should include CORS headers in all responses', async () => {
      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Parameter validation', () => {
    test('should return 400 when mesechta is missing', async () => {
      const request = new Request('https://example.com/api?daf=20');
      
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required parameters: mesechta and daf');
    });

    test('should return 400 when daf is missing', async () => {
      const request = new Request('https://example.com/api?mesechta=15');
      
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required parameters: mesechta and daf');
    });

    test('should return 400 when both parameters are missing', async () => {
      const request = new Request('https://example.com/api');
      
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required parameters: mesechta and daf');
    });
  });

  describe('Cache functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should check KV cache before fetching', async () => {
      const cachedData = {
        mesechta: 15,
        daf: 20,
        mainText: 'Cached Gemara text',
        timestamp: Date.now() - 1000, // 1 second ago
      };
      
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(JSON.stringify(cachedData));
      
      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      
      expect(mockEnv.HEBREWBOOKS_KV.get).toHaveBeenCalledWith('hebrewbooks:15:20');
      expect(response.headers.get('X-Cache')).toBe('HIT');
      
      const data = await response.json();
      expect(data.mainText).toBe('Cached Gemara text');
    });

    test('should fetch new data when cache is expired', async () => {
      const oldCachedData = {
        mesechta: 15,
        daf: 20,
        mainText: 'Old cached text',
        timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
      };
      
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(JSON.stringify(oldCachedData));
      
      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('X-Cache')).toBe('MISS');
    });

    test('should cache fetched data', async () => {
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);
      
      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      await worker.fetch(request, mockEnv);
      
      expect(mockEnv.HEBREWBOOKS_KV.put).toHaveBeenCalled();
      const [key, value, options] = mockEnv.HEBREWBOOKS_KV.put.mock.calls[0];
      expect(key).toBe('hebrewbooks:15:20');
      expect(options.expirationTtl).toBe(7 * 24 * 60 * 60);
      
      const cachedData = JSON.parse(value);
      expect(cachedData.mesechta).toBe(15);
      expect(cachedData.daf).toBe(20);
    });
  });

  describe('Daf conversion', () => {
    test('should convert daf numbers correctly', async () => {
      const testCases = [
        { daf: 3, expectedPage: '2', expectedAmud: 'a' },
        { daf: 4, expectedPage: '2', expectedAmud: 'b' },
        { daf: 19, expectedPage: '10', expectedAmud: 'a' },
        { daf: 20, expectedPage: '10', expectedAmud: 'b' },
      ];

      for (const { daf, expectedPage, expectedAmud } of testCases) {
        mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);
        
        const request = new Request(`https://example.com/api?mesechta=15&daf=${daf}`);
        const response = await worker.fetch(request, mockEnv);
        const data = await response.json();
        
        expect(data.dafDisplay).toBe(expectedPage);
        expect(data.amud).toBe(expectedAmud);
      }
    });
  });

  describe('Tractate name mapping', () => {
    test('should map tractate numbers to names correctly', async () => {
      const testCases = [
        { mesechta: 1, expectedName: 'Berakhot' },
        { mesechta: 15, expectedName: 'Ketubot' },
        { mesechta: 29, expectedName: 'Zevachim' },
        { mesechta: 37, expectedName: 'Niddah' },
      ];

      for (const { mesechta, expectedName } of testCases) {
        mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);
        
        const request = new Request(`https://example.com/api?mesechta=${mesechta}&daf=2`);
        const response = await worker.fetch(request, mockEnv);
        const data = await response.json();
        
        expect(data.tractate).toBe(expectedName);
      }
    });

    test('should handle unknown tractate numbers', async () => {
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);
      
      const request = new Request('https://example.com/api?mesechta=99&daf=2');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(data.tractate).toBe('Tractate-99');
    });
  });

  describe('Text extraction with real Ketubot data', () => {
    const ketubotSampleHTML = `
      <html>
      <body>
        PDF Text
        <div class="shastext2">
          גיהוץ שלנו ככיבוס שלהם ואי אמרת
          ניעבד גיהוץ מעברא ליה חומרתא ההוא
          דאתא לקמיה דרבן גמליאל ב"ר אמר
          ליה רבי בעלתי ולא מצאתי דם
        </div>
        <div class="shastext3">
          <span class="five">גיהוץ. </span>לשיקיי"ר באבן הזכוכית: <span class="five">ככיבוס שלהן. </span>שהיו מימיהם
          יפים לכבס או סמנין יפים היו להן לכבס ובכיבוס שלנו אין הבגד
          מלובן עד שיהיה מגוהץ
        </div>
        <div class="shastext4">
          <div style="margin-bottom:3px;width:100%"><span class="shastitle7">בתולה </span><span class="five">אלמנה גרושה חלוצה. </span>נראה לפרש דלרבותא נקט
          חלוצה דסלקא דעתך אמינא כיון דשומרת יבם לא
          מיחסרא כניסה לחופה שהרי יבמה יבא עליה בעל כרחה וה"א
          דכנשואה דמיא קמ"ל: </div>
        </div>
      </body>
      </html>
    `;

    test('should extract text from Ketubot-style HTML structure', async () => {
      // Mock browser page that returns structured data
      const mockPage = {
        goto: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn().mockResolvedValue({
          mainText: `גיהוץ שלנו ככיבוס שלהם ואי אמרת ניעבד גיהוץ מעברא ליה חומרתא ההוא דאתא לקמיה דרבן גמליאל ב"ר אמר ליה רבי בעלתי ולא מצאתי דם אמרה ליה רבי עדיין בתולה אני`,
          rashi: `גיהוץ. לשיקיי"ר באבן הזכוכית: ככיבוס שלהן. שהיו מימיהם יפים לכבס או סמנין יפים היו להן לכבס ובכיבוס שלנו אין הבגד מלובן עד שיהיה מגוהץ`,
          tosafot: `בתולה אלמנה גרושה חלוצה. נראה לפרש דלרבותא נקט חלוצה דסלקא דעתך אמינא כיון דשומרת יבם לא מיחסרא כניסה לחופה שהרי יבמה יבא עליה בעל כרחה וה"א דכנשואה דמיא קמ"ל`,
          otherCommentaries: {}
        }),
        close: vi.fn()
      };

      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn()
      };

      mockEnv.BROWSER.launch.mockResolvedValueOnce(mockBrowser);
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.mainText).toContain('גיהוץ שלנו ככיבוס שלהם');
      expect(data.rashi).toContain('לשיקיי"ר באבן הזכוכית');
      expect(data.tosafot).toContain('בתולה אלמנה גרושה חלוצה');
    });

    test('should handle HebrewBooks iframe structure', async () => {
      const mockIframePage = {
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(`
          גמרא: גיהוץ שלנו ככיבוס שלהם
          רש"י: גיהוץ. לשיקיי"ר באבן הזכוכית
          תוספות: בתולה אלמנה גרושה חלוצה
        `),
        close: vi.fn()
      };

      const mockPage = {
        goto: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn().mockResolvedValue({
          iframeUrl: 'https://hebrewbooks.org/iframe/content.html'
        }),
        close: vi.fn()
      };

      const mockBrowser = {
        newPage: vi.fn()
          .mockResolvedValueOnce(mockPage)
          .mockResolvedValueOnce(mockIframePage),
        close: vi.fn()
      };

      mockEnv.BROWSER.launch.mockResolvedValueOnce(mockBrowser);
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.mainText).toContain('גיהוץ שלנו ככיבוס שלהם');
      expect(data.rashi).toContain('גיהוץ. לשיקיי"ר באבן הזכוכית');
      expect(data.tosafot).toContain('בתולה אלמנה גרושה חלוצה');
    });
  });

  describe('Error handling', () => {
    test('should handle browser launch failure gracefully', async () => {
      mockEnv.BROWSER.launch.mockRejectedValueOnce(new Error('Browser launch failed'));
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.mainText).toBeTruthy(); // Should return fallback data
    });

    test('should handle page navigation failure', async () => {
      const mockPage = {
        goto: vi.fn().mockRejectedValue(new Error('Navigation failed')),
        close: vi.fn()
      };

      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn()
      };

      mockEnv.BROWSER.launch.mockResolvedValueOnce(mockBrowser);
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
    });

    test('should handle missing browser binding', async () => {
      const envWithoutBrowser = { ...mockEnv, BROWSER: undefined };
      envWithoutBrowser.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, envWithoutBrowser);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.mainText).toBeTruthy();
    });
  });

  describe('Response format', () => {
    test('should include all required fields in response', async () => {
      mockEnv.HEBREWBOOKS_KV.get.mockResolvedValueOnce(null);

      const request = new Request('https://example.com/api?mesechta=15&daf=20');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();

      expect(data).toHaveProperty('mesechta', 15);
      expect(data).toHaveProperty('daf', 20);
      expect(data).toHaveProperty('dafDisplay', '10');
      expect(data).toHaveProperty('amud', 'b');
      expect(data).toHaveProperty('tractate', 'Ketubot');
      expect(data).toHaveProperty('mainText');
      expect(data).toHaveProperty('rashi');
      expect(data).toHaveProperty('tosafot');
      expect(data).toHaveProperty('otherCommentaries');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('source', 'hebrewbooks.org');
    });
  });
});