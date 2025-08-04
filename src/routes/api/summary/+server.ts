import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRouterTranslator } from '$lib/openrouter-translator';

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
			if (typeof KV !== 'undefined') {
				const cached = await KV.get(cacheKey);
				if (cached) {
					const parsedCache = JSON.parse(cached);
					// Check if cache is still valid (24 hours)
					if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
						console.log('📦 Cache hit (KV):', cacheKey);
						return parsedCache.data;
					} else {
						// Remove expired cache
						await KV.delete(cacheKey);
					}
				}
			}
		} catch (error) {
			console.warn('KV cache read failed:', error);
		}
	}
	
	// Fallback to memory cache
	const cached = memoryCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
		console.log('📦 Cache hit (memory):', cacheKey);
		return cached.data;
	}
	
	console.log('🔍 Cache miss:', cacheKey);
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
			if (typeof KV !== 'undefined') {
				await KV.put(cacheKey, JSON.stringify(cacheData), {
					expirationTtl: Math.floor(CACHE_DURATION / 1000) // KV expects seconds
				});
				console.log('💾 Cached to KV:', cacheKey);
				return;
			}
		} catch (error) {
			console.warn('KV cache write failed:', error);
		}
	}
	
	// Fallback to memory cache
	memoryCache.set(cacheKey, cacheData);
	console.log('💾 Cached to memory:', cacheKey);
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const tractate = url.searchParams.get('tractate');
	const page = url.searchParams.get('page');
	const amud = url.searchParams.get('amud');
	
	if (!tractate || !page || !amud) {
		return json({ error: 'Missing required parameters: tractate, page, amud' }, { status: 400 });
	}

	// Create cache key
	const cacheKey = `${CACHE_PREFIX}${tractate}:${page}${amud}`;
	
	try {
		// Check cache first
		const cachedSummary = await getCachedSummary(cacheKey);
		if (cachedSummary) {
			return json({
				...cachedSummary,
				cached: true,
				cacheKey
			});
		}

		// Generate new summary if not cached
		if (!openRouterTranslator.isConfigured()) {
			return json({ error: 'OpenRouter API not configured' }, { status: 503 });
		}

		// Convert tractate name to mesechta ID for API call
		const tractateMap: Record<string, string> = {
			'Berakhot': '1', 'Shabbat': '2', 'Eruvin': '3', 'Pesachim': '4', 'Shekalim': '5',
			'Yoma': '6', 'Sukkah': '7', 'Beitzah': '8', 'Rosh Hashanah': '9', 'Taanit': '10',
			'Megillah': '11', 'Moed Katan': '12', 'Chagigah': '13', 'Yevamot': '14', 'Ketubot': '15',
			'Nedarim': '16', 'Nazir': '17', 'Sotah': '18', 'Gittin': '19', 'Kiddushin': '20',
			'Bava Kamma': '21', 'Bava Metzia': '22', 'Bava Batra': '23', 'Sanhedrin': '24', 'Makkot': '25',
			'Shevuot': '26', 'Avodah Zarah': '27', 'Horayot': '28', 'Zevachim': '29', 'Menachot': '30',
			'Chullin': '31', 'Bekhorot': '32', 'Arakhin': '33', 'Temurah': '34', 'Keritot': '35',
			'Meilah': '36', 'Niddah': '37'
		};
		
		const mesechta = tractateMap[tractate];
		if (!mesechta) {
			return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
		}

		// Fetch the Talmud content
		const dafForAPI = `${page}${amud}`;
		const talmudResponse = await fetch(`/api/talmud-merged?mesechta=${mesechta}&daf=${dafForAPI}`);
		
		if (!talmudResponse.ok) {
			throw new Error(`Failed to fetch Talmud data: ${talmudResponse.status}`);
		}

		const talmudData = await talmudResponse.json();
		const mainText = talmudData.mainText || '';
		
		if (!mainText || mainText.length < 50) {
			return json({ error: 'Insufficient content for summary generation' }, { status: 400 });
		}

		// Generate summary using OpenRouter
		const contextInfo = `${tractate} ${page}${amud}`;
		const summaryPrompt = `Provide a concise, informative summary of this Talmudic passage from ${contextInfo}. Focus on:
1. The main topic or question being discussed
2. Key arguments and positions presented
3. The primary rabbis involved and their views
4. Any practical conclusions or rulings
5. Why this discussion is significant

Keep the summary to 2-3 paragraphs, accessible to someone studying this page for the first time.

Talmud text: ${mainText.slice(0, 3000)}`;

		const summaryResult = await openRouterTranslator.translateText({
			text: summaryPrompt,
			context: `Summary generation for ${contextInfo}`,
			targetLanguage: 'English'
		});

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
		console.error('Summary generation error:', error);
		return json({
			error: 'Failed to generate summary',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};