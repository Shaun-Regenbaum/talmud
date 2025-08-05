/**
 * @fileoverview HebrewBooks API Endpoint - Browser-based scraping service
 * 
 * This endpoint scrapes HebrewBooks.org using Cloudflare Browser Rendering
 * to extract structured Talmud text. It caches results in KV storage for
 * 7 days to reduce browser rendering costs.
 * 
 * Features:
 * - Uses Cloudflare Browser Rendering API
 * - Extracts mainText, rashi, tosafot, and other commentaries
 * - Caches results for 7 days in KV storage
 * - Fallback to daf-supplier if browser rendering fails
 * 
 * GET /api/hebrewbooks?tractate=Berakhot&daf=2a
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/api/hebrewbooks';

/** Cache duration - 7 days */
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
/** Cache key prefix */
const CACHE_PREFIX = 'hebrewbooks:';

/**
 * GET /api/hebrewbooks - Fetch Talmud text from HebrewBooks.org
 * 
 * Query parameters:
 * - tractate: Tractate name (required)
 * - daf: Page in format "2a" or "2b" (required)
 * 
 * Returns:
 * - 200: Text data with mainText, rashi, tosafot, otherCommentaries
 * - 400: Missing required parameters or unknown tractate
 * - 404: Failed to fetch from HebrewBooks
 * - 500: Internal server error
 */
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
	const tractate = url.searchParams.get('tractate');
	const daf = url.searchParams.get('daf');
	
	if (!tractate || !daf) {
		return json({ error: 'Missing required parameters: tractate, daf' }, { status: 400 });
	}
	
	// Get mesechta ID for the tractate
	const mesechtaId = TRACTATE_IDS[tractate];
	if (!mesechtaId) {
		return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
	}
	
	// Create cache key
	const cacheKey = `${CACHE_PREFIX}${tractate}:${daf}`;
	
	// Check KV cache first
	if (platform?.env?.HEBREWBOOKS_KV) {
		try {
			const cached = await platform.env.HEBREWBOOKS_KV.get(cacheKey);
			if (cached) {
				const parsedCache = JSON.parse(cached);
				// Check if cache is still valid (7 days)
				if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
					return json({
						...parsedCache.data,
						cached: true,
						cacheAge: Date.now() - parsedCache.timestamp
					});
				}
			}
		} catch (error) {
			console.error('Cache read error:', error);
		}
	}
	
	// Prepare for browser rendering
	let pageData = null;
	let extractionMethod = 'none';
	
	// Try browser rendering if available
	if (platform?.env?.BROWSER) {
		try {
			console.log('Browser binding available, attempting to launch...');
			// Launch browser using Puppeteer
			const puppeteer = await import('@cloudflare/puppeteer');
			const browser = await puppeteer.launch(platform.env.BROWSER);
			console.log('Browser launched successfully');
			const page = await browser.newPage();
			console.log('New page created');
			
			// Convert daf format for HebrewBooks URL
			// "2a" -> "2", "2b" -> "2b"
			const pageNum = parseInt(daf.replace(/[ab]/, ''));
			const amud = daf.includes('b') ? 'b' : 'a';
			const hebrewBooksDaf = amud === 'a' ? pageNum.toString() : `${pageNum}b`;
			
			const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechtaId}&daf=${hebrewBooksDaf}&format=text`;
			console.log('Navigating to:', targetUrl);
			await page.goto(targetUrl, { waitUntil: 'networkidle0' });

			// Wait for the shastext content to load
			try {
				await page.waitForSelector('.shastext2, .shastext3, .shastext4, .shastext5, .shastext6, .shastext7, .shastext8, .shastext9, .shastext10', { timeout: 30000 });
				console.log('Page loaded, extracting content from shastext divs...');
			} catch (waitError) {
				console.log('Shastext elements not found, will try body extraction fallback');
			}

			// Extract text content from the HebrewBooks structure
			pageData = await page.evaluate(() => {
				// Preserve formatting function
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

				// Assign based on typical HebrewBooks layout
				if (shastext2) {
					data.mainText = preserveFormatting(shastext2);
				}
				
				if (shastext3) {
					data.rashi = preserveFormatting(shastext3);
				}
				
				if (shastext4) {
					data.tosafot = preserveFormatting(shastext4);
				}
				
				// Additional commentaries
				if (shastext5) data.otherCommentaries.shastext5 = preserveFormatting(shastext5);
				if (shastext6) data.otherCommentaries.shastext6 = preserveFormatting(shastext6);
				if (shastext7) data.otherCommentaries.shastext7 = preserveFormatting(shastext7);
				if (shastext8) data.otherCommentaries.shastext8 = preserveFormatting(shastext8);
				if (shastext9) data.otherCommentaries.shastext9 = preserveFormatting(shastext9);
				if (shastext10) data.otherCommentaries.shastext10 = preserveFormatting(shastext10);

				// If no shastext found, try body extraction as fallback
				if (!data.mainText && !data.rashi && !data.tosafot) {
					const bodyText = document.body?.innerText || '';
					if (bodyText) {
						data.mainText = bodyText;
					}
				}
				
				return data;
			});
			
			await page.close();
			await browser.close();
			
			extractionMethod = 'browser';
			console.log('Successfully extracted content via browser');
			
		} catch (error) {
			console.error('Browser extraction failed:', error);
			extractionMethod = 'browser-failed';
		}
	} else {
		console.log('Browser binding not available');
		extractionMethod = 'no-browser';
	}
	
	// If browser extraction failed or not available, fall back to external daf-supplier
	if (!pageData || (!pageData.mainText && !pageData.rashi && !pageData.tosafot)) {
		try {
			// Convert to daf-supplier format
			const dafForAPI = convertDafToHebrewBooksFormat(daf);
			const dafSupplierUrl = `https://daf-supplier.402.workers.dev?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
			
			const response = await fetch(dafSupplierUrl, {
				headers: {
					'User-Agent': 'TalmudApp/1.0',
				}
			});
			
			if (!response.ok) {
				return json({
					error: 'Failed to fetch from fallback source',
					status: response.status,
					details: await response.text()
				}, { status: 404 });
			}
			
			const fallbackData = await response.json();
			pageData = {
				mainText: fallbackData.mainText || '',
				rashi: fallbackData.rashi || '',
				tosafot: fallbackData.tosafot || '',
				otherCommentaries: fallbackData.otherCommentaries || {}
			};
			
			extractionMethod = 'fallback-daf-supplier';
			console.log('Used fallback daf-supplier');
			
		} catch (fallbackError) {
			console.error('Fallback to daf-supplier failed:', fallbackError);
			return json({
				error: 'Failed to fetch Talmud text',
				details: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
			}, { status: 500 });
		}
	}
	
	// Process the extracted data
	const processedData = {
		tractate,
		daf,
		...pageData,
		source: 'hebrewbooks.org',
		extractionMethod,
		timestamp: Date.now()
	};
	
	// Cache the result
	if (platform?.env?.HEBREWBOOKS_KV && extractionMethod !== 'fallback-daf-supplier') {
		try {
			const cacheData = {
				data: processedData,
				timestamp: Date.now()
			};
			await platform.env.HEBREWBOOKS_KV.put(cacheKey, JSON.stringify(cacheData), {
				expirationTtl: Math.floor(CACHE_DURATION / 1000) // KV expects seconds
			});
		} catch (error) {
			console.error('Cache write error:', error);
		}
	}
	
	return json(processedData);
};