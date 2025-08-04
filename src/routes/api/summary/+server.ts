import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRouterTranslator } from '$lib/openrouter-translator';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/hebrewbooks';
import { PUBLIC_OPENROUTER_API_KEY } from '$env/static/public';

// Check if we're in Cloudflare Workers environment
const isCloudflareWorkers = typeof caches !== 'undefined';

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_PREFIX = 'talmud-summary:';

// In-memory cache fallback for development
const memoryCache = new Map<string, { data: any; timestamp: number }>();

async function getCachedSummary(cacheKey: string): Promise<any | null> {
	if (isCloudflareWorkers) {
		try {
			// Try Cloudflare KV if available
			if (typeof SUMMARIES_KV !== 'undefined') {
				const cached = await SUMMARIES_KV.get(cacheKey);
				if (cached) {
					const parsedCache = JSON.parse(cached);
					// Check if cache is still valid (24 hours)
					if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
						return parsedCache.data;
					} else {
						// Remove expired cache
						await SUMMARIES_KV.delete(cacheKey);
					}
				}
			}
		} catch (error) {
			// Silently handle KV cache read errors
		}
	}
	
	// Fallback to memory cache
	const cached = memoryCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
		return cached.data;
	}
	
	return null;
}

async function setCachedSummary(cacheKey: string, data: any): Promise<void> {
	const cacheData = {
		data,
		timestamp: Date.now()
	};

	if (isCloudflareWorkers) {
		try {
			// Try Cloudflare KV if available
			if (typeof SUMMARIES_KV !== 'undefined') {
				await SUMMARIES_KV.put(cacheKey, JSON.stringify(cacheData), {
					expirationTtl: Math.floor(CACHE_DURATION / 1000) // KV expects seconds
				});
				return;
			}
		} catch (error) {
			// Silently handle KV cache write errors
		}
	}
	
	// Fallback to memory cache
	memoryCache.set(cacheKey, cacheData);
}

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
			const cachedSummary = await getCachedSummary(cacheKey);
			if (cachedSummary) {
				return json({
					...cachedSummary,
					cached: true,
					cacheKey
				});
			}
		}

		// Generate new summary if not cached
		// Get API key from platform.env (Cloudflare Workers) or import (local dev)
		const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY || PUBLIC_OPENROUTER_API_KEY;
		console.log('API Key available:', !!openRouterApiKey, 'Length:', openRouterApiKey?.length);
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
		
		console.log(`Fetching from daf-supplier v3: mesechta=${mesechtaId}, daf=${dafForAPI} (converted from ${page}${amud})`);
		const dafSupplierUrl = `https://daf-supplier.402.workers.dev?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
		console.log(`Calling daf-supplier URL: ${dafSupplierUrl}`);
		const talmudResponse = await fetch(dafSupplierUrl);
		
		if (!talmudResponse.ok) {
			const errorText = await talmudResponse.text();
			console.error(`daf-supplier error: status=${talmudResponse.status}, text=${errorText.substring(0, 200)}`);
			throw new Error(`Failed to fetch Talmud data: ${talmudResponse.status}`);
		}

		const talmudData = await talmudResponse.json();
		const mainText = talmudData.mainText || '';
		
		if (!mainText || mainText.length < 50) {
			console.error('Insufficient content:', { mainText: mainText?.substring(0, 100), length: mainText?.length });
			return json({ error: 'Insufficient content for summary generation', length: mainText?.length }, { status: 400 });
		}

		// Generate summary using OpenRouter with Claude Sonnet 4 directly
		const contextInfo = `${tractate} ${page}${amud}`;
		const summaryPrompt = `You are analyzing a page from the Talmud (${contextInfo}). Create an engaging, accessible summary that brings this ancient discussion to life for modern readers.

Focus on making the content compelling by highlighting:
• The central question or dilemma being explored
• The brilliant reasoning and arguments from different rabbis
• How their debate reflects timeless human concerns
• Any surprising insights or unexpected connections
• The practical impact on Jewish life and law
• Why this conversation matters today

Write 2-3 engaging paragraphs that would make someone excited to study this page deeper. Make the rabbis feel like real people having a fascinating intellectual conversation.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use bullet points or numbered lists when appropriate
- Keep paragraphs engaging and narrative-driven

Talmud text: ${mainText.slice(0, 3000)}`;

		// Call OpenRouter API directly with Claude Sonnet 4
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
				temperature: 0.7, // Higher temperature for more engaging content
				max_tokens: 800
			})
		});

		if (!response.ok) {
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
		await setCachedSummary(cacheKey, summaryData);

		return json({
			...summaryData,
			cached: false,
			cacheKey
		});
	} catch (error) {
		console.error('Summary API error:', error);
		return json({
			error: 'Failed to generate summary',
			details: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		}, { status: 500 });
	}
};