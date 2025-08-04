import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	return json({
		success: true,
		hasPlatform: !!platform,
		hasPlatformEnv: !!platform?.env,
		platformEnvKeys: platform?.env ? Object.keys(platform.env) : 'no platform env',
		publicOpenRouterKey: platform?.env?.PUBLIC_OPENROUTER_API_KEY ? 'present' : 'missing',
		openRouterKey: platform?.env?.OPENROUTER_API_KEY ? 'present' : 'missing',
		publicOpenRouterKeyLength: platform?.env?.PUBLIC_OPENROUTER_API_KEY?.length || 0,
		openRouterKeyLength: platform?.env?.OPENROUTER_API_KEY?.length || 0,
		timestamp: new Date().toISOString()
	});
};