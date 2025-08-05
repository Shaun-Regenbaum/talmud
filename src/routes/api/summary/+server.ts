/**
 * @fileoverview Summary API Endpoint - Generates AI-powered page summaries
 * 
 * This endpoint generates engaging summaries of Talmud pages using OpenRouter AI.
 * Features:
 * - Caches summaries for 24 hours to reduce API costs
 * - Falls back to in-memory cache in development
 * - Supports forced refresh to regenerate summaries
 * - Uses Claude Sonnet 4 for high-quality summaries
 * 
 * GET /api/summary?tractate=Berakhot&page=2&amud=a
 * POST /api/summary with { tractate, page, amud, mainText }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/api/hebrewbooks';

/** Cache duration for summaries */
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
/** Cache key prefix for KV storage */
const CACHE_PREFIX = 'talmud-summary:';

/** In-memory cache fallback for development */
const memoryCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Get cached summary from KV storage or memory
 * @param {string} cacheKey - Cache key for the summary
 * @param {any} platform - Platform object with KV bindings
 * @returns {Promise<any|null>} Cached summary data or null if not found/expired
 */
async function getCachedSummary(cacheKey: string, platform?: any): Promise<any | null> {
	if (platform?.env?.SUMMARIES_KV) {
		try {
			const cached = await platform.env.SUMMARIES_KV.get(cacheKey);
			if (cached) {
				const parsedCache = JSON.parse(cached);
				// Check if cache is still valid (24 hours)
				if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
					return parsedCache.data;
				} else {
					// Remove expired cache
					await platform.env.SUMMARIES_KV.delete(cacheKey);
				}
			}
		} catch (error) {
			console.error('KV cache read error:', error);
		}
	}
	
	// Fallback to memory cache
	const cached = memoryCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
		return cached.data;
	}
	
	return null;
}

/**
 * Store summary in cache (KV storage or memory)
 * @param {string} cacheKey - Cache key for the summary
 * @param {any} data - Summary data to cache
 * @param {any} platform - Platform object with KV bindings
 */
async function setCachedSummary(cacheKey: string, data: any, platform?: any): Promise<void> {
	const cacheData = {
		data,
		timestamp: Date.now()
	};

	if (platform?.env?.SUMMARIES_KV) {
		try {
			await platform.env.SUMMARIES_KV.put(cacheKey, JSON.stringify(cacheData), {
				expirationTtl: Math.floor(CACHE_DURATION / 1000) // KV expects seconds
			});
			return;
		} catch (error) {
			console.error('KV cache write error:', error);
		}
	}
	
	// Fallback to memory cache
	memoryCache.set(cacheKey, cacheData);
}

/**
 * GET /api/summary - Generate or retrieve cached summary for a Talmud page
 * 
 * Query parameters:
 * - tractate: Tractate name (required)
 * - page: Page number (required)
 * - amud: Side of page 'a' or 'b' (required)
 * - refresh: Force regenerate summary if 'true' (optional)
 * 
 * Returns:
 * - 200: Summary data with model info and word count
 * - 400: Missing required parameters or insufficient content
 * - 503: OpenRouter API not configured
 * - 500: Generation error
 */
