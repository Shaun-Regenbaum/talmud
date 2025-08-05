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
 * 
 * GET /api/hebrewbooks?tractate=Berakhot&daf=2a
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/hebrewbooks';

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
export const GET: RequestHandler = async ({ url, fetch }) => {
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
		
		// Convert daf format
		const dafForAPI = convertDafToHebrewBooksFormat(daf);
		
		// Fetch from daf-supplier with proper headers
		const dafSupplierUrl = `https://daf-supplier.402.workers.dev?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
		
		const response = await fetch(dafSupplierUrl, {
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
		
		// Return the data with additional metadata
		return json({
			...data,
			source: 'daf-supplier',
			cached: false
		});
		
	} catch (error) {
		return json({
			error: 'Failed to fetch Hebrew Books data',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};