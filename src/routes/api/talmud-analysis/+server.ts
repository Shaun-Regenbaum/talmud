/**
 * @fileoverview Talmud Analysis API Endpoint
 * 
 * This endpoint analyzes Talmud pages to:
 * 1. Identify rabbis and historical figures
 * 2. Classify text sections as aggadah or halacha
 * 3. Determine time periods based on the rabbis mentioned
 * 
 * Features:
 * - KV caching to minimize API costs
 * - Fetches text from daf-supplier API
 * - Uses AI to analyze Hebrew/Aramaic text
 * - Returns structured JSON with confidence scores
 * 
 * GET /api/talmud-analysis?tractate=Berakhot&page=2&amud=a
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TalmudAnalyzer } from '$lib/api/talmud-analyzer';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/api/hebrewbooks';

const CACHE_PREFIX = 'talmud-analysis:';
const CACHE_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * GET /api/talmud-analysis - Analyze Talmud page for rabbis, text types, and time periods
 * 
 * Query parameters:
 * - tractate: Tractate name (e.g., 'Berakhot') (required)
 * - page: Page number (e.g., '2') (required)
 * - amud: Side of page 'a' or 'b' (required)
 * - includeRashi: Include Rashi commentary in analysis if 'true' (optional)
 * - includeTosafot: Include Tosafot commentary in analysis if 'true' (optional)
 * - refresh: Force refresh cached data if 'true' (optional)
 * 
 * Returns:
 * - 200: Analysis results with rabbis, sections, time periods
 * - 400: Missing parameters or unknown tractate
 * - 503: Analysis service not configured
 * - 500: Analysis error
 * 
 * Response format:
 * {
 *   rabbis: Array of identified rabbis with periods and confidence
 *   sections: Array of text sections classified as aggadah/halacha
 *   timePeriods: Array of historical periods represented
 *   primaryPeriod: The dominant time period
 *   summary: Statistics about the analysis
 *   cached: Boolean indicating if from cache
 *   model: AI model used
 * }
 */
