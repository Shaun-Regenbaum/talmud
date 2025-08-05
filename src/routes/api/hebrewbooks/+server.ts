import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/hebrewbooks';

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