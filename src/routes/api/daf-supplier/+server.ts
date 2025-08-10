/**
 * @fileoverview Daf Supplier API Endpoint - Internal API for Talmud text
 * 
 * This endpoint provides a compatibility layer for the daf-supplier API format,
 * used internally by the application. It fetches data from the HebrewBooks API
 * and transforms it to match the expected daf-supplier response format.
 * 
 * Features:
 * - Converts mesechta numbers to tractate names
 * - Transforms sequential daf numbers to page/amud format
 * - Optionally converts newlines to <br> tags
 * - Provides debug information about extraction methods
 * 
 * GET /api/daf-supplier?mesechta=1&daf=3&br=true
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS } from '$lib/api/hebrewbooks';
// @ts-ignore - Cloudflare Puppeteer types might not be perfect
import puppeteer from '@cloudflare/puppeteer';

/** Map mesechta ID numbers to tractate names */
const MESECHTA_MAP: Record<string, string> = {
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

/**
 * GET /api/daf-supplier - Fetch Talmud text in daf-supplier format
 * 
 * Query parameters:
 * - mesechta: Numeric ID of the tractate (1-37) (required)
 * - daf: Sequential daf number (3=2a, 4=2b, etc.) (required)
 * - br: Convert newlines to <br> tags if 'true' (optional)
 * 
 * Returns:
 * - 200: Text data in daf-supplier format with mainText, rashi, tosafot
 * - 400: Missing parameters or invalid mesechta number
 * - 500: Internal server error or fetch failure
 * 
 * Response format:
 * {
 *   mesechta: number,
 *   daf: number,
 *   dafDisplay: string,
 *   amud: 'a' | 'b',
 *   tractate: string,
 *   mainText: string,
 *   rashi: string,
 *   tosafot: string,
 *   otherCommentaries: object,
 *   timestamp: number,
 *   source: string,
 *   debug: object
 * }
 */
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
	const mesechta = url.searchParams.get('mesechta');
	const daf = url.searchParams.get('daf');
	const br = url.searchParams.get('br') === 'true';
	
	if (!mesechta || !daf) {
		return json({ error: 'Missing required parameters: mesechta and daf' }, { status: 400 });
	}

	// Include br parameter in cache key to cache both versions separately
	const cacheKey = `hebrewbooks:${mesechta}:${daf}:br=${br}`;
	
	// Check if we should bypass cache
	const bypassCache = url.searchParams.get('nocache') === 'true';
	
	// Check KV cache first (unless bypassing)
	if (platform?.env?.HEBREWBOOKS_KV && !bypassCache) {
		const cached = await platform.env.HEBREWBOOKS_KV.get(cacheKey);
		if (cached) {
			// Return cached data immediately - no expiration check
			return new Response(cached, {
				headers: { 
					'Content-Type': 'application/json',
					'X-Cache': 'HIT'
				}
			});
		}
	}

	// First try browser rendering if available
	let pageData = null;
	let botProtectionDetected = false;
	
	if (platform?.env?.BROWSER) {
		// Try Method 1: Modern puppeteer approach with anti-detection
		try {
			console.log('Browser binding available, trying puppeteer.launch() method...');
			console.log('Browser binding type:', typeof platform.env.BROWSER);
			console.log('Browser binding keys:', platform.env.BROWSER ? Object.keys(platform.env.BROWSER) : 'null');
			
			// Launch browser with proper error handling
			let browser;
			try {
				// Don't pass options - they may not be supported in production
				browser = await puppeteer.launch(platform.env.BROWSER);
			} catch (launchError: any) {
				console.error('Failed to launch browser:', launchError.message);
				console.error('Launch error details:', launchError);
				throw new Error(`Browser launch failed: ${launchError.message}`);
			}
			console.log('Browser launched successfully');
			const page = await browser.newPage();
			
			// Set more realistic browser headers with randomization
			const userAgents = [
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
			];
			const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
			await page.setUserAgent(randomUA);
			
			// Random viewport sizes
			const viewports = [
				{ width: 1920, height: 1080 },
				{ width: 1366, height: 768 },
				{ width: 1440, height: 900 }
			];
			const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
			await page.setViewport(randomViewport);
			
			// Set additional headers to appear more human-like
			await page.setExtraHTTPHeaders({
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
				'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
				'Accept-Encoding': 'gzip, deflate, br',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
				'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
				'Sec-Ch-Ua-Mobile': '?0',
				'Sec-Ch-Ua-Platform': '"Windows"',
				'Sec-Fetch-Dest': 'document',
				'Sec-Fetch-Mode': 'navigate',
				'Sec-Fetch-Site': 'none',
				'Sec-Fetch-User': '?1',
				'Upgrade-Insecure-Requests': '1'
			});
			
			// Enable JavaScript and cookies
			await page.setJavaScriptEnabled(true);
			await page.setCacheEnabled(false);
			console.log('New page created');
			
			// Convert daf-supplier format back to HebrewBooks format
			// daf-supplier: 2a=2, 2b=3, 3a=4, 3b=5, etc.
			// HebrewBooks: 2a=2, 2b=2b, 3a=3, 3b=3b, etc.
			const dafNum = parseInt(daf);
			const pageNum = Math.floor(dafNum / 2);
			const amud = dafNum % 2 === 0 ? 'a' : 'b';
			const hebrewBooksDaf = amud === 'a' ? pageNum.toString() : `${pageNum}b`;
			
			console.log(`Converting daf-supplier ${daf} -> HebrewBooks daf ${hebrewBooksDaf}`);
			
			const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${hebrewBooksDaf}&format=text`;
			console.log('Navigating to:', targetUrl);
			
			// First navigate to the homepage to establish cookies
			console.log('First visiting homepage to establish session...');
			await page.goto('https://www.hebrewbooks.org', { 
				waitUntil: 'domcontentloaded',
				timeout: 30000
			});
			
			// Wait a bit to let any initial scripts run
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Now navigate to the actual page
			console.log('Now navigating to target page...');
			await page.goto(targetUrl, { 
				waitUntil: 'networkidle0',
				timeout: 60000  // Increased timeout for Cloudflare challenge
			});
			
			// Check if we got a Cloudflare challenge page and wait for it to resolve
			const title = await page.title();
			console.log('Initial page title:', title);
			
			if (title.includes('Just a moment') || title.includes('Checking your browser')) {
				console.log('Detected Cloudflare challenge with puppeteer method, waiting for resolution...');
				botProtectionDetected = true;
				
				// Wait up to 30 seconds for the challenge to complete
				try {
					await page.waitForFunction(
						() => !document.title.includes('Just a moment') && !document.title.includes('Checking your browser'),
						{ timeout: 30000 }
					);
					console.log('Cloudflare challenge resolved, page title now:', await page.title());
					botProtectionDetected = false; // Challenge was resolved
				} catch (challengeError) {
					console.log('Cloudflare challenge did not resolve within 30 seconds');
					await page.close();
					throw new Error('Bot protection detected with puppeteer method');
				}
			}

			// Wait for the shastext content to load - try shastext2 through shastext10
			try {
				await page.waitForSelector('.shastext2, .shastext3, .shastext4, .shastext5, .shastext6, .shastext7, .shastext8, .shastext9, .shastext10', { timeout: 30000 });
				console.log('Page loaded, extracting content from shastext divs...');
			} catch (waitError) {
				console.log('Shastext elements not found, will try body extraction fallback');
				
				// Debug: Check what's actually on the page
				const pageContent = await page.content();
				console.log('Page title:', await page.title());
				console.log('Page URL:', page.url());
				console.log('Page contains shastext:', pageContent.includes('shastext'));
				console.log('Page contains fieldset:', pageContent.includes('fieldset'));
				console.log('Page length:', pageContent.length);
				console.log('First 1000 chars of page:', pageContent.substring(0, 1000));
			}

			// Extract text content from the HebrewBooks structure
			console.log('Starting page.evaluate() extraction...');
			try {
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

				// Look for shastext2 through shastext10 elements
				const shastext2 = document.querySelector('.shastext2');
				const shastext3 = document.querySelector('.shastext3'); 
				const shastext4 = document.querySelector('.shastext4');
				const shastext5 = document.querySelector('.shastext5');
				const shastext6 = document.querySelector('.shastext6');
				const shastext7 = document.querySelector('.shastext7');
				const shastext8 = document.querySelector('.shastext8');
				const shastext9 = document.querySelector('.shastext9');
				const shastext10 = document.querySelector('.shastext10');

				console.log('Found shastext2:', !!shastext2);
				console.log('Found shastext3:', !!shastext3);
				console.log('Found shastext4:', !!shastext4);
				console.log('Found shastext5:', !!shastext5);
				console.log('Found shastext6:', !!shastext6);
				console.log('Found shastext7:', !!shastext7);
				console.log('Found shastext8:', !!shastext8);
				console.log('Found shastext9:', !!shastext9);
				console.log('Found shastext10:', !!shastext10);

				// Find which shastext elements are available (they might be numbered differently in different tractates)
				const shastextElements = [shastext2, shastext3, shastext4, shastext5, shastext6, shastext7, shastext8, shastext9, shastext10].filter(el => el !== null);
				console.log('Total shastext elements found:', shastextElements.length);

				// Extract from first available shastext (typically Gemara) - preserve HTML but clean navigation
				if (shastextElements[0]) {
					let rawHTML = preserveFormatting(shastextElements[0]);
					console.log('Raw Gemara HTML length before cleaning:', rawHTML.length);
					
					// Only remove navigation headers, not actual content
					// Look for common navigation patterns at the very start
					const navPatterns = [
						/^.*?בבלי מסכת.*?דף.*?עמוד.*?[\n\r]+/m, // Page header
						/^.*?היברו בוקס.*?[\n\r]+/m, // HebrewBooks branding
						/^.*?ברכות שבת עירובין.*?נידה.*?[\n\r]+/m // Tractate navigation
					];
					
					for (const pattern of navPatterns) {
						rawHTML = rawHTML.replace(pattern, '');
					}
					
					// Don't cut content based on markers - preserve all text from shastext elements
					// The navigation patterns above should be sufficient to remove headers
					console.log('Preserving all shastext content without marker-based cutting');
					
					data.mainText = rawHTML;
					console.log('First shastext HTML length after cleaning:', data.mainText.length);
					console.log('First shastext first 500 chars:', data.mainText.substring(0, 500));
				} else {
					// If no shastext elements found, try to extract any text content from the page body
					console.log('No shastext elements found, trying to extract from page body...');
					const bodyText = document.body ? document.body.innerText : '';
					console.log('Body text length:', bodyText.length);
					console.log('Body text first 500 chars:', bodyText.substring(0, 500));
					
					// Only use body text if it contains Hebrew characters and has substantial content
					if (bodyText.length > 100 && /[\u0590-\u05FF]/.test(bodyText)) {
						data.mainText = bodyText;
						console.log('Using body text as main text');
					} else {
						console.log('Body text insufficient, no Hebrew content found');
					}
				}

				// Extract from second available shastext (typically Rashi) - preserve ALL HTML
				if (shastextElements[1]) {
					data.rashi = preserveFormatting(shastextElements[1]);
					console.log('Second shastext (Rashi) HTML length:', data.rashi.length);
					console.log('Second shastext first 500 chars:', data.rashi.substring(0, 500));
					console.log('Second shastext last 200 chars:', data.rashi.substring(data.rashi.length - 200));
				}

				// Extract from third available shastext (typically Tosafot) - preserve ALL HTML
				if (shastextElements[2]) {
					data.tosafot = preserveFormatting(shastextElements[2]);
					console.log('Third shastext (Tosafot) HTML length:', data.tosafot.length);
					console.log('Third shastext first 500 chars:', data.tosafot.substring(0, 500));
					console.log('Third shastext last 200 chars:', data.tosafot.substring(data.tosafot.length - 200));
				}

				return data;
			});
			console.log('page.evaluate() completed successfully');
			
			} catch (evaluateError) {
				console.error('page.evaluate() failed:', evaluateError.message);
				// Set empty pageData so we fall back to HTTP
				pageData = null;
			}

			// Close the page and browser
			await page.close();
			await browser.close();
			console.log('Page and browser closed successfully');
		} catch (browserError) {
			console.error('Browser rendering failed:', browserError.message);
			console.error('Browser error stack:', browserError.stack);
			console.error('Browser error full details:', JSON.stringify(browserError, null, 2));
			// Set pageData to null so we return error below
			pageData = null;
		}
	} else {
		console.log('Browser binding not available');
	}
	
	// If browser rendering failed or is unavailable, try ScrapingBee as fallback
	if (!pageData) {
		console.error('Browser rendering failed, trying ScrapingBee fallback...');
		
		// Check if ScrapingBee is available
		const SCRAPINGBEE_API_KEY = platform?.env?.SCRAPINGBEE_API_KEY;
		if (SCRAPINGBEE_API_KEY) {
			try {
				// Forward the request to the ScrapingBee endpoint
				const scrapingBeeUrl = new URL('/api/daf-supplier-scrapingbee', url.origin);
				scrapingBeeUrl.search = url.search; // Copy all query params
				
				console.log('Forwarding to ScrapingBee endpoint:', scrapingBeeUrl.toString());
				const scrapingBeeResponse = await fetch(scrapingBeeUrl.toString());
				
				if (scrapingBeeResponse.ok) {
					const scrapingBeeData = await scrapingBeeResponse.json();
					console.log('ScrapingBee fallback successful');
					return json(scrapingBeeData, {
						headers: {
							'X-Cache': 'MISS',
							'X-Fallback': 'ScrapingBee'
						}
					});
				}
			} catch (error) {
				console.error('ScrapingBee fallback failed:', error);
			}
		}
		
		// Check if we have any cached data for this page (even if expired)
		if (platform?.env?.HEBREWBOOKS_KV) {
			const anyCached = await platform.env.HEBREWBOOKS_KV.get(cacheKey);
			if (anyCached) {
				console.log('Returning expired cache due to all methods failing');
				return new Response(anyCached, {
					headers: { 
						'Content-Type': 'application/json',
						'X-Cache': 'EXPIRED-FALLBACK',
						'X-Error': 'All scraping methods failed, returning cached data'
					}
				});
			}
		}
		
		// Return a placeholder response with error info
		const errorResponse = { 
			error: 'Content temporarily unavailable', 
			message: 'Unable to fetch content at this time. Please try again later.',
			mainText: '', // Empty text so the app can still function
			rashi: '',
			tosafot: '',
			metadata: {
				browserAvailable: !!platform?.env?.BROWSER,
				scrapingBeeAvailable: !!SCRAPINGBEE_API_KEY,
				tractate: MESECHTA_MAP[mesechta] || `Tractate-${mesechta}`,
				requestedDaf: daf,
				timestamp: new Date().toISOString(),
				suggestion: 'The service should recover shortly. Please try again in a few minutes.'
			}
		};
		console.error('Returning error response with empty data:', JSON.stringify(errorResponse, null, 2));
		return json(errorResponse, { status: 206 }); // 206 Partial Content
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

		// Helper function to convert newlines to <br> tags with spaces if requested
		const formatText = (text) => {
			if (!text) return text;
			if (!br) return text;
			
			return text
				// Replace Windows-style line endings (\r\n) with space + word break opportunity
				.replace(/\r\n/g, ' <br>')
				// Replace Unix-style line endings (\n) with space + word break opportunity  
				.replace(/\n/g, ' <br>')
				// Handle any remaining standalone \r (old Mac style)
				.replace(/\r/g, ' <br>');
		};

		// Check if bot protection was detected and no content was retrieved
		if (botProtectionDetected && (!pageData || (!pageData.mainText && !pageData.rashi && !pageData.tosafot))) {
			// Return user-friendly bot protection error
			return json({ 
				error: 'HebrewBooks Bot Protection Active',
				message: 'HebrewBooks.org is currently blocking automated access with a "Just a moment..." challenge page. This prevents us from extracting the Talmud text.',
				suggestions: [
					'Try again in a few minutes - the protection may be temporary',
					'Check if cached data is available for other pages',
					'The protection typically resolves automatically after some time'
				],
				details: {
					tractate: TRACTATE_NAMES[mesechta] || `Tractate-${mesechta}`,
					requestedPage: `${Math.floor(parseInt(daf) / 2)}${parseInt(daf) % 2 === 0 ? 'a' : 'b'}`,
					cacheChecked: true,
					browserMethodsTried: ['puppeteer.launch', 'platform.env.BROWSER.launch'],
					timestamp: Date.now()
				}
			}, { status: 503 }); // Service Temporarily Unavailable
		}

		// Prepare response data
		const dafNum = parseInt(daf);
		const pageNum = Math.floor(dafNum / 2);
		const amud = dafNum % 2 === 0 ? 'a' : 'b';
		
		const responseData = {
			mesechta: parseInt(mesechta),
			daf: dafNum,
			dafDisplay: pageNum.toString(),
			amud: amud,
			tractate: TRACTATE_NAMES[mesechta] || `Tractate-${mesechta}`,
			mainText: formatText(pageData.mainText),
			rashi: formatText(pageData.rashi),
			tosafot: formatText(pageData.tosafot),
			otherCommentaries: pageData.otherCommentaries || {},
			timestamp: Date.now(),
			source: 'hebrewbooks.org',
			debug: {
				browserAvailable: !!platform?.env?.BROWSER,
				extractionMethod: pageData ? 'browser' : 'http'
			}
		};

		// Cache in KV
		if (platform?.env?.HEBREWBOOKS_KV) {
			await platform.env.HEBREWBOOKS_KV.put(cacheKey, JSON.stringify(responseData), {
				expirationTtl: 7 * 24 * 60 * 60 // 7 days
			});
		}

		return json(responseData, {
			headers: { 
				'X-Cache': 'MISS'
			}
		});

	} catch (error) {
		console.error('Browser rendering error:', error);
		return json({ 
			error: 'Failed to scrape page', 
			details: error.message 
		}, { status: 500 });
	}
};