export const GET: RequestHandler = async ({ url, fetch, platform }) => {
	const tractate = url.searchParams.get('tractate');
	const page = url.searchParams.get('page');
	const amud = url.searchParams.get('amud');
	const includeRashi = url.searchParams.get('includeRashi') === 'true';
	const includeTosafot = url.searchParams.get('includeTosafot') === 'true';
	const refresh = url.searchParams.get('refresh') === 'true';
	
	if (!tractate || !page || !amud) {
		return json({ 
			error: 'Missing required parameters: tractate, page, amud',
			example: '/api/talmud-analysis?tractate=Berakhot&page=2&amud=a'
		}, { status: 400 });
	}
	
	const cacheKey = `${CACHE_PREFIX}${tractate}:${page}${amud}:${includeRashi}:${includeTosafot}`;
	
	// Check cache first (unless refresh requested)
	if (!refresh && platform?.env?.ANALYSIS_KV) {
		try {
			const cached = await platform.env.ANALYSIS_KV.get(cacheKey);
			if (cached) {
				const data = JSON.parse(cached);
				return json({
					...data,
					cached: true,
					cacheAge: Date.now() - data.timestamp
				});
			}
		} catch (error) {
			console.error('Cache read error:', error);
		}
	}
	
	// Create analyzer instance with API key from environment
	const apiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY || process.env.PUBLIC_OPENROUTER_API_KEY;
	const analyzer = new TalmudAnalyzer(apiKey);
	
	// Check if analyzer is configured
	if (!analyzer.isConfigured()) {
		console.error('OpenRouter API key not found in environment');
		return json({ 
			error: 'Talmud analyzer not configured',
			message: 'OpenRouter API key is required for analysis'
		}, { status: 503 });
	}
	
	try {
		// Get tractate ID for daf-supplier
		const mesechtaId = TRACTATE_IDS[tractate];
		if (!mesechtaId) {
			return json({ 
				error: `Unknown tractate: ${tractate}`,
				availableTractates: Object.keys(TRACTATE_IDS)
			}, { status: 400 });
		}
		
		// Convert to daf-supplier format
		const dafForAPI = convertDafToHebrewBooksFormat(`${page}${amud}`);
		
		// Fetch text from daf-supplier
		const dafSupplierUrl = new URL('/api/daf-supplier', url.origin);
		dafSupplierUrl.searchParams.set('mesechta', mesechtaId);
		dafSupplierUrl.searchParams.set('daf', dafForAPI.toString());
		
		console.log(`Fetching text from: ${dafSupplierUrl.toString()}`);
		const textResponse = await fetch(dafSupplierUrl.toString());
		
		if (!textResponse.ok) {
			throw new Error(`Failed to fetch text: ${textResponse.status}`);
		}
		
		const textData = await textResponse.json();
		
		// Check if we have text to analyze
		if (!textData.mainText || textData.mainText.length < 50) {
			return json({ 
				error: 'Insufficient text content for analysis',
				textLength: textData.mainText?.length || 0
			}, { status: 400 });
		}
		
		// Prepare text for analysis
		let analysisText = textData.mainText;
		
		// Clean HTML tags if present
		analysisText = analysisText
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]*>/g, '')
			.replace(/&[a-zA-Z]+;/g, '')
			.replace(/&#\d+;/g, '');
		
		// Add Rashi if requested
		if (includeRashi && textData.rashi) {
			const cleanRashi = textData.rashi
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/<[^>]*>/g, '');
			analysisText += '\n\nרש"י:\n' + cleanRashi;
		}
		
		// Add Tosafot if requested
		if (includeTosafot && textData.tosafot) {
			const cleanTosafot = textData.tosafot
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/<[^>]*>/g, '');
			analysisText += '\n\nתוספות:\n' + cleanTosafot;
		}
		
		console.log(`Analyzing ${analysisText.length} characters of text from ${tractate} ${page}${amud}`);
		
		// Perform AI analysis
		const analysis = await analyzer.analyzeTalmudPage({
			text: analysisText,
			tractate,
			page,
			amud,
			includeRashi,
			includeTosafot
		});
		
		// Add metadata
		const result = {
			...analysis,
			tractate,
			page,
			amud,
			timestamp: Date.now(),
			textLength: analysisText.length,
			includeRashi,
			includeTosafot,
			cached: false
		};
		
		// Cache the result
		if (platform?.env?.ANALYSIS_KV) {
			try {
				await platform.env.ANALYSIS_KV.put(
					cacheKey,
					JSON.stringify(result),
					{ expirationTtl: CACHE_TTL }
				);
			} catch (error) {
				console.error('Cache write error:', error);
			}
		}
		
		return json(result);
		
	} catch (error) {
		console.error('Analysis error:', error);
		return json({ 
			error: 'Analysis failed',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

/**
 * POST /api/talmud-analysis - Analyze provided Talmud text
 * 
 * Request body:
 * - text: The Talmud text to analyze (required)
 * - tractate: Tractate name for context (optional)
 * - page: Page number for context (optional)
 * - amud: Side of page for context (optional)
 * - rashi: Rashi commentary text (optional)
 * - tosafot: Tosafot commentary text (optional)
 * 
 * Returns:
 * - 200: Analysis results
 * - 400: Missing text or invalid request
 * - 503: Analysis service not configured
 * - 500: Analysis error
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = await request.json();
		const { text, tractate, page, amud, rashi, tosafot } = body;
		
		if (!text) {
			return json({ 
				error: 'Missing required field: text'
			}, { status: 400 });
		}
		
		// Create analyzer instance with API key from environment
		const apiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY || process.env.PUBLIC_OPENROUTER_API_KEY;
		const analyzer = new TalmudAnalyzer(apiKey);
		
		if (!analyzer.isConfigured()) {
			return json({ 
				error: 'Talmud analyzer not configured',
				message: 'OpenRouter API key is required for analysis'
			}, { status: 503 });
		}
		
		// Combine texts if commentaries provided
		let fullText = text;
		if (rashi) {
			fullText += '\n\nרש"י:\n' + rashi;
		}
		if (tosafot) {
			fullText += '\n\nתוספות:\n' + tosafot;
		}
		
		// Perform analysis
		const analysis = await analyzer.analyzeTalmudPage({
			text: fullText,
			tractate,
			page,
			amud,
			includeRashi: !!rashi,
			includeTosafot: !!tosafot
		});
		
		return json({
			...analysis,
			tractate,
			page,
			amud,
			timestamp: Date.now(),
			textLength: fullText.length
		});
		
	} catch (error) {
		console.error('POST analysis error:', error);
		return json({ 
			error: 'Analysis failed',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};