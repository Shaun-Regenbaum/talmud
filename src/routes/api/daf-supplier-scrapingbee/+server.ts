/**
 * Daf Supplier API using ScrapingBee for production
 * This bypasses Cloudflare blocking issues by using ScrapingBee's proxy network
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS } from '$lib/api/hebrewbooks';

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

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
	const mesechta = url.searchParams.get('mesechta');
	const daf = url.searchParams.get('daf');
	const br = url.searchParams.get('br') === 'true';
	
	if (!mesechta || !daf) {
		return json({ error: 'Missing required parameters: mesechta and daf' }, { status: 400 });
	}

	// Include br parameter in cache key
	const cacheKey = `hebrewbooks:${mesechta}:${daf}:br=${br}`;
	
	// Check if we should bypass cache
	const bypassCache = url.searchParams.get('nocache') === 'true';
	
	// Check KV cache first (unless bypassing)
	if (platform?.env?.HEBREWBOOKS_KV && !bypassCache) {
		const cached = await platform.env.HEBREWBOOKS_KV.get(cacheKey);
		if (cached) {
			// Return cached data immediately
			return new Response(cached, {
				headers: { 
					'Content-Type': 'application/json',
					'X-Cache': 'HIT'
				}
			});
		}
	}

	// Get ScrapingBee API key
	const SCRAPINGBEE_API_KEY = platform?.env?.SCRAPINGBEE_API_KEY;
	if (!SCRAPINGBEE_API_KEY) {
		return json({ error: 'ScrapingBee API key not configured' }, { status: 503 });
	}

	try {
		// Convert daf-supplier format to HebrewBooks format
		const dafNum = parseInt(daf);
		const pageNum = Math.floor(dafNum / 2);
		const amud = dafNum % 2 === 0 ? 'a' : 'b';
		const hebrewBooksDaf = amud === 'a' ? pageNum.toString() : `${pageNum}b`;
		
		console.log(`Converting daf-supplier ${daf} -> HebrewBooks daf ${hebrewBooksDaf}`);
		
		// Build HebrewBooks URL
		const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${hebrewBooksDaf}&format=text`;
		console.log('Target URL:', targetUrl);
		
		// Use ScrapingBee API with JavaScript rendering
		const scrapingBeeUrl = new URL('https://app.scrapingbee.com/api/v1/');
		scrapingBeeUrl.searchParams.set('api_key', SCRAPINGBEE_API_KEY);
		scrapingBeeUrl.searchParams.set('url', targetUrl);
		scrapingBeeUrl.searchParams.set('render_js', 'true'); // Enable JavaScript rendering
		scrapingBeeUrl.searchParams.set('wait', '5000'); // Wait 5 seconds for content to load
		scrapingBeeUrl.searchParams.set('wait_for', '.shastext2,.shastext3,.shastext4,.shastext5,.shastext6,.shastext7,.shastext8'); // Wait for any shastext element
		scrapingBeeUrl.searchParams.set('premium_proxy', 'true'); // Use premium proxies
		scrapingBeeUrl.searchParams.set('country_code', 'us'); // Use US proxy
		scrapingBeeUrl.searchParams.set('block_ads', 'true'); // Block ads for cleaner extraction
		
		console.log('Fetching via ScrapingBee...');
		const response = await fetch(scrapingBeeUrl.toString());
		
		if (!response.ok) {
			console.error('ScrapingBee error:', response.status, response.statusText);
			const errorText = await response.text();
			console.error('Error details:', errorText);
			throw new Error(`ScrapingBee request failed: ${response.status}`);
		}
		
		const html = await response.text();
		console.log('Received HTML, length:', html.length);
		
		// Parse the HTML to extract text content more comprehensively
		// HebrewBooks uses varying class numbers for different sections
		const extractAllShastexts = (): { mainText: string; rashi: string; tosafot: string } => {
			const result = {
				mainText: '',
				rashi: '',
				tosafot: ''
			};
			
			// Find all shastext divs (shastext2 through shastext10)
			const shastextRegex = /<div[^>]*class="[^"]*shastext(\d+)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
			const matches = [...html.matchAll(shastextRegex)];
			
			console.log(`Found ${matches.length} shastext divs`);
			
			// Process each match and clean the text
			const cleanText = (text: string): string => {
				return text
					.replace(/<[^>]+>/g, ' ') // Remove HTML tags
					.replace(/&nbsp;/g, ' ')
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&#39;/g, "'")
					.replace(/\s+/g, ' ') // Normalize whitespace
					.trim();
			};
			
			// Group texts by their shastext number
			const textsByNumber: Record<string, string> = {};
			for (const match of matches) {
				const number = match[1];
				const text = cleanText(match[2]);
				if (text && text.length > 10) { // Ignore very short texts
					if (!textsByNumber[number]) {
						textsByNumber[number] = '';
					}
					textsByNumber[number] += (textsByNumber[number] ? '\n' : '') + text;
				}
			}
			
			console.log('Texts by shastext number:', Object.keys(textsByNumber));
			
			// Assign texts based on typical HebrewBooks patterns
			// Usually: shastext2-4 = Gemara, shastext5-6 = Rashi, shastext7-8 = Tosafot
			const numbers = Object.keys(textsByNumber).sort();
			
			if (numbers.length > 0) {
				// First shastext is usually the main Gemara text
				result.mainText = textsByNumber[numbers[0]] || '';
				
				// Second shastext is usually Rashi
				if (numbers.length > 1) {
					result.rashi = textsByNumber[numbers[1]] || '';
				}
				
				// Third shastext is usually Tosafot
				if (numbers.length > 2) {
					result.tosafot = textsByNumber[numbers[2]] || '';
				}
			}
			
			// Fallback: Try specific number patterns if above didn't work
			if (!result.mainText) {
				result.mainText = textsByNumber['2'] || textsByNumber['3'] || textsByNumber['4'] || '';
			}
			if (!result.rashi) {
				result.rashi = textsByNumber['5'] || textsByNumber['6'] || '';
			}
			if (!result.tosafot) {
				result.tosafot = textsByNumber['7'] || textsByNumber['8'] || '';
			}
			
			return result;
		};
		
		// Extract all texts
		const { mainText, rashi, tosafot } = extractAllShastexts();
		
		console.log('Extracted text lengths:', {
			mainText: mainText.length,
			rashi: rashi.length,
			tosafot: tosafot.length
		});
		
		// Format text with line breaks if requested
		const formatText = (text: string) => {
			if (!text || !br) return text;
			return text.replace(/\n/g, ' <br>');
		};
		
		// Get tractate name
		const TRACTATE_NAMES = MESECHTA_MAP;
		
		const responseData = {
			mesechta: parseInt(mesechta),
			daf: dafNum,
			dafDisplay: pageNum.toString(),
			amud: amud,
			tractate: TRACTATE_NAMES[mesechta] || `Tractate-${mesechta}`,
			mainText: formatText(mainText),
			rashi: formatText(rashi),
			tosafot: formatText(tosafot),
			otherCommentaries: {},
			timestamp: Date.now(),
			source: 'hebrewbooks.org',
			via: 'scrapingbee',
			debug: {
				scrapingBeeUrl: scrapingBeeUrl.toString().replace(SCRAPINGBEE_API_KEY, 'API_KEY_HIDDEN'),
				htmlLength: html.length,
				extractionSuccess: mainText.length > 0
			}
		};

		// Cache successful responses
		if (mainText.length > 100 && platform?.env?.HEBREWBOOKS_KV) {
			await platform.env.HEBREWBOOKS_KV.put(cacheKey, JSON.stringify(responseData), {
				expirationTtl: 7 * 24 * 60 * 60 // 7 days
			});
		}

		return json(responseData, {
			headers: { 
				'X-Cache': 'MISS',
				'X-Via': 'ScrapingBee'
			}
		});

	} catch (error) {
		console.error('ScrapingBee scraping error:', error);
		
		// Return empty data with error info for graceful degradation
		return json({
			error: 'Failed to fetch content',
			message: error instanceof Error ? error.message : 'Unknown error',
			mainText: '',
			rashi: '',
			tosafot: '',
			metadata: {
				tractate: MESECHTA_MAP[mesechta] || `Tractate-${mesechta}`,
				requestedDaf: daf,
				timestamp: new Date().toISOString()
			}
		}, { status: 206 }); // 206 Partial Content
	}
};