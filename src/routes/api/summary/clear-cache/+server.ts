import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Check if we're in Cloudflare Workers environment
const isCloudflareWorkers = typeof caches !== 'undefined';

export const DELETE: RequestHandler = async () => {
	let cleared = 0;
	
	try {
		if (isCloudflareWorkers) {
			// Clear Cloudflare KV cache if available
			if (typeof SUMMARIES_KV !== 'undefined') {
				// List all keys with the summary prefix
				const list = await SUMMARIES_KV.list({ prefix: 'talmud-summary:' });
				
				// Delete all summary keys
				for (const key of list.keys) {
					await SUMMARIES_KV.delete(key.name);
					cleared++;
				}
				
				console.log(`🗑️ Cleared ${cleared} cached summaries from KV`);
			}
		}
		
		return json({
			success: true,
			message: `Cleared ${cleared} cached summaries`,
			cleared
		});
		
	} catch (error) {
		console.error('Cache clear error:', error);
		return json({
			success: false,
			error: 'Failed to clear cache',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};