export const GET: RequestHandler = async ({ url, fetch, platform }) => {
	const tractate = url.searchParams.get('tractate');
	const page = url.searchParams.get('page');
	const amud = url.searchParams.get('amud');
	const refresh = url.searchParams.get('refresh') === 'true';
	
	if (!tractate || !page || !amud) {
		return json({ error: 'Missing required parameters: tractate, page, amud' }, { status: 400 });
	}

	// Create cache key
	const cacheKey = `${CACHE_PREFIX}${tractate}:${page}${amud}`;
	
	try {
		// Check cache first (unless refresh is requested)
		if (!refresh) {
			const cachedSummary = await getCachedSummary(cacheKey, platform);
			if (cachedSummary) {
				return json({
					...cachedSummary,
					cached: true,
					cacheKey
				});
			}
		}

		// Get API key from platform.env (Cloudflare Workers runtime)
		const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			return json({ error: 'OpenRouter API not configured' }, { status: 503 });
		}

		// Convert from Sefaria format (2a, 2b) to daf-supplier format
		const dafForAPI = convertDafToHebrewBooksFormat(`${page}${amud}`);
		
		// Use daf-supplier directly to get structured data
		const mesechtaId = TRACTATE_IDS[tractate];
		if (!mesechtaId) {
			return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
		}
		
		let mainText = '';
		
		// Try to use our internal daf-supplier endpoint directly
		try {
			const internalUrl = new URL('/api/daf-supplier', url.origin);
			internalUrl.searchParams.set('mesechta', mesechtaId);
			internalUrl.searchParams.set('daf', dafForAPI.toString());
			internalUrl.searchParams.set('br', 'true');
			
			console.log(`Fetching from internal daf-supplier: ${internalUrl.toString()}`);
			const dafResponse = await fetch(internalUrl.toString());
			if (!dafResponse.ok) {
				throw new Error(`Failed to fetch from internal daf-supplier: ${dafResponse.status}`);
			}
			
			const dafData = await dafResponse.json();
			mainText = dafData.mainText || '';
			console.log(`Got mainText from daf-supplier, length: ${mainText.length}`);
			
			// Continue with summary generation below
		} catch (error) {
			console.error('Error fetching from internal daf-supplier:', error);
			// Fall back to client fetch mode
			const dafSupplierUrl = `/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
			return json({
				requiresClientFetch: true,
				dafSupplierUrl,
				tractate,
				page,
				amud,
				message: 'Client should fetch from dafSupplierUrl and POST the mainText back'
			});
		}
		
		// Check if we have mainText to generate summary
		if (!mainText || mainText.length < 50) {
			return json({ error: 'Insufficient content for summary generation', length: mainText?.length }, { status: 400 });
		}
		
		// Generate summary using OpenRouter
		const contextInfo = `${tractate} ${page}${amud}`;
		const summaryPrompt = `You are a learned rabbi writing in the style of Rabbi Jonathan Sacks or for a Koren publication. Summarize ${contextInfo} with depth and warmth, but without excessive jargon.

Capture the essence of this page:
• What question drives this discussion and why does it matter?
• Who are the key rabbis and what are their positions?
• What's the logical flow of the argument?
• What deeper principle or insight emerges?
• How does this connect to Jewish life and thought?

Write 2-3 flowing paragraphs that make the discussion come alive. Use a tone that's learned but accessible - like you're teaching intelligent adults who want to understand the beauty of Talmudic reasoning.

**Formatting guidelines:**
- **Bold** for rabbi names and central concepts
- *Italics* for Hebrew/Aramaic terms, followed by translation
- Write with dignity and clarity
- Avoid both dry academic language and excessive yeshivish terminology

Aim for the voice of someone who deeply loves this learning and wants to share its wisdom - knowledgeable but never condescending, warm but not overly familiar.

Talmud text: ${mainText.slice(0, 3000)}`;

		// Call OpenRouter API
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openRouterApiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://talmud.app',
				'X-Title': 'Talmud Study App'
			},
			body: JSON.stringify({
				model: 'anthropic/claude-sonnet-4',
				messages: [
					{ role: 'user', content: summaryPrompt }
				],
				temperature: 0.7,
				max_tokens: 800
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('OpenRouter API error:', {
				status: response.status,
				statusText: response.statusText,
				body: errorBody
			});
			throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const summaryResult = {
			translation: data.choices[0]?.message?.content?.trim() || '',
			model: data.model || 'anthropic/claude-sonnet-4'
		};

		const summaryData = {
			tractate,
			page,
			amud,
			summary: summaryResult.translation,
			model: summaryResult.model,
			generated: new Date().toISOString(),
			wordCount: summaryResult.translation.split(/\s+/).length
		};

		// Cache the result
		await setCachedSummary(cacheKey, summaryData, platform);

		return json({
			...summaryData,
			cached: false,
			cacheKey
		});
		
	} catch (error) {
		console.error('Summary GET API error:', error);
		return json({
			error: 'Failed to generate summary',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * POST /api/summary - Generate summary from provided text
 * Used when client fetches text directly from daf-supplier
 * 
 * Request body:
 * - tractate: Tractate name (required)
 * - page: Page number (required)
 * - amud: Side of page 'a' or 'b' (required)
 * - mainText: Talmud text content (required)
 * 
 * Returns:
 * - 200: Summary data with model info and word count
 * - 400: Missing required fields or insufficient content
 * - 503: OpenRouter API not configured
 * - 500: Generation error
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = await request.json();
		const { tractate, page, amud, mainText } = body;
		
		if (!tractate || !page || !amud || !mainText) {
			return json({ error: 'Missing required fields: tractate, page, amud, mainText' }, { status: 400 });
		}
		
		// Create cache key
		const cacheKey = `${CACHE_PREFIX}${tractate}:${page}${amud}`;
		
		// Check cache first
		const cachedSummary = await getCachedSummary(cacheKey, platform);
		if (cachedSummary) {
			return json({
				...cachedSummary,
				cached: true,
				cacheKey
			});
		}
		
		// Get API key from platform.env (Cloudflare Workers runtime)
		const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			return json({ error: 'OpenRouter API not configured' }, { status: 503 });
		}
		
		if (!mainText || mainText.length < 50) {
			return json({ error: 'Insufficient content for summary generation', length: mainText?.length }, { status: 400 });
		}

		// Generate summary using OpenRouter
		const contextInfo = `${tractate} ${page}${amud}`;
		const summaryPrompt = `You are a learned rabbi writing in the style of Rabbi Jonathan Sacks or for a Koren publication. Summarize ${contextInfo} with depth and warmth, but without excessive jargon.

Capture the essence of this page:
• What question drives this discussion and why does it matter?
• Who are the key rabbis and what are their positions?
• What's the logical flow of the argument?
• What deeper principle or insight emerges?
• How does this connect to Jewish life and thought?

Write 2-3 flowing paragraphs that make the discussion come alive. Use a tone that's learned but accessible - like you're teaching intelligent adults who want to understand the beauty of Talmudic reasoning.

**Formatting guidelines:**
- **Bold** for rabbi names and central concepts
- *Italics* for Hebrew/Aramaic terms, followed by translation
- Write with dignity and clarity
- Avoid both dry academic language and excessive yeshivish terminology

Aim for the voice of someone who deeply loves this learning and wants to share its wisdom - knowledgeable but never condescending, warm but not overly familiar.

Talmud text: ${mainText.slice(0, 3000)}`;

		// Call OpenRouter API
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openRouterApiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://talmud.app',
				'X-Title': 'Talmud Study App'
			},
			body: JSON.stringify({
				model: 'anthropic/claude-sonnet-4',
				messages: [
					{ role: 'user', content: summaryPrompt }
				],
				temperature: 0.7,
				max_tokens: 800
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('OpenRouter API error:', {
				status: response.status,
				statusText: response.statusText,
				body: errorBody,
				headers: Object.fromEntries(response.headers.entries())
			});
			throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const summaryResult = {
			translation: data.choices[0]?.message?.content?.trim() || '',
			model: data.model || 'anthropic/claude-sonnet-4'
		};

		const summaryData = {
			tractate,
			page,
			amud,
			summary: summaryResult.translation,
			model: summaryResult.model,
			generated: new Date().toISOString(),
			wordCount: summaryResult.translation.split(/\s+/).length
		};

		// Cache the result
		await setCachedSummary(cacheKey, summaryData, platform);

		return json({
			...summaryData,
			cached: false,
			cacheKey
		});
	} catch (error) {
		console.error('Summary POST API error:', error);
		return json({
			error: 'Failed to generate summary',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};