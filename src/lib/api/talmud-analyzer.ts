// Note: API keys are now private and passed via constructor parameter

export interface RabbiInfo {
	name: string;
	hebrewName: string;
	title: string;
	period: TimePeriod;
	generation?: number;
	location?: string;
	confidence: number;
}

export interface TimePeriod {
	name: string;
	hebrewName: string;
	startYear: number;
	endYear: number;
}

export interface TextSection {
	startIndex: number;
	endIndex: number;
	text: string;
	type: 'aggadah' | 'halacha' | 'mixed';
	confidence: number;
	indicators: string[];
}

export interface AnalysisRequest {
	text: string;
	tractate?: string;
	page?: string;
	amud?: string;
	includeRashi?: boolean;
	includeTosafot?: boolean;
}

export interface AnalysisResponse {
	rabbis: RabbiInfo[];
	sections: TextSection[];
	timePeriods: TimePeriod[];
	primaryPeriod: TimePeriod | null;
	summary: {
		totalRabbis: number;
		aggadahPercentage: number;
		halachaPercentage: number;
		timeSpan: {
			earliest: number;
			latest: number;
		};
	};
	model: string;
	confidence: number;
}

const TIME_PERIODS: TimePeriod[] = [
	{ name: 'Tannaim', hebrewName: 'תנאים', startYear: 10, endYear: 220 },
	{ name: 'Amoraim', hebrewName: 'אמוראים', startYear: 220, endYear: 500 },
	{ name: 'Savoraim', hebrewName: 'סבוראים', startYear: 500, endYear: 650 },
	{ name: 'Geonim', hebrewName: 'גאונים', startYear: 650, endYear: 1050 },
	{ name: 'Rishonim', hebrewName: 'ראשונים', startYear: 1050, endYear: 1500 },
	{ name: 'Acharonim', hebrewName: 'אחרונים', startYear: 1500, endYear: 1900 }
];

const RABBI_DATABASE: Partial<Record<string, RabbiInfo>> = {
	'רבי עקיבא': { name: 'Rabbi Akiva', hebrewName: 'רבי עקיבא', title: 'Rabbi', period: TIME_PERIODS[0], generation: 3, confidence: 1 },
	'רבי מאיר': { name: 'Rabbi Meir', hebrewName: 'רבי מאיר', title: 'Rabbi', period: TIME_PERIODS[0], generation: 4, confidence: 1 },
	'רבי יהודה': { name: 'Rabbi Yehuda', hebrewName: 'רבי יהודה', title: 'Rabbi', period: TIME_PERIODS[0], generation: 4, confidence: 1 },
	'רבי שמעון': { name: 'Rabbi Shimon', hebrewName: 'רבי שמעון', title: 'Rabbi', period: TIME_PERIODS[0], generation: 4, confidence: 1 },
	'רב': { name: 'Rav', hebrewName: 'רב', title: 'Rav', period: TIME_PERIODS[1], generation: 1, location: 'Babylon', confidence: 1 },
	'שמואל': { name: 'Shmuel', hebrewName: 'שמואל', title: 'Mar', period: TIME_PERIODS[1], generation: 1, location: 'Babylon', confidence: 1 },
	'רבי יוחנן': { name: 'Rabbi Yochanan', hebrewName: 'רבי יוחנן', title: 'Rabbi', period: TIME_PERIODS[1], generation: 2, location: 'Israel', confidence: 1 },
	'ריש לקיש': { name: 'Reish Lakish', hebrewName: 'ריש לקיש', title: 'Rabbi', period: TIME_PERIODS[1], generation: 2, location: 'Israel', confidence: 1 },
	'רבא': { name: 'Rava', hebrewName: 'רבא', title: 'Rav', period: TIME_PERIODS[1], generation: 4, location: 'Babylon', confidence: 1 },
	'אביי': { name: 'Abaye', hebrewName: 'אביי', title: 'Rav', period: TIME_PERIODS[1], generation: 4, location: 'Babylon', confidence: 1 },
	'רב פפא': { name: 'Rav Papa', hebrewName: 'רב פפא', title: 'Rav', period: TIME_PERIODS[1], generation: 5, location: 'Babylon', confidence: 1 },
	'רב אשי': { name: 'Rav Ashi', hebrewName: 'רב אשי', title: 'Rav', period: TIME_PERIODS[1], generation: 6, location: 'Babylon', confidence: 1 },
	'רבינא': { name: 'Ravina', hebrewName: 'רבינא', title: 'Rav', period: TIME_PERIODS[1], generation: 7, location: 'Babylon', confidence: 1 }
};

