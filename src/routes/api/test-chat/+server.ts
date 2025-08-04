import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
	console.log('🧪 OpenRouter chat completions test endpoint called');
	
	const openRouterApiKey = platform?.env?.PUBLIC_OPENROUTER_API_KEY;
	
	if (!openRouterApiKey) {
		return json({
			test: true,
			error: 'API key not found in environment'
		});
	}

	// Test model from URL parameter, default to a common one
	const testModel = url.searchParams.get('model') || 'anthropic/claude-3.5-sonnet';

	try {
		console.log('🔑 Testing chat completions with model:', testModel);
		
		const requestBody = {
			model: testModel,
			messages: [
				{ role: 'user', content: 'Hello! Please respond with just "API test successful".' }
			],
			max_tokens: 50
		};

		const headers = {
			'Authorization': `Bearer ${openRouterApiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://talmud.app',
			'X-Title': 'Talmud Study App'
		};

		console.log('🔍 Request details:', {
			url: 'https://openrouter.ai/api/v1/chat/completions',
			headers: {
				'Authorization': `Bearer ${openRouterApiKey.substring(0, 8)}...`,
				'Content-Type': headers['Content-Type'],
				'HTTP-Referer': headers['HTTP-Referer'],
				'X-Title': headers['X-Title']
			},
			bodyLength: JSON.stringify(requestBody).length
		});

		const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody)
		});

		const responseText = await testResponse.text();
		console.log('📊 OpenRouter chat response:', {
			status: testResponse.status,
			statusText: testResponse.statusText,
			bodyLength: responseText.length
		});

		return json({
			test: true,
			model: testModel,
			apiKeyValid: testResponse.ok,
			statusCode: testResponse.status,
			statusText: testResponse.statusText,
			keyLength: openRouterApiKey.length,
			keyPreview: `${openRouterApiKey.substring(0, 8)}...`,
			responseBodyLength: responseText.length,
			responsePreview: responseText.substring(0, 500),
			fullResponse: testResponse.ok ? JSON.parse(responseText) : responseText
		});
	} catch (error) {
		console.error('❌ OpenRouter chat test failed:', error);
		
		return json({
			test: true,
			error: error instanceof Error ? error.message : String(error),
			keyLength: openRouterApiKey.length,
			keyPreview: `${openRouterApiKey.substring(0, 8)}...`
		});
	}
};