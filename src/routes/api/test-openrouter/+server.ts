import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	console.log('🧪 OpenRouter API key test endpoint called');
	
	const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY;
	
	if (!openRouterApiKey) {
		return json({
			test: true,
			apiKeyValid: false,
			error: 'API key not found in environment',
			platformEnvKeys: platform?.env ? Object.keys(platform.env) : 'no platform env'
		});
	}

	try {
		console.log('🔑 Testing API key with OpenRouter models endpoint');
		
		const testResponse = await fetch('https://openrouter.ai/api/v1/models', {
			headers: {
				'Authorization': `Bearer ${openRouterApiKey}`,
				'HTTP-Referer': 'https://talmud.app',
				'X-Title': 'Talmud Study App'
			}
		});

		const responseText = await testResponse.text();
		console.log('📊 OpenRouter response:', {
			status: testResponse.status,
			statusText: testResponse.statusText,
			headers: Object.fromEntries(testResponse.headers.entries()),
			bodyLength: responseText.length
		});

		return json({
			test: true,
			apiKeyValid: testResponse.ok,
			statusCode: testResponse.status,
			statusText: testResponse.statusText,
			keyLength: openRouterApiKey.length,
			keyPreview: `${openRouterApiKey.substring(0, 8)}...`,
			responseBodyLength: responseText.length,
			responsePreview: responseText.substring(0, 200)
		});
	} catch (error) {
		console.error('❌ OpenRouter API test failed:', error);
		
		return json({
			test: true,
			apiKeyValid: false,
			error: error instanceof Error ? error.message : String(error),
			keyLength: openRouterApiKey.length,
			keyPreview: `${openRouterApiKey.substring(0, 8)}...`
		});
	}
};