class TalmudAnalyzer {
	private apiKey: string;
	private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private cache: Map<string, AnalysisResponse> = new Map();
	
	private models = {
		fast: 'google/gemini-2.0-flash-exp:free',
		balanced: 'moonshotai/kimi-k2:free',
		accurate: 'google/gemini-2.5-flash'
	};
	
	constructor(apiKey?: string) {
		this.apiKey = apiKey || '';
		if (!this.apiKey) {
			throw new Error('OpenRouter API key is required');
		}
	}
	
	async analyzeTalmudPage(request: AnalysisRequest): Promise<AnalysisResponse> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not configured');
		}
		
		const cacheKey = this.getCacheKey(request);
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}
		
		const { text, tractate, page, amud } = request;
		const contextInfo = tractate && page && amud ? `${tractate} ${page}${amud}` : 'Talmud text';
		
		try {
			// Run all three analyses in parallel for better performance
			const [textSections, rabbis, timePeriods] = await Promise.all([
				this.classifyTextSections(text, contextInfo),
				this.identifyRabbis(text, contextInfo),
				this.analyzeTimePeriods(text, contextInfo)
			]);
			
			// Combine results
			const result: AnalysisResponse = {
				rabbis,
				sections: textSections,
				timePeriods,
				primaryPeriod: timePeriods[0] || null,
				summary: {
					totalRabbis: rabbis.length,
					aggadahPercentage: this.calculatePercentage(textSections, 'aggadah'),
					halachaPercentage: this.calculatePercentage(textSections, 'halacha'),
					timeSpan: {
						earliest: Math.min(...timePeriods.map(p => p.startYear), 0),
						latest: Math.max(...timePeriods.map(p => p.endYear), 500)
					}
				},
				model: this.models.accurate,
				confidence: 0.8
			};
			
			this.enrichWithDatabase(result);
			this.cache.set(cacheKey, result);
			
			return result;
		} catch (error) {
			console.error('Analysis error:', error);
			return this.getFallbackAnalysis();
		}
	}
	
	private async classifyTextSections(text: string, contextInfo: string): Promise<TextSection[]> {
		const systemPrompt = `You are an expert in Talmudic literature specializing in identifying different types of content.
Your task is to classify sections of text as either halacha (legal discussion) or aggadah (narrative/stories).`;
		
		const userPrompt = `Analyze this Talmud text from ${contextInfo} and divide it into sections.

IMPORTANT: You must classify the ENTIRE text. Divide it into meaningful sections of 50-200 characters each.
Every part of the text should be classified as either:
- "halacha": Legal discussions, debates about law, rulings, permitted/forbidden matters
- "aggadah": Stories, narratives, parables, ethical teachings, historical accounts
- "mixed": Contains both types of content

Look for these indicators:
- Halacha: תנן, תניא, הלכה, מותר, אסור, חייב, פטור, טמא, טהור
- Aggadah: מעשה, משל, אמר ליה (in narrative context), פעם אחת, מכאן

Text to analyze (${text.length} characters):
${text.slice(0, 8000)}

Return a JSON array of sections:
[
  {
    "startIndex": 0,
    "endIndex": 150,
    "text": "the actual text excerpt",
    "type": "halacha",
    "confidence": 0.9,
    "indicators": ["תנן", "מותר"]
  }
]`;

		try {
			const response = await this.makeAPICall(systemPrompt, userPrompt, 8000);
			console.log('Text classification raw response:', response);
			// The response should be a direct array, not an object with sections property
			if (Array.isArray(response)) {
				console.log('Returning array with', response.length, 'sections');
				return response;
			}
			console.log('Not an array, checking for sections property');
			return response.sections || [];
		} catch (error) {
			console.error('Text classification error:', error);
			return [];
		}
	}
	
	private async identifyRabbis(text: string, contextInfo: string): Promise<RabbiInfo[]> {
		const systemPrompt = `You are an expert in Talmudic history specializing in identifying rabbis and sages.
Your task is to identify all rabbis mentioned in the text with their historical details.`;
		
		const userPrompt = `Identify ALL rabbis and sages mentioned in this Talmud text from ${contextInfo}.

For each rabbi, provide:
- name: English transliteration
- hebrewName: As it appears in the text
- title: Rabbi/Rav/Mar/etc.
- period: Tannaim/Amoraim/Savoraim/Geonim/Rishonim/Acharonim
- generation: If known (1-7 for Tannaim/Amoraim)
- location: Babylon/Israel/etc. if mentioned
- confidence: 0-1

Common rabbi titles to look for:
- רבי (Rabbi - usually Tannaim)
- רב (Rav - usually Amoraim)
- מר (Mar)
- רבן (Rabban)

Text to analyze (${text.length} characters):
${text.slice(0, 8000)}

Return ONLY a JSON array of rabbi objects.`;
		
		try {
			const response = await this.makeAPICall(systemPrompt, userPrompt, 6000);
			// The response should be a direct array, not an object with rabbis property
			if (Array.isArray(response)) {
				return response;
			}
			return response.rabbis || [];
		} catch (error) {
			console.error('Rabbi identification error:', error);
			return [];
		}
	}
	
	private async analyzeTimePeriods(text: string, contextInfo: string): Promise<TimePeriod[]> {
		const systemPrompt = `You are an expert in Jewish history specializing in Talmudic time periods.
Your task is to determine which historical periods are represented in the text.`;
		
		const userPrompt = `Analyze this Talmud text from ${contextInfo} and identify the time periods.

Based on the rabbis, language style, and content, determine:
1. Which time periods are represented
2. The primary/dominant period

Time periods to consider:
- Tannaim (תנאים): 10-220 CE
- Amoraim (אמוראים): 220-500 CE  
- Savoraim (סבוראים): 500-650 CE
- Geonim (גאונים): 650-1050 CE
- Rishonim (ראשונים): 1050-1500 CE
- Acharonim (אחרונים): 1500-present

Text to analyze (${text.length} characters):
${text.slice(0, 5000)}

Return a JSON array of time periods with this EXACT structure for each period:
{
  "name": "Period name in English (e.g., 'Amoraim')",
  "hebrewName": "Hebrew name (e.g., 'אמוראים')",
  "startYear": number (e.g., 220),
  "endYear": number (e.g., 500)
}

Order by prominence (most dominant period first).`;
		
		try {
			const response = await this.makeAPICall(systemPrompt, userPrompt, 4000);
			// Validate and fix the response
			let periods: TimePeriod[] = [];
			
			if (Array.isArray(response)) {
				periods = response;
			} else if (response.timePeriods && Array.isArray(response.timePeriods)) {
				periods = response.timePeriods;
			}
			
			// Validate each period and provide defaults if missing
			return periods.map(period => ({
				name: period.name || 'Unknown',
				hebrewName: period.hebrewName || '',
				startYear: period.startYear || 0,
				endYear: period.endYear || new Date().getFullYear()
			})).filter(period => period.name !== 'Unknown');
			
		} catch (error) {
			console.error('Time period analysis error:', error);
			// Return default Talmudic periods
			return [
				{ name: 'Amoraim', hebrewName: 'אמוראים', startYear: 220, endYear: 500 },
				{ name: 'Tannaim', hebrewName: 'תנאים', startYear: 10, endYear: 220 }
			];
		}
	}
	
	private calculatePercentage(sections: TextSection[], type: string): number {
		if (!sections || sections.length === 0) return 0;
		
		const totalLength = sections.reduce((sum, s) => sum + (s.endIndex - s.startIndex), 0);
		const typeLength = sections
			.filter(s => s.type === type)
			.reduce((sum, s) => sum + (s.endIndex - s.startIndex), 0);
		
		return totalLength > 0 ? Math.round((typeLength / totalLength) * 100) : 0;
	}
	
	private async makeAPICall(systemPrompt: string, userPrompt: string, maxTokens: number = 8000): Promise<any> {
		console.log('Making API call with model:', this.models.accurate);
		
		const requestBody = {
			model: this.models.accurate,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: 0.3,
			max_tokens: maxTokens
		};
		
		const response = await fetch(this.baseUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://talmud.app',
				'X-Title': 'Talmud Analyzer'
			},
			body: JSON.stringify(requestBody)
		});
		
		if (!response.ok) {
			const errorBody = await response.text();
			console.error('OpenRouter API error:', response.status, errorBody);
			throw new Error(`OpenRouter API error: ${response.status} - ${errorBody}`);
		}
		
		const data = await response.json();
		let content = data.choices[0]?.message?.content || '{}';
		
		// Clean up the response - remove markdown code blocks if present
		content = content.trim();
		if (content.startsWith('```json')) {
			content = content.slice(7);
		} else if (content.startsWith('```')) {
			content = content.slice(3);
		}
		if (content.endsWith('```')) {
			content = content.slice(0, -3);
		}
		
		try {
			return JSON.parse(content.trim());
		} catch (parseError) {
			console.error('Failed to parse API response:', content);
			return {};
		}
	}
	
	async quickIdentifyRabbis(text: string): Promise<RabbiInfo[]> {
		const simplePrompt = `List all rabbi names in this Hebrew text. Return JSON array of objects with: name (English), hebrewName (Hebrew), title.
Text: ${text.slice(0, 2000)}
Return ONLY a JSON array.`;
		
		try {
			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://talmud.app',
					'X-Title': 'Talmud Rabbi Identifier'
				},
				body: JSON.stringify({
					model: this.models.fast,
					messages: [
						{ role: 'user', content: simplePrompt }
					],
					temperature: 0.2,
					max_tokens: 500
				})
			});
			
			const data = await response.json();
			const rabbisText = data.choices[0]?.message?.content || '[]';
			
			try {
				const rabbis = JSON.parse(rabbisText);
				return rabbis.map((r: any) => this.lookupRabbi(r.hebrewName) || r);
			} catch {
				return [];
			}
		} catch (error) {
			console.error('Quick identify error:', error);
			return [];
		}
	}
	
	private enrichWithDatabase(analysis: AnalysisResponse): void {
		analysis.rabbis = analysis.rabbis.map(rabbi => {
			const dbEntry = this.lookupRabbi(rabbi.hebrewName);
			if (dbEntry) {
				return { ...dbEntry, ...rabbi, confidence: Math.max(rabbi.confidence, dbEntry.confidence) };
			}
			return rabbi;
		});
	}
	
	private lookupRabbi(hebrewName: string): RabbiInfo | null {
		const normalized = hebrewName.trim();
		return RABBI_DATABASE[normalized] || null;
	}
	
	private getCacheKey(request: AnalysisRequest): string {
		const { text, tractate, page, amud } = request;
		const textHash = text.slice(0, 100);
		return `${tractate}-${page}${amud}-${textHash}`;
	}
	
	private getFallbackAnalysis(): AnalysisResponse {
		return {
			rabbis: [],
			sections: [],
			timePeriods: [],
			primaryPeriod: null,
			summary: {
				totalRabbis: 0,
				aggadahPercentage: 0,
				halachaPercentage: 0,
				timeSpan: { earliest: 0, latest: 0 }
			},
			model: 'fallback',
			confidence: 0
		};
	}
	
	isConfigured(): boolean {
		return !!this.apiKey;
	}
	
	clearCache(): void {
		this.cache.clear();
	}
	
	getCacheSize(): number {
		return this.cache.size;
	}
}

// Export class only - no singleton to avoid requiring API key at build time
export { TalmudAnalyzer };