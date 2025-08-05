/**
 * @fileoverview HebrewBooks API Endpoint - Proxy for daf-supplier API
 * 
 * This endpoint serves as a proxy to the daf-supplier Cloudflare Worker,
 * which provides structured Talmud text data from HebrewBooks.org.
 * 
 * Features:
 * - Converts Sefaria-style references (2a, 2b) to HebrewBooks format
 * - Adds proper headers for API compatibility
 * - Returns structured text with HTML formatting
 * - Caches results in KV storage for 7 days
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
 * GET /api/hebrewbooks - Fetch Talmud text from daf-supplier
 * 
 * Query parameters:
 * - tractate: Tractate name (required)
 * - daf: Page reference in format '2a' or '2b' (required)
 * 
 * Returns:
 * - 200: Text data with mainText, rashi, tosafot fields
 * - 400: Missing parameters or unknown tractate
 * - 500: Fetch error or API failure
 */
export const GET: RequestHandler = async ({ url, fetch, platform }) => {
	const tractate = url.searchParams.get('tractate');
	const daf = url.searchParams.get('daf');
	
	if (!tractate || !daf) {
		return json({ error: 'Missing required parameters: tractate, daf' }, { status: 400 });
	}

	try {
		// Get tractate ID
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
		
		// Convert daf format
		const dafForAPI = convertDafToHebrewBooksFormat(daf);
		
		// Fetch directly from HebrewBooks API
		const hebrewBooksUrl = `https://www.hebrewbooks.org/api/shas.aspx?mesechta=${mesechtaId}&daf=${dafForAPI}&format=json`;
		
		const response = await fetch(hebrewBooksUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Talmud-Study-App/1.0)',
				'Accept': 'application/json'
			}
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			return json({ 
				error: 'Failed to fetch from daf-supplier', 
				status: response.status,
				details: errorText
			}, { status: response.status });
		}
		
		const data = await response.json();
		
		// Process the extracted data
		const processedData = {
			tractate,
			daf,
			...data,
			source: 'daf-supplier',
			timestamp: Date.now()
		};
		
		// Cache the result
		if (platform?.env?.HEBREWBOOKS_KV) {
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
		
	} catch (error) {
		return json({
			error: 'Failed to fetch Hebrew Books data',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};