<script lang="ts">
	import { onMount } from 'svelte';
	
	let loading = false;
	let error = '';
	let response: any = null;
	let responseTime = 0;
	
	// API endpoint selection
	let selectedEndpoint = 'texts';
	let textRef = 'Berakhot.2a';
	let searchQuery = 'משנה';
	let indexTitle = 'Berakhot';
	let topicSlug = 'torah';
	let linkRef = 'Berakhot.2a';
	let linkType = '';
	let linkDirection = '';
	let calendars = '2024-01-01';
	let nameQuery = 'רש"י';
	let personKey = 'Rashi';
	let collectionSlug = 'tanakh';
	let groupName = 'Talmud';
	let termName = 'Talmud';
	
	// Response formatting
	let prettyPrint = true;
	let showRawResponse = false;
	
	// Text selection
	let selectedTextRef = '';
	let showTextSelection = false;
	
	// Daf supplier data
	let dafSupplierData: any = null;
	let loadingDafSupplier = false;
	
	// Extract text from daf-supplier HTML (same logic as talmud-merged API)
	function extractTalmudContent(html: string): string {
		if (!html) return '';
		
		// First, check if this is already extracted text (not HTML)
		if (!html.includes('<') && !html.includes('DOCTYPE')) {
			return html.trim();
		}
		
		// Apply the same processing as the talmud-merged API
		let text = html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<[^>]*>/g, "")
			.replace(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
			.replace(/var\s+\w+\s*[=;][\s\S]*?;/g, '')
			.replace(/if\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
			.replace(/window\.\w+[\s\S]*?;/g, '')
			.replace(/document\.\w+[\s\S]*?;/g, '')
			.replace(/\{[\s\S]*?\}/g, '')
			.replace(/#[\w-]+\s*\{[\s\S]*?\}/g, '')
			.replace(/\.[\w-]+\s*\{[\s\S]*?\}/g, '')
			.replace(/https?:\/\/[^\s]+/g, '')
			.replace(/www\.[^\s]+/g, '')
			.replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
			.replace(/\(\d{2,3}\)\s*\d{3}-\d{4}/g, '')
			.replace(/\d{3}-\d{3}-\d{4}/g, '')
			.replace(/©\d{4}.*$/gm, '')
			.replace(/Copyright.*$/gm, '')
			.replace(/&[a-zA-Z]+;/g, '')
			.replace(/&#\d+;/g, '')
			.replaceAll("–", "")
			.replaceAll("׳", "'")
			.replace(/\s+/g, ' ')
			.replace(/\n+/g, ' ')
			.replace(/\b[a-zA-Z]{10,}\b/g, '')
			.trim();
			
		// More aggressive cleaning specifically for Talmud text
		text = text.replace(/^[\s\S]*?(?=גמרא|משנה|א\]|ב\]|ג\]|ד\])/i, '');
		text = text.replace(/(?:במקומן|©\d{4}|window\.|function|var |document\.)[\s\S]*$/i, '');
		
		// Additional step: look for the actual content markers
		if (text.includes('rashi;') || text.includes('tosafot:')) {
			const parts = text.split(/rashi[;:]/i);
			if (parts.length > 0) {
				return parts[0].trim();
			}
		}
		
		return text;
	}
	
	const endpoints = {
		texts: {
			name: 'Texts API',
			description: 'Get text content and metadata',
			url: (params: any) => `https://www.sefaria.org/api/texts/${params.ref}`,
			params: ['ref']
		},
		search: {
			name: 'Search API',
			description: 'Search across all texts',
			url: (params: any) => `https://www.sefaria.org/api/search-wrapper/_search?q=${encodeURIComponent(params.query)}`,
			params: ['query']
		},
		index: {
			name: 'Index API',
			description: 'Get index/table of contents for a text',
			url: (params: any) => `https://www.sefaria.org/api/index/${params.title}`,
			params: ['title']
		},
		topics: {
			name: 'Topics API',
			description: 'Get topic information',
			url: (params: any) => `https://www.sefaria.org/api/topics/${params.slug}`,
			params: ['slug']
		},
		links: {
			name: 'Links API',
			description: 'Get links/connections between texts',
			url: (params: any) => {
				let url = `https://www.sefaria.org/api/links/${params.ref}`;
				const queryParams = [];
				if (params.type) queryParams.push(`type=${params.type}`);
				if (params.direction) queryParams.push(`direction=${params.direction}`);
				if (queryParams.length) url += '?' + queryParams.join('&');
				return url;
			},
			params: ['ref', 'type', 'direction']
		},
		calendars: {
			name: 'Calendars API',
			description: 'Get calendar/parasha information',
			url: (params: any) => `https://www.sefaria.org/api/calendars/${params.date}`,
			params: ['date']
		},
		name: {
			name: 'Name API',
			description: 'Get information about a person/author',
			url: (params: any) => `https://www.sefaria.org/api/name/${encodeURIComponent(params.query)}`,
			params: ['query']
		},
		person: {
			name: 'Person API',
			description: 'Get detailed person information',
			url: (params: any) => `https://www.sefaria.org/api/person/${params.key}`,
			params: ['key']
		},
		collections: {
			name: 'Collections API',
			description: 'Get collection information',
			url: (params: any) => `https://www.sefaria.org/api/collections/${params.slug}`,
			params: ['slug']
		},
		groups: {
			name: 'Groups API',
			description: 'Get text group information',
			url: (params: any) => `https://www.sefaria.org/api/groups/${params.name}`,
			params: ['name']
		},
		terms: {
			name: 'Terms API',
			description: 'Get term/concept information',
			url: (params: any) => `https://www.sefaria.org/api/terms/${params.name}`,
			params: ['name']
		}
	};
	
	function getParams() {
		switch (selectedEndpoint) {
			case 'texts': return { ref: textRef };
			case 'search': return { query: searchQuery };
			case 'index': return { title: indexTitle };
			case 'topics': return { slug: topicSlug };
			case 'links': return { ref: linkRef, type: linkType, direction: linkDirection };
			case 'calendars': return { date: calendars };
			case 'name': return { query: nameQuery };
			case 'person': return { key: personKey };
			case 'collections': return { slug: collectionSlug };
			case 'groups': return { name: groupName };
			case 'terms': return { name: termName };
			default: return {};
		}
	}
	
	async function testEndpoint() {
		loading = true;
		error = '';
		response = null;
		dafSupplierData = null;
		
		const startTime = performance.now();
		
		try {
			const endpoint = endpoints[selectedEndpoint];
			const params = getParams();
			const url = endpoint.url(params);
			
			console.log('Testing endpoint:', url);
			
			const res = await fetch(url);
			responseTime = performance.now() - startTime;
			
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}
			
			response = await res.json();
			
			// If it's a text endpoint, also fetch daf-supplier data
			if (selectedEndpoint === 'texts' && params.ref) {
				await fetchDafSupplierData(params.ref);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}
	
	async function fetchDafSupplierData(ref: string) {
		loadingDafSupplier = true;
		dafSupplierData = null;
		try {
			// Parse reference to get tractate and page
			const match = ref.match(/^(.+?)\.(\d+[ab]?)$/);
			if (!match) {
				console.error('Invalid reference format:', ref);
				return;
			}
			
			const [, tractate, page] = match;
			console.log(`Fetching HebrewBooks data for ${tractate} ${page}`);
			
			// Use the same API call as the main page - it handles all conversions
			const { hebrewBooksAPI, TRACTATE_IDS } = await import('$lib/api/hebrewbooks');
			const mesechtaId = TRACTATE_IDS[tractate];
			console.log(`Converted to: mesechta=${mesechtaId}, daf=${page} (for HebrewBooks)`);
			
			const hebrewBooksData = await hebrewBooksAPI.fetchPage(tractate, page);
			
			if (hebrewBooksData) {
				console.log('Got data from hebrewBooksAPI:', hebrewBooksData);
				dafSupplierData = hebrewBooksData;
			} else {
				console.error('HebrewBooksAPI returned null');
			}
		} catch (e) {
			console.error('Error fetching daf-supplier:', e);
		} finally {
			loadingDafSupplier = false;
		}
	}
	
	function formatJSON(obj: any, indent = 2) {
		if (!prettyPrint) return JSON.stringify(obj);
		return JSON.stringify(obj, null, indent);
	}
	
	function handleTextSelection(ref: string) {
		selectedTextRef = ref;
		showTextSelection = true;
		// Switch to links endpoint and set the reference
		selectedEndpoint = 'links';
		linkRef = ref;
		// Test the endpoint
		testEndpoint();
	}
	
	function getTextSegments() {
		if (!response || !response.text) return [];
		return response.text.map((text: string, i: number) => ({
			text,
			hebrew: response.he?.[i] || '',
			ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`
		}));
	}
	
	// Normalize Hebrew text for comparison
	function normalizeHebrew(text: string): string {
		const temp = document.createElement('div');
		temp.innerHTML = text;
		const stripped = temp.textContent || temp.innerText || '';
		
		return stripped
			.replace(/[\u0591-\u05C7]/g, '') // Remove Hebrew diacritics
			.replace(/["״׳]/g, '') // Remove Hebrew quotes
			.replace(/[.,;:!?()\[\]]/g, ' ') // Replace punctuation with spaces
			.replace(/\s+/g, ' ') // Normalize whitespace
			.replace(/\r\n/g, ' ')
			.replace(/\n/g, ' ')
			.replace(/\t/g, ' ')
			.replace(/[<>]/g, '')
			.trim();
	}
	
	// Simple but effective similarity calculation
	function calculateSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) return 0;
		if (str1 === str2) return 1.0;
		
		if (str1.includes(str2) || str2.includes(str1)) {
			const shorter = str1.length < str2.length ? str1 : str2;
			const longer = str1.length < str2.length ? str2 : str1;
			return shorter.length / longer.length;
		}
		
		const words1 = str1.split(' ').filter(w => w.length > 2);
		const words2 = str2.split(' ').filter(w => w.length > 2);
		
		if (words1.length === 0 || words2.length === 0) return 0;
		
		let matches = 0;
		for (const word1 of words1) {
			if (words2.includes(word1)) {
				matches++;
			}
		}
		
		return matches / Math.max(words1.length, words2.length);
	}
	
	// Advanced sequential matching with linguistic boundary detection and gap filling
	function getMatchedSegments() {
		if (!response?.he || !dafSupplierData?.mainText) return [];
		
		const sefariaSegments = response.he.map((hebrew: string, i: number) => ({
			index: i,
			hebrew,
			english: response.text?.[i] || '',
			normalized: normalizeHebrew(hebrew),
			ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`,
			dafSupplierMatch: null as string | null,
			similarity: 0
		}));
		
		const dafTextExtracted = extractTalmudContent(dafSupplierData.mainText);
		const dafNormalized = normalizeHebrew(dafTextExtracted);
		const dafWords = dafNormalized.split(' ').filter(w => w.length > 0);
		
		let currentWordIndex = 0;
		
		// Main matching pass
		for (let i = 0; i < sefariaSegments.length; i++) {
			const segment = sefariaSegments[i];
			const segmentWords = segment.normalized.split(' ').filter(w => w.length > 0);
			
			const match = findSegmentMatch(dafWords, segmentWords, currentWordIndex);
			
			if (match.found) {
				const endIndex = determineSegmentEnd(
					dafWords, 
					match.startIndex, 
					segmentWords, 
					i < sefariaSegments.length - 1 ? sefariaSegments[i + 1] : null
				);
				
				const matchedText = dafWords.slice(match.startIndex, endIndex).join(' ');
				segment.dafSupplierMatch = matchedText;
				segment.similarity = match.matchLength / segmentWords.length;
				currentWordIndex = endIndex;
			} else {
				// Try backtracking if previous segment may have been too greedy
				if (i > 0 && sefariaSegments[i-1].dafSupplierMatch) {
					const backtrackResult = attemptBacktrack(sefariaSegments[i-1], segment, currentWordIndex);
					if (backtrackResult.success) {
						currentWordIndex = backtrackResult.newPosition;
					}
				}
			}
		}
		
		// Gap filling pass
		fillUnmatchedGaps(sefariaSegments, dafWords);
		
		return sefariaSegments;
	}
	
	// Helper functions for the matching algorithm
	function findSegmentMatch(dafWords: string[], segmentWords: string[], startFrom: number) {
		let bestStartIndex = -1;
		let bestMatchLength = 0;
		
		for (let startIndex = startFrom; startIndex < dafWords.length - 2; startIndex++) {
			let matchLength = 0;
			
			for (let j = 0; j < segmentWords.length && startIndex + j < dafWords.length; j++) {
				if (dafWords[startIndex + j] === segmentWords[j]) {
					matchLength++;
				} else {
					break;
				}
			}
			
			if (matchLength >= 3 && matchLength > bestMatchLength) {
				bestStartIndex = startIndex;
				bestMatchLength = matchLength;
			}
			
			if (matchLength >= Math.min(segmentWords.length, 8)) {
				break;
			}
		}
		
		return {
			found: bestStartIndex !== -1,
			startIndex: bestStartIndex,
			matchLength: bestMatchLength
		};
	}
	
	function determineSegmentEnd(dafWords: string[], startIndex: number, segmentWords: string[], nextSegment: any) {
		let endIndex = startIndex + segmentWords.length;
		
		if (nextSegment) {
			const nextSegmentWords = normalizeHebrew(nextSegment.hebrew).split(' ').filter(w => w.length > 0);
			const nextBoundary = findNextSegmentStart(dafWords, nextSegmentWords, startIndex + Math.floor(segmentWords.length * 0.8));
			
			if (nextBoundary !== -1) {
				endIndex = nextBoundary;
			} else {
				endIndex = findNaturalBoundary(dafWords, startIndex, segmentWords);
			}
		}
		
		return validateSegmentLength(dafWords, startIndex, endIndex, segmentWords);
	}
	
	function findNaturalBoundary(dafWords: string[], startIndex: number, segmentWords: string[]) {
		const searchStart = startIndex + Math.floor(segmentWords.length * 0.75);
		const searchEnd = Math.min(startIndex + segmentWords.length + 20, dafWords.length);
		
		let bestEndpoint = startIndex + segmentWords.length;
		let bestQuality = 0;
		
		for (let pos = searchStart; pos < searchEnd; pos++) {
			const candidateText = dafWords.slice(startIndex, pos + 1).join(' ');
			const segmentText = segmentWords.join(' ');
			const candidateQuality = calculateSimilarity(segmentText, candidateText);
			
			const boundaryBonus = calculateBoundaryBonus(dafWords[pos], dafWords[pos + 1] || '');
			const lengthPenalty = Math.abs(pos - (startIndex + segmentWords.length)) / segmentWords.length * 0.2;
			const totalQuality = candidateQuality + boundaryBonus - lengthPenalty;
			
			if (totalQuality > bestQuality) {
				bestQuality = totalQuality;
				bestEndpoint = pos + 1;
			}
		}
		
		return bestQuality < 0.3 ? startIndex + segmentWords.length : bestEndpoint;
	}
	
	function calculateBoundaryBonus(word: string, nextWord: string): number {
		let bonus = 0;
		
		if (word.endsWith(':') || word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
			bonus += 0.3;
		}
		
		if ((word.startsWith('ב') || word.startsWith('ל') || word.startsWith('מ') || 
			 word.startsWith('כ') || word.startsWith('ו') || word === 'עד' || word === 'אל') &&
			nextWord.startsWith('ה') && nextWord.length > 2) {
			bonus += 0.15;
		}
		
		if (word.length >= 3 && (word.endsWith('ה') || word.endsWith('ם') || word.endsWith('ן') ||
								word.endsWith('ות') || word.endsWith('ים') || word.endsWith('רה'))) {
			bonus += 0.1;
		}
		
		if (word.length <= 2 || word === 'את' || word === 'של' || word === 'על' || word === 'אל' || word === 'מן') {
			bonus -= 0.2;
		}
		
		return bonus;
	}
	
	function findNextSegmentStart(dafWords: string[], nextSegmentWords: string[], searchFrom: number): number {
		const maxSearch = Math.min(searchFrom + 30, dafWords.length);
		
		for (let wordCount = Math.min(4, nextSegmentWords.length); wordCount >= 2; wordCount--) {
			for (let searchIndex = searchFrom; searchIndex <= maxSearch - wordCount; searchIndex++) {
				let matches = 0;
				for (let j = 0; j < wordCount && searchIndex + j < dafWords.length; j++) {
					if (dafWords[searchIndex + j] === nextSegmentWords[j]) {
						matches++;
					} else {
						break;
					}
				}
				
				if (matches === wordCount) {
					return searchIndex;
				}
			}
		}
		
		return -1;
	}
	
	function validateSegmentLength(dafWords: string[], startIndex: number, endIndex: number, segmentWords: string[]): number {
		const extractedLength = endIndex - startIndex;
		const expectedLength = segmentWords.length;
		const extractedText = dafWords.slice(startIndex, endIndex).join(' ');
		const segmentText = segmentWords.join(' ');
		const contentQuality = calculateSimilarity(segmentText, extractedText);
		
		const endWord = dafWords[endIndex - 1] || '';
		const hasGoodEnding = endWord.endsWith(':') || endWord.endsWith('.') || 
							  endWord.endsWith('ה') || endWord.endsWith('ם') || endWord.endsWith('ן');
		
		if (extractedLength > expectedLength + 20 && contentQuality < 0.6) {
			return startIndex + expectedLength + 8;
		}
		
		if (extractedLength > expectedLength + 10 && contentQuality < 0.4 && !hasGoodEnding) {
			return startIndex + expectedLength + 5;
		}
		
		if (extractedLength < expectedLength * 0.6) {
			return extendShortSegment(dafWords, startIndex, endIndex, segmentWords);
		}
		
		return endIndex;
	}
	
	function extendShortSegment(dafWords: string[], startIndex: number, endIndex: number, segmentWords: string[]): number {
		const segmentText = segmentWords.join(' ');
		let bestEnd = endIndex;
		let bestQuality = calculateSimilarity(segmentText, dafWords.slice(startIndex, endIndex).join(' '));
		
		const maxExtension = Math.min(startIndex + segmentWords.length + 10, dafWords.length);
		for (let pos = endIndex; pos < maxExtension; pos++) {
			const candidateText = dafWords.slice(startIndex, pos + 1).join(' ');
			const candidateQuality = calculateSimilarity(segmentText, candidateText);
			
			if (candidateQuality > bestQuality + 0.05) {
				bestEnd = pos + 1;
				bestQuality = candidateQuality;
			}
			
			if (candidateQuality < bestQuality - 0.1) {
				break;
			}
		}
		
		return bestEnd;
	}
	
	function attemptBacktrack(prevSegment: any, currentSegment: any, currentWordIndex: number) {
		const prevWords = prevSegment.dafSupplierMatch.split(' ');
		const currentSegmentWords = currentSegment.normalized.split(' ').filter(w => w.length > 0);
		
		for (let startPos = Math.max(0, prevWords.length - currentSegmentWords.length - 5); startPos < prevWords.length - 2; startPos++) {
			let matchLength = 0;
			for (let j = 0; j < currentSegmentWords.length && startPos + j < prevWords.length; j++) {
				if (prevWords[startPos + j] === currentSegmentWords[j]) {
					matchLength++;
				} else {
					break;
				}
			}
			
			if (matchLength >= 3) {
				const correctedPrevText = prevWords.slice(0, startPos).join(' ');
				const currentEndPos = Math.min(startPos + currentSegmentWords.length + 3, prevWords.length);
				const currentText = prevWords.slice(startPos, currentEndPos).join(' ');
				
				prevSegment.dafSupplierMatch = correctedPrevText;
				currentSegment.dafSupplierMatch = currentText;
				currentSegment.similarity = matchLength / currentSegmentWords.length;
				
				return {
					success: true,
					newPosition: currentWordIndex - (prevWords.length - currentEndPos)
				};
			}
		}
		
		return { success: false, newPosition: currentWordIndex };
	}
	
	function fillUnmatchedGaps(sefariaSegments: any[], dafWords: string[]) {
		for (let i = 0; i < sefariaSegments.length; i++) {
			const segment = sefariaSegments[i];
			if (segment.dafSupplierMatch) continue;
			
			const prevMatchIndex = findPreviousMatch(sefariaSegments, i);
			const nextMatchIndex = findNextMatch(sefariaSegments, i);
			
			if (prevMatchIndex !== -1 && nextMatchIndex !== -1) {
				const prevEndPosition = findTextPosition(dafWords, sefariaSegments[prevMatchIndex].dafSupplierMatch, 'end');
				const nextStartPosition = findTextPosition(dafWords, sefariaSegments[nextMatchIndex].dafSupplierMatch, 'start');
				
				if (prevEndPosition !== -1 && nextStartPosition !== -1 && prevEndPosition < nextStartPosition) {
					const gapText = dafWords.slice(prevEndPosition, nextStartPosition).join(' ');
					if (gapText.trim().length > 0) {
						segment.dafSupplierMatch = gapText;
						segment.similarity = calculateSimilarity(segment.normalized, normalizeHebrew(gapText));
					}
				}
			}
		}
	}
	
	function findPreviousMatch(segments: any[], index: number): number {
		for (let j = index - 1; j >= 0; j--) {
			if (segments[j].dafSupplierMatch) return j;
		}
		return -1;
	}
	
	function findNextMatch(segments: any[], index: number): number {
		for (let j = index + 1; j < segments.length; j++) {
			if (segments[j].dafSupplierMatch) return j;
		}
		return -1;
	}
	
	function findTextPosition(wordArray: string[], text: string, type: 'start' | 'end'): number {
		if (!text) return -1;
		
		const textWords = text.split(' ').filter(w => w.length > 0);
		if (textWords.length === 0) return -1;
		
		for (let i = 0; i <= wordArray.length - textWords.length; i++) {
			let matches = 0;
			for (let j = 0; j < textWords.length; j++) {
				if (wordArray[i + j] === textWords[j]) {
					matches++;
				} else {
					break;
				}
			}
			
			if (matches >= Math.max(3, Math.floor(textWords.length * 0.8))) {
				if (type === 'start') {
					return i;
				} else {
					return i + matches;
				}
			}
		}
		
		return -1;
	}
	
	function getResponseSummary() {
		if (!response) return '';
		
		const summary: string[] = [];
		
		// Text-specific summary
		if (selectedEndpoint === 'texts' && response.text) {
			summary.push(`Text: ${response.ref || 'Unknown'}`);
			summary.push(`Hebrew segments: ${response.he?.length || 0}`);
			summary.push(`English segments: ${response.text?.length || 0}`);
			if (response.commentary) {
				summary.push(`Commentaries: ${response.commentary.length}`);
			}
		}
		
		// Search-specific summary
		if (selectedEndpoint === 'search' && response.hits) {
			summary.push(`Total results: ${response.hits.total?.value || 0}`);
			summary.push(`Results returned: ${response.hits.hits?.length || 0}`);
		}
		
		// Index-specific summary
		if (selectedEndpoint === 'index') {
			summary.push(`Title: ${response.title || 'Unknown'}`);
			summary.push(`Categories: ${response.categories?.join(' > ') || 'None'}`);
			if (response.schema?.nodes) {
				summary.push(`Sections: ${response.schema.nodes.length}`);
			}
		}
		
		return summary.join('\n');
	}
	
	// Load initial data on mount
	onMount(() => {
		testEndpoint();
	});
</script>

<div class="container">
	<h1>Sefaria API Explorer</h1>
	
	<div class="controls">
		<div class="endpoint-selector">
			<label>
				Select API Endpoint:
				<select bind:value={selectedEndpoint} on:change={() => testEndpoint()}>
					{#each Object.entries(endpoints) as [key, endpoint]}
						<option value={key}>{endpoint.name}</option>
					{/each}
				</select>
			</label>
			<p class="description">{endpoints[selectedEndpoint].description}</p>
		</div>
		
		<div class="params">
			{#if selectedEndpoint === 'texts'}
				<label>
					Text Reference:
					<input type="text" bind:value={textRef} placeholder="e.g., Berakhot.2a" />
				</label>
			{:else if selectedEndpoint === 'search'}
				<label>
					Search Query:
					<input type="text" bind:value={searchQuery} placeholder="e.g., משנה" />
				</label>
			{:else if selectedEndpoint === 'index'}
				<label>
					Index Title:
					<input type="text" bind:value={indexTitle} placeholder="e.g., Berakhot" />
				</label>
			{:else if selectedEndpoint === 'topics'}
				<label>
					Topic Slug:
					<input type="text" bind:value={topicSlug} placeholder="e.g., torah" />
				</label>
			{:else if selectedEndpoint === 'links'}
				<label>
					Reference:
					<input type="text" bind:value={linkRef} placeholder="e.g., Berakhot.2a" />
				</label>
				<label>
					Type (optional):
					<input type="text" bind:value={linkType} placeholder="e.g., commentary" />
				</label>
				<label>
					Direction (optional):
					<select bind:value={linkDirection}>
						<option value="">All</option>
						<option value="from">From</option>
						<option value="to">To</option>
					</select>
				</label>
			{:else if selectedEndpoint === 'calendars'}
				<label>
					Date:
					<input type="date" bind:value={calendars} />
				</label>
			{:else if selectedEndpoint === 'name'}
				<label>
					Name Query:
					<input type="text" bind:value={nameQuery} placeholder="e.g., רש״י" />
				</label>
			{:else if selectedEndpoint === 'person'}
				<label>
					Person Key:
					<input type="text" bind:value={personKey} placeholder="e.g., Rashi" />
				</label>
			{:else if selectedEndpoint === 'collections'}
				<label>
					Collection Slug:
					<input type="text" bind:value={collectionSlug} placeholder="e.g., tanakh" />
				</label>
			{:else if selectedEndpoint === 'groups'}
				<label>
					Group Name:
					<input type="text" bind:value={groupName} placeholder="e.g., Talmud" />
				</label>
			{:else if selectedEndpoint === 'terms'}
				<label>
					Term Name:
					<input type="text" bind:value={termName} placeholder="e.g., Talmud" />
				</label>
			{/if}
		</div>
		
		<button on:click={testEndpoint} disabled={loading}>
			{loading ? 'Loading...' : 'Test Endpoint'}
		</button>
		
		<div class="options">
			<label>
				<input type="checkbox" bind:checked={prettyPrint} />
				Pretty Print JSON
			</label>
			<label>
				<input type="checkbox" bind:checked={showRawResponse} />
				Show Raw Response
			</label>
		</div>
	</div>
	
	{#if error}
		<div class="error">
			<h3>Error</h3>
			<pre>{error}</pre>
		</div>
	{/if}
	
	{#if response}
		<div class="response">
			<div class="response-header">
				<h3>Response</h3>
				<span class="response-time">({responseTime.toFixed(0)}ms)</span>
			</div>
			
			{#if !showRawResponse}
				<div class="summary">
					<h4>Summary</h4>
					<pre>{getResponseSummary()}</pre>
				</div>
				
				{#if selectedEndpoint === 'texts' && response.text}
					<div class="text-preview">
						<h4>Text Preview</h4>
						<p class="hint">Click on any segment to explore its links</p>
						{#if dafSupplierData}
							<button on:click={() => {
								console.log('=== RAW DATA INSPECTION ===');
								console.log('Sefaria Hebrew array:', response.he);
								console.log('\nDaf Supplier mainText (raw HTML):', dafSupplierData.mainText);
								console.log('\nDaf Supplier mainText (extracted):', extractTalmudContent(dafSupplierData.mainText));
							}}>
								Inspect Raw Data in Console
							</button>
							<div class="source-indicator">
								<span class="source-badge sefaria">Sefaria</span>
								<span class="source-badge daf-supplier">Daf Supplier</span>
								{#if loadingDafSupplier}
									<span class="loading-indicator">Loading daf-supplier...</span>
								{/if}
							</div>
						{/if}
						<div class="text-content three-column">
							<div class="column-headers" class:with-daf={dafSupplierData}>
								<div class="header">Reference</div>
								<div class="header">Sefaria Hebrew</div>
								<div class="header">English Translation</div>
								{#if dafSupplierData}
									<div class="header">Daf Supplier Match</div>
								{/if}
							</div>
							{#each (dafSupplierData ? getMatchedSegments() : getTextSegments()).slice(0, 10) as segment}
								<div class="segment-row clickable" class:with-daf={dafSupplierData} on:click={() => handleTextSelection(segment.ref)}>
									<div class="ref-label">{segment.ref}</div>
									<div class="hebrew">{segment.hebrew}</div>
									<div class="english">{segment.english || segment.text}</div>
									{#if dafSupplierData}
										<div class="hebrew daf-supplier">
											{#if segment.dafSupplierMatch}
												<div class="match-content">
													{segment.dafSupplierMatch}
													<span 
														class="similarity-score" 
														data-quality={
															segment.similarity >= 0.8 ? 'excellent' :
															segment.similarity >= 0.6 ? 'good' :
															segment.similarity >= 0.4 ? 'fair' : 'poor'
														}
													>
														{Math.round(segment.similarity * 100)}%
													</span>
												</div>
											{:else}
												<span class="no-match">No match found</span>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
							{#if response.text.length > 10}
								<div class="more-wrapper">
									<p class="more">...and {response.text.length - 10} more segments</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}
				
				{#if selectedEndpoint === 'search' && response.hits?.hits}
					<div class="search-results">
						<h4>Search Results</h4>
						<p class="hint">Click on any result to explore its links</p>
						{#each response.hits.hits.slice(0, 5) as hit}
							<div class="search-hit clickable" on:click={() => handleTextSelection(hit._source?.ref)}>
								<strong>{hit._source?.ref || 'Unknown'}</strong>
								<div class="highlight">
									{@html hit.highlight?.naive_lemmatizer?.[0] || hit._source?.exact || 'No preview'}
								</div>
							</div>
						{/each}
					</div>
				{/if}
				
				{#if selectedEndpoint === 'links' && showTextSelection}
					<div class="selection-notice">
						<p>Showing links for: <strong>{selectedTextRef}</strong></p>
						<button on:click={() => { showTextSelection = false; selectedTextRef = ''; }}>Clear Selection</button>
					</div>
				{/if}
				
				{#if selectedEndpoint === 'links' && response?.length > 0}
					<div class="links-preview">
						<h4>Links Found ({response.length})</h4>
						<div class="links-grid">
							{#each response.slice(0, 20) as link}
								<div class="link-item">
									<div class="link-type">{link.type || 'Unknown'}</div>
									<div class="link-ref">{link.ref}</div>
									<div class="link-text">
										{#if link.he}
											<div class="hebrew">{link.he}</div>
										{/if}
										{#if link.text}
											<div class="english">{link.text}</div>
										{/if}
									</div>
								</div>
							{/each}
							{#if response.length > 20}
								<p class="more">...and {response.length - 20} more links</p>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
			
			<div class="raw-response">
				<h4>Raw JSON Response</h4>
				<pre>{formatJSON(response)}</pre>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	h1 {
		margin-bottom: 2rem;
		color: #333;
	}
	
	.controls {
		background: #f5f5f5;
		padding: 1.5rem;
		border-radius: 8px;
		margin-bottom: 2rem;
	}
	
	.endpoint-selector {
		margin-bottom: 1.5rem;
	}
	
	.endpoint-selector select {
		width: 100%;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		margin-top: 0.5rem;
	}
	
	.description {
		margin-top: 0.5rem;
		color: #666;
		font-style: italic;
	}
	
	.params {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 500;
	}
	
	input[type="text"],
	input[type="date"],
	select {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}
	
	button {
		background: #007bff;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	button:hover:not(:disabled) {
		background: #0056b3;
	}
	
	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}
	
	.options {
		margin-top: 1rem;
		display: flex;
		gap: 1.5rem;
	}
	
	.options label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-weight: normal;
	}
	
	.error {
		background: #fee;
		border: 1px solid #fcc;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 2rem;
	}
	
	.error h3 {
		color: #c00;
		margin: 0 0 0.5rem 0;
	}
	
	.response {
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 1.5rem;
	}
	
	.response-header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.response-header h3 {
		margin: 0;
	}
	
	.response-time {
		color: #666;
		font-size: 0.9rem;
	}
	
	.summary {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.summary h4 {
		margin: 0 0 0.5rem 0;
		color: #555;
	}
	
	.text-preview {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.text-preview h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.source-indicator {
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	
	.source-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 3px;
		font-size: 0.85rem;
		font-weight: 500;
	}
	
	.source-badge.sefaria {
		background: #e3f2fd;
		color: #1976d2;
	}
	
	.source-badge.daf-supplier {
		background: #f3e5f5;
		color: #7b1fa2;
	}
	
	.loading-indicator {
		font-size: 0.85rem;
		color: #666;
		font-style: italic;
	}
	
	.text-content.three-column {
		overflow-x: auto;
		display: grid;
		gap: 0;
	}
	
	.column-headers {
		display: grid;
		grid-template-columns: 100px 1fr 1fr;
		gap: 1rem;
		padding: 0.75rem;
		background: #f5f5f5;
		border-bottom: 2px solid #ddd;
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 10;
	}
	
	.column-headers.with-daf {
		grid-template-columns: 100px 1fr 1fr 1fr;
	}
	
	.column-headers .header {
		color: #333;
		font-size: 0.9rem;
	}
	
	.segment-row {
		display: grid;
		grid-template-columns: 100px 1fr 1fr;
		gap: 1rem;
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
		min-height: 3rem;
		align-items: start;
	}
	
	.segment-row.with-daf {
		grid-template-columns: 100px 1fr 1fr 1fr;
	}
	
	.segment-row:last-child {
		border-bottom: none;
	}
	
	.segment-row.clickable {
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.segment-row.clickable:hover {
		background: #f0f0f0;
	}
	
	.hebrew.daf-supplier {
		background: #fafafa;
		padding: 0.5rem;
		border-radius: 3px;
		border: 1px solid #e0e0e0;
		position: relative;
	}
	
	.match-content {
		position: relative;
	}
	
	.similarity-score {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		color: white;
		font-size: 0.7rem;
		padding: 0.125rem 0.375rem;
		border-radius: 10px;
		font-weight: 500;
		direction: ltr;
	}
	
	.similarity-score[data-quality="excellent"] {
		background: #4caf50;
	}
	
	.similarity-score[data-quality="good"] {
		background: #2196f3;
	}
	
	.similarity-score[data-quality="fair"] {
		background: #ff9800;
	}
	
	.similarity-score[data-quality="poor"] {
		background: #f44336;
	}
	
	.no-match {
		color: #999;
		font-style: italic;
		font-size: 0.9rem;
	}
	
	.more-wrapper {
		grid-column: 1 / -1;
		padding: 1rem;
	}
	
	.more-wrapper .more {
		margin: 0;
	}
	
	.segment {
		display: grid;
		grid-template-columns: auto 1fr 1fr;
		gap: 1rem;
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
		position: relative;
	}
	
	.segment:last-child {
		border-bottom: none;
	}
	
	.segment.clickable {
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.segment.clickable:hover {
		background: #f0f0f0;
	}
	
	.ref-label {
		font-size: 0.85rem;
		color: #666;
		font-weight: 500;
		white-space: nowrap;
	}
	
	.hebrew {
		text-align: right;
		font-size: 1.1rem;
		direction: rtl;
		font-family: 'Frank Ruhl Libre', serif;
	}
	
	.english {
		color: #444;
	}
	
	.hint {
		font-size: 0.85rem;
		color: #666;
		font-style: italic;
		margin: -0.5rem 0 1rem 0;
	}
	
	.more {
		text-align: center;
		color: #666;
		font-style: italic;
		margin-top: 1rem;
	}
	
	.search-results {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.search-results h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.search-hit {
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
	}
	
	.search-hit:last-child {
		border-bottom: none;
	}
	
	.search-hit.clickable {
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.search-hit.clickable:hover {
		background: #f0f0f0;
	}
	
	.search-hit strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #333;
	}
	
	.highlight {
		color: #666;
		font-size: 0.95rem;
		line-height: 1.5;
	}
	
	.highlight :global(b) {
		background: #ffeb3b;
		color: #333;
		font-weight: normal;
		padding: 0 2px;
	}
	
	.raw-response {
		background: white;
		padding: 1rem;
		border-radius: 4px;
	}
	
	.raw-response h4 {
		margin: 0 0 0.5rem 0;
		color: #555;
	}
	
	pre {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
		font-family: 'Consolas', 'Monaco', monospace;
		font-size: 0.9rem;
		line-height: 1.5;
		max-height: 500px;
		overflow-y: auto;
	}
	
	.selection-notice {
		background: #e3f2fd;
		border: 1px solid #2196f3;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	
	.selection-notice p {
		margin: 0;
		color: #1976d2;
	}
	
	.selection-notice button {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		background: #fff;
		color: #1976d2;
		border: 1px solid #1976d2;
	}
	
	.selection-notice button:hover {
		background: #e3f2fd;
	}
	
	.links-preview {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.links-preview h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.links-grid {
		display: grid;
		gap: 1rem;
	}
	
	.link-item {
		padding: 1rem;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		background: #fafafa;
	}
	
	.link-type {
		display: inline-block;
		background: #2196f3;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		text-transform: capitalize;
	}
	
	.link-ref {
		font-weight: 500;
		color: #333;
		margin-bottom: 0.5rem;
	}
	
	.link-text {
		display: grid;
		gap: 0.5rem;
	}
	
	.link-text .hebrew {
		font-size: 1rem;
		padding: 0.5rem;
		background: white;
		border-radius: 3px;
	}
	
	.link-text .english {
		font-size: 0.95rem;
		padding: 0.5rem;
		background: white;
		border-radius: 3px;
	}
</style>