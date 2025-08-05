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
import { openRouterTranslator } from '$lib/api/openrouter-translator';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/api/hebrewbooks';

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
			mainText = dafData.mainText;
			rashiText = dafData.rashi;
			tosafotText = dafData.tosafot;
			
			console.log(`Got text from daf-supplier - Main: ${mainText.length}, Rashi: ${rashiText.length}, Tosafot: ${tosafotText.length}`);
			
			// Continue with story generation below
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
				prompt: `Write in the style of Rabbi Jonathan Sacks or a Koren Talmud essay about the main discussion on ${contextInfo}. Present the material with scholarly depth but accessible warmth.

Explore this discussion thoroughly:
1. What fundamental question or principle is at stake?
2. Who are the rabbis involved and what do we know about them?
3. How does each rabbi's argument unfold logically?
4. What philosophical or theological issues underlie their debate?
5. How does this discussion illuminate broader themes in Jewish law?

Write 800-1200 words that bring out both the intellectual brilliance and human dimension of this debate. Help readers appreciate the sophistication of Talmudic reasoning while feeling the passion these sages brought to their learning.

**Professional formatting:**
- **Bold** for rabbi names and key concepts
- *Italics* for Hebrew/Aramaic terms with clear translations
- ### for section headings where appropriate
- > for quotations from the text

Write with the dignity and clarity of someone who has studied these texts deeply and wants to share their profound wisdom with modern readers.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

${tosafotText ? `Tosafot Commentary: ${tosafotText.slice(0, 1500)}` : ''}

Begin directly with the discussion.`
			},
			{
				type: 'historical-context',
				title: 'Historical Deep Dive',
				prompt: `Write in the style of a thoughtful Jewish historian like Rabbi Berel Wein or a Koren historical essay about the context of ${contextInfo}. Bring the ancient world to life with scholarly accuracy and narrative warmth.

Illuminate the historical setting:
1. What was the political and social reality when this discussion took place?
2. Why would this particular question have mattered in their world?
3. Who were these rabbis - their backgrounds, teachers, and influences?
4. How did the conditions of exile or Roman rule shape their concerns?
5. What aspects of daily life made this law practically relevant?
6. How does this discussion fit into the broader development of the Oral Torah?

Write 800-1200 words that transport readers to the world of the Talmud. Help them understand not just what was said, but why it was said then, by those particular people, in those circumstances.

**Clear, engaging formatting:**
- **Bold** for names and significant events
- *Italics* for Hebrew/Aramaic terms with translations
- ### for different time periods or locations
- > for reconstructed dialogue based on the sources

Write as a knowledgeable guide who helps modern readers enter the world of our sages with understanding and respect.

Main Text: ${mainText.slice(0, 4000)}

Begin with the historical setting.`
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
									content: 'You are a learned rabbi writing in the style of Rabbi Jonathan Sacks, Rabbi Adin Steinsaltz, or for a Koren publication. Present Talmudic wisdom with intellectual depth, narrative elegance, and warm accessibility. Write with dignity and clarity, avoiding both dry academic language and excessive colloquialisms. Your voice should be that of someone deeply immersed in Jewish learning who can communicate its profundity to modern readers.' 
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
				prompt: `Write in the style of Rabbi Jonathan Sacks or a Koren Talmud essay about the main discussion on ${contextInfo}. Present the material with scholarly depth but accessible warmth.

Explore this discussion thoroughly:
1. What fundamental question or principle is at stake?
2. Who are the rabbis involved and what do we know about them?
3. How does each rabbi's argument unfold logically?
4. What philosophical or theological issues underlie their debate?
5. How does this discussion illuminate broader themes in Jewish law?

Write 800-1200 words that bring out both the intellectual brilliance and human dimension of this debate. Help readers appreciate the sophistication of Talmudic reasoning while feeling the passion these sages brought to their learning.

**Professional formatting:**
- **Bold** for rabbi names and key concepts
- *Italics* for Hebrew/Aramaic terms with clear translations
- ### for section headings where appropriate
- > for quotations from the text

Write with the dignity and clarity of someone who has studied these texts deeply and wants to share their profound wisdom with modern readers.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

${tosafotText ? `Tosafot Commentary: ${tosafotText.slice(0, 1500)}` : ''}

Begin directly with the discussion.`
			},
			{
				type: 'historical-context',
				title: 'Historical Deep Dive',
				prompt: `Write in the style of a thoughtful Jewish historian like Rabbi Berel Wein or a Koren historical essay about the context of ${contextInfo}. Bring the ancient world to life with scholarly accuracy and narrative warmth.

Illuminate the historical setting:
1. What was the political and social reality when this discussion took place?
2. Why would this particular question have mattered in their world?
3. Who were these rabbis - their backgrounds, teachers, and influences?
4. How did the conditions of exile or Roman rule shape their concerns?
5. What aspects of daily life made this law practically relevant?
6. How does this discussion fit into the broader development of the Oral Torah?

Write 800-1200 words that transport readers to the world of the Talmud. Help them understand not just what was said, but why it was said then, by those particular people, in those circumstances.

**Clear, engaging formatting:**
- **Bold** for names and significant events
- *Italics* for Hebrew/Aramaic terms with translations
- ### for different time periods or locations
- > for reconstructed dialogue based on the sources

Write as a knowledgeable guide who helps modern readers enter the world of our sages with understanding and respect.

Main Text: ${mainText.slice(0, 4000)}

Begin with the historical setting.`
			},
			{
				type: 'rabbi-profiles',
				title: 'The Personalities Behind the Debate',
				prompt: `Write character studies in the style of Rabbi Adin Steinsaltz or a Koren biographical essay about the rabbis in ${contextInfo}. Present them as the complex, brilliant individuals they were.

Reveal their intellectual and personal dimensions:
1. What was each rabbi's distinctive approach to legal reasoning?
2. Who were their teachers and how did they influence their thinking?
3. What patterns emerge in their rulings across different areas of law?
4. What do we know about their personalities and life circumstances?
5. How did their different methodologies contribute to this debate?
6. What made each of them such an influential voice in the Talmud?

Write 800-1200 words that help readers recognize these sages as distinct thinkers with their own philosophical approaches. Show how understanding their personalities enriches our understanding of their arguments.

**Respectful, clear formatting:**
- **Bold** for rabbi names and defining characteristics
- *Italics* for Hebrew/Aramaic terms with translations
- ### for each rabbi's profile
- Lists for their notable positions or characteristics
- > for memorable statements that capture their approach

Write as someone who has studied these figures extensively and wants to introduce them as the remarkable individuals they were.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ''}

Begin with their intellectual portraits.`
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