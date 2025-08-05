/**
 * @fileoverview Stories API Endpoint - Generates educational narratives
 * 
 * This endpoint generates three types of educational stories for each Talmud page:
 * 1. Core Discussion - Main arguments and rabbis involved
 * 2. Historical Context - Period background and circumstances
 * 3. Rabbi Profiles - Character studies of the personalities
 * 
 * Features:
 * - Permanent caching (no expiration) to reduce API costs
 * - Parallel story generation for better performance
 * - Uses Claude Sonnet 4 for highest quality narratives
 * - Supports forced refresh to regenerate stories
 * 
 * GET /api/stories?tractate=Berakhot&page=2&amud=a
 * POST /api/stories with { tractate, page, amud, mainText, rashi, tosafot }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRouterTranslator } from '$lib/openrouter-translator';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/hebrewbooks';

/** Cache key prefix for KV storage */
const CACHE_PREFIX = 'talmud-stories:';

/** In-memory cache fallback for development */
const memoryCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Get cached stories from KV storage or memory
 * Stories are cached permanently unless explicitly refreshed
 * 
 * @param {string} cacheKey - Cache key for the stories
 * @param {boolean} forceRefresh - Whether to bypass cache
 * @param {any} platform - Platform object with KV bindings
 * @returns {Promise<any|null>} Cached stories data or null if not found
 */
async function getCachedStories(cacheKey: string, forceRefresh: boolean = false, platform?: any): Promise<any | null> {
	if (forceRefresh) {
		return null;
	}

	if (platform?.env) {
		try {
			// Try Cloudflare KV if available - permanent cache
			if (typeof STORIES_KV !== 'undefined') {
				const cached = await STORIES_KV.get(cacheKey);
				if (cached) {
					const parsedCache = JSON.parse(cached);
					return parsedCache.data;
				}
			}
		} catch (error) {
			// Silently fail and try memory cache
		}
	}
	
	// Fallback to memory cache - permanent cache
	const cached = memoryCache.get(cacheKey);
	if (cached) {
		return cached.data;
	}
	
	return null;
}

/**
 * Store stories in permanent cache (KV storage or memory)
 * @param {string} cacheKey - Cache key for the stories
 * @param {any} data - Stories data to cache
 * @param {any} platform - Platform object with KV bindings
 */
async function setCachedStories(cacheKey: string, data: any, platform?: any): Promise<void> {
	const cacheData = {
		data,
		timestamp: Date.now()
	};

	if (platform?.env) {
		try {
			// Try Cloudflare KV if available - permanent cache
			if (typeof STORIES_KV !== 'undefined') {
				await STORIES_KV.put(cacheKey, JSON.stringify(cacheData)); // No expiration = permanent
				return;
			}
		} catch (error) {
			// Silently handle KV cache write errors
		}
	}
	
	// Fallback to memory cache
	memoryCache.set(cacheKey, cacheData);
}

