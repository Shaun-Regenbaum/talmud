import { PUBLIC_OPENROUTER_API_KEY, PUBLIC_OPENROUTER_MODEL } from '$env/static/public';

export interface TranslationRequest {
	text: string;
	context?: string;
	targetLanguage?: string;
}

export interface TranslationResponse {
	translation: string;
	model: string;
	confidence?: number;
}

class OpenRouterTranslator {
	private apiKey: string;
	private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private cache: Map<string, TranslationResponse> = new Map();
	private pendingRequests: Map<string, Promise<TranslationResponse>> = new Map();
	
	// Model preferences for translation - using models good at Hebrew
	private models = {
		primary: PUBLIC_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free',
		fallback: 'openai/gpt-4o-mini',
		fast: 'google/gemini-2.0-flash-exp:free'
	};
	
	constructor(apiKey?: string) {
		this.apiKey = apiKey || PUBLIC_OPENROUTER_API_KEY || '';
		if (!this.apiKey) {
			console.warn('OpenRouter API key not configured');
		}
	}
	
	async translateText(request: TranslationRequest): Promise<TranslationResponse> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not configured');
		}
		
		const { text, context, targetLanguage = 'English' } = request;
		
		// Create cache key
		const cacheKey = `${text}-${context || ''}-${targetLanguage}`;
		
		// Check cache first
		if (this.cache.has(cacheKey)) {
			console.log('📦 Returning cached translation');
			return this.cache.get(cacheKey)!;
		}
		
		// Check if there's already a pending request for this text
		if (this.pendingRequests.has(cacheKey)) {
			console.log('⏳ Waiting for pending translation');
			return this.pendingRequests.get(cacheKey)!;
		}
		
		// Build the prompt
		const systemPrompt = `You are an expert translator specializing in Talmudic Hebrew and Aramaic. 
Your task is to provide accurate, contextual translations that preserve the meaning and nuance of the original text.
When translating Talmudic terms, preserve transliterated terms when they have specific technical meanings.
Provide clear, readable ${targetLanguage} that maintains the scholarly tone of the original.`;
		
		const userPrompt = context 
			? `Translate the following Talmudic text to ${targetLanguage}. Context: ${context}\n\nText: ${text}`
			: `Translate the following Talmudic text to ${targetLanguage}: ${text}`;
		
		// Create the promise for this translation
		const translationPromise = (async () => {
			try {
				const response = await fetch(this.baseUrl, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
						'HTTP-Referer': 'https://talmud.app',
						'X-Title': 'Talmud Study App'
					},
					body: JSON.stringify({
						model: this.models.primary,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt }
						],
						temperature: 0.3, // Lower temperature for more consistent translations
						max_tokens: 500
					})
				});
				
				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					console.log('Primary model failed:', this.models.primary, errorData);
					throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
				}
				
				const data = await response.json();
				const translation = data.choices[0]?.message?.content?.trim() || '';
				
				const result = {
					translation,
					model: data.model || this.models.primary,
					confidence: 0.9 // Could be calculated based on response metadata
				};
				
				// Cache the result
				this.cache.set(cacheKey, result);
				
				// Clean up pending request
				this.pendingRequests.delete(cacheKey);
				
				return result;
			} catch (error) {
				// Clean up pending request on error
				this.pendingRequests.delete(cacheKey);
				
				console.error('Translation error:', error);
				throw error;
			}
		})();
		
		// Store the pending request
		this.pendingRequests.set(cacheKey, translationPromise);
		
		return translationPromise;
	}
	
	private async translateWithFallback(request: TranslationRequest): Promise<TranslationResponse> {
		const { text, context, targetLanguage = 'English' } = request;
		
		const systemPrompt = `Translate Talmudic Hebrew/Aramaic to ${targetLanguage}. Be accurate and preserve meaning.`;
		const userPrompt = `Translate: ${text}`;
		
		try {
			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://talmud.app',
					'X-Title': 'Talmud Study App'
				},
				body: JSON.stringify({
					model: this.models.fallback,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.3,
					max_tokens: 300
				})
			});
			
			const data = await response.json();
			const translation = data.choices[0]?.message?.content?.trim() || '';
			
			return {
				translation,
				model: data.model || this.models.fallback,
				confidence: 0.8
			};
		} catch (error) {
			console.error('Fallback translation error:', error);
			throw error;
		}
	}
	
	// Batch translation for efficiency
	async translateBatch(texts: string[], context?: string): Promise<TranslationResponse[]> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not configured');
		}
		
		const systemPrompt = `You are an expert translator specializing in Talmudic Hebrew and Aramaic.
Translate each numbered text segment accurately, preserving meaning and technical terms.
Return translations in the same numbered format.`;
		
		const numberedTexts = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');
		const userPrompt = context 
			? `Translate these Talmudic texts to English. Context: ${context}\n\n${numberedTexts}`
			: `Translate these Talmudic texts to English:\n\n${numberedTexts}`;
		
		try {
			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://talmud.app',
					'X-Title': 'Talmud Study App'
				},
				body: JSON.stringify({
					model: this.models.fast, // Use faster model for batch
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.3,
					max_tokens: 2000
				})
			});
			
			const data = await response.json();
			const translationText = data.choices[0]?.message?.content || '';
			
			// Parse numbered translations
			const translations = translationText
				.split('\n')
				.filter(line => /^\d+\./.test(line))
				.map(line => line.replace(/^\d+\.\s*/, '').trim());
			
			// Ensure we have translations for all texts
			while (translations.length < texts.length) {
				translations.push('[Translation unavailable]');
			}
			
			return translations.map(translation => ({
				translation,
				model: data.model || this.models.fast,
				confidence: 0.85
			}));
		} catch (error) {
			console.error('Batch translation error:', error);
			// Return empty translations as fallback
			return texts.map(() => ({
				translation: '[Translation error]',
				model: 'none',
				confidence: 0
			}));
		}
	}
	
	// Check if API key is configured
	isConfigured(): boolean {
		return !!this.apiKey;
	}
	
	// Clear translation cache
	clearCache(): void {
		this.cache.clear();
		console.log('🗑️ Translation cache cleared');
	}
	
	// Get cache size
	getCacheSize(): number {
		return this.cache.size;
	}
	
	// Save cache to localStorage (for persistence)
	saveCache(): void {
		try {
			const cacheData = Array.from(this.cache.entries());
			localStorage.setItem('talmud-translation-cache', JSON.stringify(cacheData));
			console.log(`💾 Saved ${cacheData.length} translations to cache`);
		} catch (error) {
			console.error('Failed to save cache:', error);
		}
	}
	
	// Load cache from localStorage
	loadCache(): void {
		try {
			const cacheData = localStorage.getItem('talmud-translation-cache');
			if (cacheData) {
				const entries = JSON.parse(cacheData);
				this.cache = new Map(entries);
			}
		} catch (error) {
			console.error('Failed to load cache:', error);
		}
	}
}

// Export singleton instance
export const openRouterTranslator = new OpenRouterTranslator();

// Load cache on initialization
if (typeof window !== 'undefined') {
	openRouterTranslator.loadCache();
	
	// Save cache periodically
	setInterval(() => {
		openRouterTranslator.saveCache();
	}, 60000); // Save every minute
	
	// Save cache before page unload
	window.addEventListener('beforeunload', () => {
		openRouterTranslator.saveCache();
	});
}

// Export class for custom instances
export { OpenRouterTranslator };