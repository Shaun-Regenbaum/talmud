import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	console.log('🔍 Debug endpoint called');
	
	try {
		const envInfo = {
			hasPlatform: !!platform,
			hasPlatformEnv: !!platform?.env,
			platformEnvKeys: platform?.env ? Object.keys(platform.env) : [],
			isCloudflareWorkers: typeof caches !== 'undefined',
			// Check specific API key variations
			publicOpenRouterKey: platform?.env?.PUBLIC_OPENROUTER_API_KEY ? 'present' : 'missing',
			openRouterKey: platform?.env?.OPENROUTER_API_KEY ? 'present' : 'missing',
			publicOpenRouterKeyLength: platform?.env?.PUBLIC_OPENROUTER_API_KEY?.length || 0,
			openRouterKeyLength: platform?.env?.OPENROUTER_API_KEY?.length || 0,
		};

		console.log('🔍 Environment info:', envInfo);

		return json({
			...envInfo,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('❌ Debug endpoint error:', error);
		return json({
			error: 'Debug failed',
			details: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
};