/**
 * GET /api/stories - Generate or retrieve cached educational stories
 * 
 * Query parameters:
 * - tractate: Tractate name (required)
 * - page: Page number (required)
 * - amud: Side of page 'a' or 'b' (required)
 * - refresh: Force regenerate stories if 'true' (optional)
 * 
 * Returns:
 * - 200: Stories data with 3 narratives, word counts, and model info
 * - 400: Missing required parameters or insufficient content
 * - 503: OpenRouter API not configured
 * - 500: Generation error
 * 
 * Special response for client-side fetching:
 * If in development or internal fetch fails, returns:
 * - requiresClientFetch: true
 * - dafSupplierUrl: URL for client to fetch text
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
		const cachedStories = await getCachedStories(cacheKey, refresh, platform);
		if (cachedStories) {
			return json({
				...cachedStories,
				cached: true,
				cacheKey
			});
		}

		// Generate new stories if not cached
		if (!openRouterTranslator.isConfigured()) {
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
		let rashiText = '';
		let tosafotText = '';
		
		// In production, we can now use our internal daf-supplier
		// Check if we're in Cloudflare Workers environment
		const isCloudflareWorkers = platform?.env !== undefined;
		
		if (isCloudflareWorkers) {
			// Use internal daf-supplier endpoint
			try {
				const internalUrl = new URL('/api/daf-supplier', url.origin);
				internalUrl.searchParams.set('mesechta', mesechtaId);
				internalUrl.searchParams.set('daf', dafForAPI.toString());
				internalUrl.searchParams.set('br', 'true');
				
				const dafResponse = await fetch(internalUrl.toString());
				if (!dafResponse.ok) {
					throw new Error(`Failed to fetch from internal daf-supplier: ${dafResponse.status}`);
				}
				
				const dafData = await dafResponse.json();
				mainText = dafData.mainText;
				rashiText = dafData.rashi;
				tosafotText = dafData.tosafot;
				
				// Continue with story generation below
			} catch (error) {
				console.error('Error fetching from internal daf-supplier:', error);
				// Fall back to external URL for client fetch
				const dafSupplierUrl = `https://daf-supplier.402.workers.dev?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
				return json({
					requiresClientFetch: true,
					dafSupplierUrl,
					tractate,
					page,
					amud,
					message: 'Client should fetch from dafSupplierUrl and POST the data back'
				});
			}
		} else {
			// In development, return URL for client to fetch
			const dafSupplierUrl = `/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
			return json({
				requiresClientFetch: true,
				dafSupplierUrl,
				tractate,
				page,
				amud,
				message: 'Client should fetch from dafSupplierUrl and POST the data back'
			});
		}
		
		// Check if we have enough content to generate stories
		if (!mainText || mainText.length < 100) {
			return json({ error: 'Insufficient content for story generation' }, { status: 400 });
		}

		// Generate educational narratives using OpenRouter with improved prompts
		const contextInfo = `${tractate} ${page}${amud}`;
		
		// Enhanced story prompts focused on educational goals
		const storyPrompts = [
			{
				type: 'main-discussion',
				title: 'The Core Discussion',
				prompt: `Write an educational story about the main discussion from ${contextInfo}. Dive directly into the content without meta-commentary or introductory phrases like "Here's a narrative" or "This story focuses on."

Your story should teach:
1. The main argument/question being resolved
2. The specific rabbis involved with historical context about who they were
3. Their different positions and why they disagree
4. Historical/cultural context that makes this discussion matter
5. How their approaches reflect their broader legal philosophies

Write 800-1200 words making the rabbis come alive as real people. Help readers understand not just WHAT they argued, but WHY they argued it and what it reveals about their thinking.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings if appropriate
- Use bullet points or numbered lists when listing multiple related items
- Use > blockquotes for actual quotes from the text

Choose the most significant discussion from this text:

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

${tosafotText ? `Tosafot Commentary: ${tosafotText.slice(0, 1500)}` : ''}

Begin directly with the story content.`
			},
			{
				type: 'historical-context',
				title: 'Historical Deep Dive',
				prompt: `Write a historical story about the main discussion from ${contextInfo}. Start directly with the narrative content, avoiding introductory phrases.

Your story should educate about:
1. The historical period and circumstances of this discussion
2. Social, political, and religious context that made this question important
3. Biographical backgrounds of the key rabbis
4. How their experiences shaped their legal opinions
5. Why this question was debated and its practical implications
6. Connections to broader themes in Jewish law

Write 800-1200 words painting a vivid picture of the ancient world while explaining the legal reasoning. Make readers feel they're witnessing these great minds in their historical context.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings if appropriate
- Use bullet points or numbered lists when listing multiple related items
- Use > blockquotes for actual quotes or reconstructed dialogue

Main Text: ${mainText.slice(0, 4000)}

Begin immediately with the historical narrative.`
			},
			{
				type: 'rabbi-profiles',
				title: 'The Personalities Behind the Debate',
				prompt: `Write a character study of the rabbis in the main discussion from ${contextInfo}. Jump directly into the character profiles without preamble.

Your narrative should reveal:
1. Who the main rabbis are and their personalities
2. Their different approaches to legal reasoning
3. Other famous opinions showing their consistent approaches
4. How their backgrounds influenced their thinking
5. What their arguments reveal about their judicial philosophies
6. How their different approaches create productive tension

Write 800-1200 words making these ancient sages come alive as distinct thinkers. Help students recognize their "voices" and understand how different minds approach problems.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings for each rabbi profile
- Use bullet points or numbered lists when listing multiple related items
- Use > blockquotes for actual quotes or characteristic statements

Main Text: ${mainText.slice(0, 4000)}

Start directly with the character profiles.`
			}
		];

		// Generate stories in parallel with longer content allowed
		console.log('🎭 Generating educational stories for', contextInfo);
		
		const storyResults = await Promise.all(
			storyPrompts.map(async ({ type, title, prompt }) => {
				try {
					console.log(`📝 Generating ${type} story...`);
					
					// Get API key from platform.env (Cloudflare Workers runtime)
					const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY;
					if (!openRouterApiKey) {
						throw new Error('OpenRouter API key not configured');
					}
					
					// Use Claude Sonnet 4 for highest quality stories
					const result = await fetch('https://openrouter.ai/api/v1/chat/completions', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${openRouterApiKey}`,
							'Content-Type': 'application/json',
							'HTTP-Referer': 'https://talmud.app',
							'X-Title': 'Talmud Study App - Stories'
						},
						body: JSON.stringify({
							model: 'anthropic/claude-sonnet-4', // Use the most advanced model
							messages: [
								{ 
									role: 'system', 
									content: 'You are an expert Talmud teacher creating educational narratives. Write engaging stories that help students understand Jewish legal discussions. Start directly with the story content - no meta-commentary about "Here\'s a narrative" or similar introductions. Focus on accuracy while making content memorable.' 
								},
								{ role: 'user', content: prompt }
							],
							temperature: 0.7, // Higher creativity for stories
							max_tokens: 2000 // Allow for longer stories
						})
					});

					if (!result.ok) {
						throw new Error(`OpenRouter API error: ${result.status}`);
					}

					const data = await result.json();
					const story = data.choices[0]?.message?.content?.trim() || '';
					
					console.log(`✅ Generated ${type} story: ${story.length} characters`);
					
					return {
						type,
						title,
						content: story,
						wordCount: story.split(/\s+/).length,
						model: data.model || 'anthropic/claude-sonnet-4'
					};
				} catch (err) {
					console.error(`Failed to generate ${type} story:`, err);
					return {
						type,
						title,
						content: `Failed to generate ${title.toLowerCase()}. Please try again.`,
						wordCount: 0,
						model: 'error'
					};
				}
			})
		);

		const storiesData = {
			tractate,
			page,
			amud,
			stories: storyResults,
			generated: new Date().toISOString(),
			totalWords: storyResults.reduce((sum, story) => sum + story.wordCount, 0)
		};

		// Cache the result
		await setCachedStories(cacheKey, storiesData, platform);

		return json({
			...storiesData,
			cached: false,
			cacheKey
		});
	} catch (error) {
		console.error('Story generation error:', error);
		return json({
			error: 'Failed to generate stories',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * POST /api/stories - Generate stories from provided texts
 * Used when client fetches text directly from daf-supplier
 * 
 * Request body:
 * - tractate: Tractate name (required)
 * - page: Page number (required)  
 * - amud: Side of page 'a' or 'b' (required)
 * - mainText: Talmud text content (required)
 * - rashi: Rashi commentary (optional)
 * - tosafot: Tosafot commentary (optional)
 * 
 * Returns:
 * - 200: Stories data with 3 narratives, word counts, and model info
 * - 400: Missing required fields or insufficient content
 * - 503: OpenRouter API not configured
 * - 500: Generation error
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = await request.json();
		const { tractate, page, amud, mainText, rashi, tosafot } = body;
		
		if (!tractate || !page || !amud || !mainText) {
			return json({ error: 'Missing required fields: tractate, page, amud, mainText' }, { status: 400 });
		}
		
		// Create cache key
		const cacheKey = `${CACHE_PREFIX}${tractate}:${page}${amud}`;
		
		// Check cache first
		const cachedStories = await getCachedStories(cacheKey, false, platform);
		if (cachedStories) {
			return json({
				...cachedStories,
				cached: true,
				cacheKey
			});
		}
		
		if (!openRouterTranslator.isConfigured()) {
			return json({ error: 'OpenRouter API not configured' }, { status: 503 });
		}
		
		const rashiText = rashi || '';
		const tosafotText = tosafot || '';
		
		if (!mainText || mainText.length < 100) {
			return json({ error: 'Insufficient content for story generation' }, { status: 400 });
		}

		// Generate educational narratives using OpenRouter with improved prompts
		const contextInfo = `${tractate} ${page}${amud}`;
		
		// Enhanced story prompts focused on educational goals
		const storyPrompts = [
			{
				type: 'main-discussion',
				title: 'The Core Discussion',
				prompt: `Write an educational story about the main discussion from ${contextInfo}. Dive directly into the content without meta-commentary or introductory phrases like "Here's a narrative" or "This story focuses on."

Your story should teach:
1. The main argument/question being resolved
2. The specific rabbis involved with historical context about who they were
3. Their different positions and why they disagree
4. Historical/cultural context that makes this discussion matter
5. How their approaches reflect their broader legal philosophies

Write 800-1200 words making the rabbis come alive as real people. Help readers understand not just WHAT they argued, but WHY they argued it and what it reveals about their thinking.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings if appropriate
- Use bullet points or numbered lists when listing multiple related items
- Use > blockquotes for actual quotes from the text

Choose the most significant discussion from this text:

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

${tosafotText ? `Tosafot Commentary: ${tosafotText.slice(0, 1500)}` : ''}

Begin directly with the story content.`
			},
			{
				type: 'historical-context',
				title: 'Historical Deep Dive',
				prompt: `Write a historical story about the main discussion from ${contextInfo}. Start directly with the narrative content, avoiding introductory phrases.

Your story should educate about:
1. The historical period and circumstances of this discussion
2. Social, political, and religious context that made this question important
3. Biographical backgrounds of the key rabbis
4. How their experiences shaped their legal opinions
5. Why this question was debated and its practical implications
6. Connections to broader themes in Jewish law

Write 800-1200 words painting a vivid picture of the ancient world while explaining the legal reasoning. Make readers feel they're witnessing these great minds in their historical context.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings if appropriate
- Use bullet points or numbered lists when listing multiple related items
- Use > blockquotes for actual quotes or reconstructed dialogue

Main Text: ${mainText.slice(0, 4000)}

Begin immediately with the historical narrative.`
			},
			{
				type: 'rabbi-profiles',
				title: 'The Personalities Behind the Debate',
				prompt: `Write a character study of the rabbis in the main discussion from ${contextInfo}. Jump directly into the character profiles without preamble.

Your narrative should reveal:
1. Who the main rabbis are and their personalities
2. Their different approaches to legal reasoning
3. Other famous opinions showing their consistent approaches
4. Their relationships and rivalries
5. What made them such influential figures

Write 800-1200 words bringing these ancient scholars to life as complex individuals. Show how their backgrounds, temperaments, and philosophies shaped their legal opinions.

**Format your response in Markdown** with:
- Use **bold** for key concepts and rabbi names when first introduced
- Use *italics* for Hebrew/Aramaic terms
- Use ### for section headings for each rabbi profiled
- Use bullet points or numbered lists when listing their characteristics or famous rulings
- Use > blockquotes for actual quotes or characteristic sayings

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

Begin with the character profiles immediately.`
			}
		];

		// Generate all three stories in parallel
		console.log(`🎭 Generating ${storyPrompts.length} educational stories for ${contextInfo}...`);
		const storyResults = await Promise.all(
			storyPrompts.map(async ({ type, title, prompt }) => {
				try {
					const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${platform?.env?.PUBLIC_OPENROUTER_API_KEY || ''}`,
							'Content-Type': 'application/json',
							'HTTP-Referer': 'https://talmud.app',
							'X-Title': 'Talmud Study App - Stories'
						},
						body: JSON.stringify({
							model: 'anthropic/claude-sonnet-4',
							messages: [
								{ role: 'user', content: prompt }
							],
							temperature: 0.8, // Higher creativity for narratives
							max_tokens: 1500  // Longer stories
						})
					});

					if (!response.ok) {
						throw new Error(`OpenRouter API error: ${response.status}`);
					}

					const data = await response.json();
					const story = data.choices[0]?.message?.content?.trim() || '';
					
					console.log(`✅ Generated ${type} story: ${story.length} characters`);
					
					return {
						type,
						title,
						content: story,
						wordCount: story.split(/\s+/).length,
						model: data.model || 'anthropic/claude-sonnet-4'
					};
				} catch (err) {
					console.error(`Failed to generate ${type} story:`, err);
					return {
						type,
						title,
						content: `Failed to generate ${title.toLowerCase()}. Please try again.`,
						wordCount: 0,
						model: 'error'
					};
				}
			})
		);

		const storiesData = {
			tractate,
			page,
			amud,
			stories: storyResults,
			generated: new Date().toISOString(),
			totalWords: storyResults.reduce((sum, story) => sum + story.wordCount, 0)
		};

		// Cache the result
		await setCachedStories(cacheKey, storiesData, platform);

		return json({
			...storiesData,
			cached: false,
			cacheKey
		});

	} catch (error) {
		console.error('Story POST API error:', error);
		return json({
			error: 'Failed to generate stories',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};