/**
 * Translation API Endpoint
 * Provides server-side translation for selected text using OpenRouter
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createOpenRouterTranslator } from '$lib/api/openrouter-translator';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const { text, context } = await request.json();
		
		if (!text || text.trim().length === 0) {
			return json({ error: 'Text is required' }, { status: 400 });
		}
		
		// Get API key and create translator instance
		const openRouterApiKey = platform?.env?.OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			return json({ error: 'Translation service not configured' }, { status: 503 });
		}
		
		const translator = createOpenRouterTranslator(openRouterApiKey);
		
		// Translate the text
		const result = await translator.translateText({
			text: text.trim(),
			context: context || 'Talmudic Hebrew/Aramaic text',
			targetLanguage: 'English'
		});
		
		return json({
			translation: result.translation,
			model: result.model,
			confidence: result.confidence || 0.9
		});
		
	} catch (error) {
		console.error('Translation API error:', error);
		return json({
			error: 'Translation failed',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};