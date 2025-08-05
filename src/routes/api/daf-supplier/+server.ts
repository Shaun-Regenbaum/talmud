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

	const cacheKey = `hebrewbooks:${mesechta}:${daf}`;
	
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
	
	if (platform?.env?.BROWSER) {
		try {
			console.log('Browser binding available, attempting to launch...');
			// Launch browser using puppeteer.launch() with the binding
			const browser = await puppeteer.launch(platform.env.BROWSER, {
				// Keep browser alive for 2 minutes to allow for reuse
				keep_alive: 120000
			});
			console.log('Browser launched successfully');
			const page = await browser.newPage();
			
			// Set realistic browser headers to avoid Cloudflare detection
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1920, height: 1080 });
			
			// Set additional headers to appear more human-like
			await page.setExtraHTTPHeaders({
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
				'Accept-Language': 'en-US,en;q=0.9',
				'Accept-Encoding': 'gzip, deflate, br',
				'DNT': '1',
				'Connection': 'keep-alive',
				'Upgrade-Insecure-Requests': '1',
			});
			console.log('New page created');
			
			// Convert daf-supplier format back to HebrewBooks format
			// Fix: daf-supplier uses X*2 for Xa and X*2+1 for Xb
			// So daf=46 should be 23a (not 23b)
			const dafNum = parseInt(daf);
			const pageNum = Math.floor(dafNum / 2);
			const amud = dafNum % 2 === 0 ? 'a' : 'b';
			const hebrewBooksDaf = amud === 'a' ? pageNum.toString() : `${pageNum}b`;
			
			console.log(`Converting daf-supplier ${daf} -> HebrewBooks page ${pageNum}${amud} -> URL param ${hebrewBooksDaf}`);
			
			const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${hebrewBooksDaf}&format=text`;
			console.log('Navigating to:', targetUrl);
			
			// Add small random delay to appear more human-like
			const delay = 1000 + Math.random() * 2000; // 1-3 second delay
			console.log(`Adding human-like delay: ${Math.round(delay)}ms`);
			await new Promise(resolve => setTimeout(resolve, delay));
			
			await page.goto(targetUrl, { 
				waitUntil: 'networkidle0',
				timeout: 60000  // Increased timeout for Cloudflare challenge
			});
			
			// Check if we got a Cloudflare challenge page and wait for it to resolve
			const title = await page.title();
			console.log('Initial page title:', title);
			
			if (title.includes('Just a moment') || title.includes('Checking your browser')) {
				console.log('Detected Cloudflare challenge, waiting for resolution...');
				
				// Wait up to 30 seconds for the challenge to complete
				try {
					await page.waitForFunction(
						() => !document.title.includes('Just a moment') && !document.title.includes('Checking your browser'),
						{ timeout: 30000 }
					);
					console.log('Cloudflare challenge resolved, page title now:', await page.title());
				} catch (challengeError) {
					console.log('Cloudflare challenge did not resolve within 30 seconds');
					// Continue anyway, might still work
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

			// Close the page (but keep browser alive for reuse via keep_alive)
			await page.close();
			console.log('Page closed successfully, browser kept alive for reuse');
		} catch (browserError) {
			console.error('Browser rendering failed:', browserError.message);
			console.error('Browser error stack:', browserError.stack);
			// Continue to HTTP fetch fallback
		}
	} else {
		console.log('Browser binding not available');
	}
	
	// Fallback to regular HTTP fetch if browser rendering fails or is unavailable
	if (!pageData) {
		try {
			// Convert daf-supplier format to HebrewBooks format (same logic as browser version)
			const dafNum = parseInt(daf);
			const pageNum = Math.floor(dafNum / 2);
			const amud = dafNum % 2 === 0 ? 'a' : 'b';
			const hebrewBooksDaf = amud === 'a' ? pageNum.toString() : `${pageNum}b`;
			
			console.log(`HTTP fallback: Converting daf-supplier ${daf} -> HebrewBooks page ${pageNum}${amud} -> URL param ${hebrewBooksDaf}`);
			const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${hebrewBooksDaf}&format=text`;
			console.log('HTTP fetch fallback, URL:', targetUrl);
			const response = await fetch(targetUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; DafSupplier/1.0)',
					'Accept': 'text/html,application/xhtml+xml',
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const html = await response.text();
			
			// Simple text extraction without DOM
			const cleanText = (text) => text ? text.trim() : '';
			
			pageData = {
				mainText: '',
				rashi: '',
				tosafot: '',
				otherCommentaries: {}
			};

			// Remove scripts and styles first
			const cleanHtml = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
			
			console.log('HTTP fallback - looking for shastext elements in HTML...');
			
			// First try to extract from shastext elements in the HTML - preserve HTML structure
			const shastextMatches = [];
			
			// Find all shastext divs first
			const allShastextPositions = [];
			for (let i = 2; i <= 10; i++) {
				const pattern = new RegExp(`<div[^>]*class="shastext${i}"[^>]*>`, 'gi');
				let match;
				while ((match = pattern.exec(cleanHtml)) !== null) {
					allShastextPositions.push({
						num: i,
						start: match.index,
						startTag: match[0],
						startContent: match.index + match[0].length
					});
				}
			}
			
			// Sort by position
			allShastextPositions.sort((a, b) => a.start - b.start);
			
			// Extract content for each shastext
			for (let i = 0; i < allShastextPositions.length; i++) {
				const current = allShastextPositions[i];
				let endPos;
				
				if (i < allShastextPositions.length - 1) {
					endPos = allShastextPositions[i + 1].start;
				} else {
					const fieldsetClosePos = cleanHtml.indexOf('</fieldset>', current.startContent);
					endPos = fieldsetClosePos !== -1 ? fieldsetClosePos : cleanHtml.length;
				}
				
				// Extract the content - preserve all text within proper boundaries
				let content = cleanHtml.substring(current.startContent, endPos);
				
				// Find the proper closing </div> for this shastext element
				let divDepth = 1;
				let pos = 0;
				while (pos < content.length && divDepth > 0) {
					const nextOpenDiv = content.indexOf('<div', pos);
					const nextCloseDiv = content.indexOf('</div>', pos);
					
					if (nextCloseDiv === -1) break;
					
					if (nextOpenDiv === -1 || nextCloseDiv < nextOpenDiv) {
						divDepth--;
						pos = nextCloseDiv + 6;
						if (divDepth === 0) {
							content = content.substring(0, nextCloseDiv);
							break;
						}
					} else {
						divDepth++;
						pos = nextOpenDiv + 4;
					}
				}
				
				shastextMatches.push([current.startTag + content + '</div>', content]);
				console.log(`shastext${current.num} found with ${content.length} chars`);
			}
			
			console.log('Total shastext elements found in HTML:', shastextMatches.length);
			
			// Process the first available shastext as Gemara
			if (shastextMatches[0]) {
				let rawHTML = shastextMatches[0][1];
				console.log('Raw Gemara HTML length before cleaning:', rawHTML.length);
				
				// Decode HTML entities but preserve tags and newlines
				pageData.mainText = rawHTML
					.replace(/&nbsp;/g, ' ')
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&#039;/g, "'")
					.trim();
				
				console.log('First shastext HTML extracted length:', pageData.mainText.length);
				console.log('First shastext first 500 chars:', pageData.mainText.substring(0, 500));
			}
			
			// Process the second available shastext as Rashi - DO NOT CUT ANY CONTENT
			if (shastextMatches[1]) {
				// Preserve ALL HTML and decode entities
				pageData.rashi = shastextMatches[1][1]
					.replace(/&nbsp;/g, ' ')
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&#039;/g, "'")
					.trim();
				console.log('Second shastext (Rashi) HTML extracted length:', pageData.rashi.length);
			}
			
			// Process the third available shastext as Tosafot - DO NOT CUT ANY CONTENT
			if (shastextMatches[2]) {
				// Preserve ALL HTML and decode entities
				pageData.tosafot = shastextMatches[2][1]
					.replace(/&nbsp;/g, ' ')
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&#039;/g, "'")
					.trim();
				console.log('Third shastext (Tosafot) HTML extracted length:', pageData.tosafot.length);
			}
			
		} catch (fetchError) {
			console.error('HTTP fetch failed:', fetchError);
			
			// Return error if both methods fail
			return json({ 
				error: 'Failed to fetch from HebrewBooks', 
				details: fetchError.message 
			}, { status: 500 });
		}
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

		// Prepare response data
		const responseData = {
			mesechta: parseInt(mesechta),
			daf: parseInt(daf),
			dafDisplay: Math.ceil(parseInt(daf) / 2).toString(),
			amud: parseInt(daf) % 2 === 0 ? 'b' : 'a',
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