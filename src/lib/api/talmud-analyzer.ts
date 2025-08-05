import { PUBLIC_OPENROUTER_API_KEY, PUBLIC_OPENROUTER_MODEL } from '$env/static/public';

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
		accurate: PUBLIC_OPENROUTER_MODEL || 'moonshotai/kimi-k2:free'
	};
	
	constructor(apiKey?: string) {
		this.apiKey = apiKey || PUBLIC_OPENROUTER_API_KEY || '';
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
		
		const systemPrompt = `You are an expert Talmud scholar analyzing Jewish legal texts. 
Your task is to identify rabbis, classify text sections, and determine time periods.
Be precise and provide confidence scores for your identifications.`;
		
		const userPrompt = `Analyze this Talmud text from ${contextInfo} and provide a JSON response with:

1. RABBIS: Identify all rabbis/sages mentioned with their:
   - Hebrew name as it appears in text
   - English transliteration
   - Title (Rabbi, Rav, Mar, etc.)
   - Time period (Tannaim/Amoraim/etc.)
   - Generation number if known
   - Confidence score (0-1)

2. TEXT SECTIONS: Classify portions as:
   - "aggadah" (narrative, stories, parables - look for מעשה, משל, etc.)
   - "halacha" (legal discussion, rulings)
   - "mixed" (contains both)
   Include indicators that helped classify each section

3. TIME PERIODS: Based on the rabbis identified, determine:
   - All time periods represented
   - The primary/dominant period
   - Earliest and latest years spanned

Common indicators:
- Aggadah: מעשה (story), משל (parable), אמר ליה (narrative dialogue), פעם אחת (once upon a time)
- Halacha: תנן (we learned), תניא (it was taught), הלכה (law), מותר/אסור (permitted/forbidden)
- Rabbi titles: רבי (Rabbi - usually Tannaim), רב (Rav - usually Amoraim), מר (Mar)

Text to analyze:
${text.slice(0, 6000)}

Return ONLY valid JSON matching this structure:
{
  "rabbis": [
    {
      "name": "English name",
      "hebrewName": "Hebrew as in text",
      "title": "Rabbi/Rav/etc",
      "period": {
        "name": "Tannaim/Amoraim/etc",
        "hebrewName": "תנאים/אמוראים",
        "startYear": number,
        "endYear": number
      },
      "generation": number or null,
      "location": "Babylon/Israel/etc" or null,
      "confidence": 0-1
    }
  ],
  "sections": [
    {
      "startIndex": number,
      "endIndex": number,
      "text": "excerpt",
      "type": "aggadah/halacha/mixed",
      "confidence": 0-1,
      "indicators": ["list of Hebrew terms that indicated this classification"]
    }
  ],
  "timePeriods": [
    {
      "name": "Period name",
      "hebrewName": "Hebrew name",
      "startYear": number,
      "endYear": number
    }
  ],
  "primaryPeriod": {
    "name": "Most represented period",
    "hebrewName": "Hebrew",
    "startYear": number,
    "endYear": number
  },
  "summary": {
    "totalRabbis": number,
    "aggadahPercentage": number,
    "halachaPercentage": number,
    "timeSpan": {
      "earliest": year,
      "latest": year
    }
  },
  "confidence": overall confidence 0-1
}`;
		
		try {
			console.log('Sending request to OpenRouter with model:', this.models.balanced);
			console.log('API Key configured:', !!this.apiKey);
			
			const requestBody = {
				model: this.models.balanced,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				temperature: 0.3,
				max_tokens: 2000
				// Note: removing response_format as it may not be supported by all models
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
			let analysisText = data.choices[0]?.message?.content || '{}';
			
			// Clean up the response - remove markdown code blocks if present
			analysisText = analysisText.trim();
			if (analysisText.startsWith('```json')) {
				analysisText = analysisText.slice(7); // Remove ```json
			} else if (analysisText.startsWith('```')) {
				analysisText = analysisText.slice(3); // Remove ```
			}
			if (analysisText.endsWith('```')) {
				analysisText = analysisText.slice(0, -3); // Remove trailing ```
			}
			analysisText = analysisText.trim();
			
			let analysis: any;
			try {
				analysis = JSON.parse(analysisText);
			} catch (parseError) {
				console.error('Failed to parse AI response as JSON:', analysisText);
				analysis = this.getFallbackAnalysis();
			}
			
			const result: AnalysisResponse = {
				rabbis: analysis.rabbis || [],
				sections: analysis.sections || [],
				timePeriods: analysis.timePeriods || [],
				primaryPeriod: analysis.primaryPeriod || null,
				summary: analysis.summary || {
					totalRabbis: 0,
					aggadahPercentage: 0,
					halachaPercentage: 100,
					timeSpan: { earliest: 0, latest: 500 }
				},
				model: data.model || this.models.balanced,
				confidence: analysis.confidence || 0.5
			};
			
			this.enrichWithDatabase(result);
			this.cache.set(cacheKey, result);
			
			return result;
		} catch (error) {
			console.error('Analysis error:', error);
			console.error('Full error details:', error instanceof Error ? error.message : error);
			return this.getFallbackAnalysis();
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

export const talmudAnalyzer = new TalmudAnalyzer();
export { TalmudAnalyzer };