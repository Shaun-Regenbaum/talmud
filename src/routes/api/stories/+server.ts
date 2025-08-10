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
import { createOpenRouterTranslator } from '$lib/api/openrouter-translator';
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

		// Get API key and create translator instance
		const openRouterApiKey = platform?.env?.OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			return json({ error: 'OpenRouter API key not configured' }, { status: 503 });
		}
		
		const openRouterTranslator = createOpenRouterTranslator(openRouterApiKey);

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
		
		// Two focused story types for better engagement
		const storyPrompts = [
			{
				type: 'main-discussion',
				title: 'The Main Discussion',
				prompt: `Transform the Talmudic discussion from ${contextInfo} into an engaging narrative story. Write it like a compelling short story that captures both the intellectual drama and human dimension of the debate.

## The Opening
Start with the question or situation that sparked this discussion. Set the scene - what prompted this debate? Why did it matter?

## The Debate Unfolds
Tell the story of how the argument develops:
- Introduce each rabbi as they enter the discussion
- Show their different perspectives through their words
- Capture the back-and-forth, the challenges and responses
- Include any proofs, stories, or examples they bring

## The Turning Point
What moment shifts the discussion? Is there a brilliant insight, a decisive proof, or an unexpected perspective?

## The Resolution
How does the discussion conclude? What wisdom emerges? What do we learn about how to think and argue?

Write 600-800 words that read like a story, not a summary. Use:
- **Bold** for rabbi names and key concepts
- *Italics* for Hebrew/Aramaic terms (with translations)
- Short paragraphs for readability
- Natural, flowing narrative voice

Make readers feel like they're witnessing a great intellectual drama unfold.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1000)}` : ''}`
			},
			{
				type: 'historical-fiction',
				title: 'Historical Fiction',
				prompt: `Create a vivid historical fiction scene featuring the rabbis from ${contextInfo}. Bring them to life as real people in their historical setting, weaving the halachic discussion into a narrative scene.

## The Scene
Set the scene vividly - are they in the study hall of Sura? The marketplace of Pumbedita? Under Roman occupation? During a festival? Make us see, hear, and feel the ancient world.

## The Characters
Bring the rabbis to life as real people:
- Show their personalities through actions and dialogue
- Include details about their appearance, mannerisms, backgrounds
- Let their different temperaments and approaches shine through
- Show the respect (or tension) between them

## The Discussion in Context
Weave the halachic debate naturally into the story:
- Why does this question arise now, in this place?
- How do their life experiences shape their views?
- Show how abstract law connects to real life
- Include reactions from students or bystanders

## The Human Dimension
What emotions are at play? Pride, humility, frustration, joy of discovery? Show the humanity behind the scholarship.

Write 600-800 words of engaging historical fiction. Use:
- **Bold** for character names when introduced
- *Italics* for Hebrew/Aramaic terms and internal thoughts
- Vivid sensory details
- Natural dialogue that brings the debate to life
- > for actual Talmudic quotes woven into the narrative

Transport readers to the world of the Talmud through storytelling.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1000)}` : ''}`
			}
		];

		// Generate stories in parallel with longer content allowed
		console.log('🎭 Generating educational stories for', contextInfo);
		
		const storyResults = await Promise.all(
			storyPrompts.map(async ({ type, title, prompt }) => {
				try {
					console.log(`📝 Generating ${type} story...`);
					
					// Get API key from platform.env (Cloudflare Workers runtime)
					const openRouterApiKey = platform?.env?.OPENROUTER_API_KEY;
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
							temperature: 0.8, // Higher creativity for narrative stories
							max_tokens: 1200 // Appropriate for 600-800 word stories
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
		
		// Get API key and create translator instance
		const openRouterApiKey = platform?.env?.OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			return json({ error: 'OpenRouter API key not configured' }, { status: 503 });
		}
		
		const openRouterTranslator = createOpenRouterTranslator(openRouterApiKey);
		
		const rashiText = rashi || '';
		const tosafotText = tosafot || '';
		
		if (!mainText || mainText.length < 100) {
			return json({ error: 'Insufficient content for story generation' }, { status: 400 });
		}

		// Generate educational narratives using OpenRouter with improved prompts
		const contextInfo = `${tractate} ${page}${amud}`;
		
		// Two focused story types for better engagement
		const storyPrompts = [
			{
				type: 'main-discussion',
				title: 'The Main Discussion',
				prompt: `Transform the Talmudic discussion from ${contextInfo} into an engaging narrative story. Write it like a compelling short story that captures both the intellectual drama and human dimension of the debate.

## The Opening
Start with the question or situation that sparked this discussion. Set the scene - what prompted this debate? Why did it matter?

## The Debate Unfolds
Tell the story of how the argument develops:
- Introduce each rabbi as they enter the discussion
- Show their different perspectives through their words
- Capture the back-and-forth, the challenges and responses
- Include any proofs, stories, or examples they bring

## The Turning Point
What moment shifts the discussion? Is there a brilliant insight, a decisive proof, or an unexpected perspective?

## The Resolution
How does the discussion conclude? What wisdom emerges? What do we learn about how to think and argue?

Write 600-800 words that read like a story, not a summary. Use:
- **Bold** for rabbi names and key concepts
- *Italics* for Hebrew/Aramaic terms (with translations)
- Short paragraphs for readability
- Natural, flowing narrative voice

Make readers feel like they're witnessing a great intellectual drama unfold.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1000)}` : ''}`
			},
			{
				type: 'historical-fiction',
				title: 'Historical Fiction',
				prompt: `Create a vivid historical fiction scene featuring the rabbis from ${contextInfo}. Bring them to life as real people in their historical setting, weaving the halachic discussion into a narrative scene.

## The Scene
Set the scene vividly - are they in the study hall of Sura? The marketplace of Pumbedita? Under Roman occupation? During a festival? Make us see, hear, and feel the ancient world.

## The Characters
Bring the rabbis to life as real people:
- Show their personalities through actions and dialogue
- Include details about their appearance, mannerisms, backgrounds
- Let their different temperaments and approaches shine through
- Show the respect (or tension) between them

## The Discussion in Context
Weave the halachic debate naturally into the story:
- Why does this question arise now, in this place?
- How do their life experiences shape their views?
- Show how abstract law connects to real life
- Include reactions from students or bystanders

## The Human Dimension
What emotions are at play? Pride, humility, frustration, joy of discovery? Show the humanity behind the scholarship.

Write 600-800 words of engaging historical fiction. Use:
- **Bold** for character names when introduced
- *Italics* for Hebrew/Aramaic terms and internal thoughts
- Vivid sensory details
- Natural dialogue that brings the debate to life
- > for actual Talmudic quotes woven into the narrative

Transport readers to the world of the Talmud through storytelling.

Main Text: ${mainText.slice(0, 4000)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1000)}` : ''}`
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
							'Authorization': `Bearer ${platform?.env?.OPENROUTER_API_KEY || ''}`,
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
							max_tokens: 1200  // Appropriate for 600-800 word stories
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