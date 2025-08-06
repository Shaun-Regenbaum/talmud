<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	
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
	
	
	// Text selection
	let selectedTextRef = '';
	let showTextSelection = false;
	
	// Daf supplier data
	let dafSupplierData: any = null;
	let loadingDafSupplier = false;
	
	// Initialize state from URL parameters
	function initializeFromUrl() {
		if (!browser) return;
		
		const params = $page.url.searchParams;
		
		// Restore endpoint selection
		if (params.has('endpoint')) {
			selectedEndpoint = params.get('endpoint') || 'texts';
		}
		
		// Restore endpoint-specific parameters
		if (params.has('textRef')) textRef = params.get('textRef') || 'Berakhot.2a';
		if (params.has('searchQuery')) searchQuery = params.get('searchQuery') || 'משנה';
		if (params.has('indexTitle')) indexTitle = params.get('indexTitle') || 'Berakhot';
		if (params.has('topicSlug')) topicSlug = params.get('topicSlug') || 'torah';
		if (params.has('linkRef')) linkRef = params.get('linkRef') || 'Berakhot.2a';
		if (params.has('linkType')) linkType = params.get('linkType') || '';
		if (params.has('linkDirection')) linkDirection = params.get('linkDirection') || '';
		if (params.has('calendars')) calendars = params.get('calendars') || '2024-01-01';
		if (params.has('nameQuery')) nameQuery = params.get('nameQuery') || 'רש"י';
		if (params.has('personKey')) personKey = params.get('personKey') || 'Rashi';
		if (params.has('collectionSlug')) collectionSlug = params.get('collectionSlug') || 'tanakh';
		if (params.has('groupName')) groupName = params.get('groupName') || 'Talmud';
		if (params.has('termName')) termName = params.get('termName') || 'Talmud';
	}
	
	// Update URL with current state
	function updateUrl() {
		if (!browser) return;
		
		const params = new URLSearchParams();
		
		// Always save endpoint
		params.set('endpoint', selectedEndpoint);
		
		// Save endpoint-specific parameters
		switch (selectedEndpoint) {
			case 'texts':
				params.set('textRef', textRef);
				break;
			case 'search':
				params.set('searchQuery', searchQuery);
				break;
			case 'index':
				params.set('indexTitle', indexTitle);
				break;
			case 'topics':
				params.set('topicSlug', topicSlug);
				break;
			case 'links':
				params.set('linkRef', linkRef);
				if (linkType) params.set('linkType', linkType);
				if (linkDirection) params.set('linkDirection', linkDirection);
				break;
			case 'calendars':
				params.set('calendars', calendars);
				break;
			case 'name':
				params.set('nameQuery', nameQuery);
				break;
			case 'person':
				params.set('personKey', personKey);
				break;
			case 'collections':
				params.set('collectionSlug', collectionSlug);
				break;
			case 'groups':
				params.set('groupName', groupName);
				break;
			case 'terms':
				params.set('termName', termName);
				break;
		}
		
		// Update URL without navigation
		const newUrl = `${$page.url.pathname}?${params.toString()}`;
		goto(newUrl, { replaceState: true, keepFocus: true, noScroll: true });
	}
	
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
		// Look for common Talmud page markers
		text = text.replace(/^[\s\S]*?(?=תנן|מתני|גמ|גמרא|משנה|א\]|ב\]|ג\]|ד\])/i, '');
		text = text.replace(/(?:במקומן|©\d{4}|window\.|function|var |document\.)[\s\S]*$/i, '');
		
		// Remove Rashi and Tosafot if present (we only want main text)
		if (text.includes('רש״י') || text.includes('רשי') || text.includes('rashi')) {
			const parts = text.split(/(?:רש״י|רשי|rashi)[;:]/i);
			if (parts.length > 0) {
				text = parts[0].trim();
			}
		}
		
		// Additional cleanup for any remaining artifacts
		text = text.replace(/\b(?:undefined|null|false|true)\b/g, '');
		
		console.log('Extracted text preview (first 200 chars):', text.substring(0, 200));
		
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
		// Update URL before making the request
		updateUrl();
		
		loading = true;
		error = '';
		response = null;
		dafSupplierData = null;
		
		const startTime = performance.now();
		
		try {
			const endpoint = endpoints[selectedEndpoint];
			const params = getParams();
			const url = endpoint.url(params);
			
			
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
			
			// Import the conversion utilities
			const { TRACTATE_IDS, convertDafToHebrewBooksFormat } = await import('$lib/api/hebrewbooks');
			const mesechtaId = TRACTATE_IDS[tractate];
			const dafNum = convertDafToHebrewBooksFormat(page);
			
			// Fetch directly from the daf-supplier API
			const response = await fetch(`/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafNum}`);
			
			if (response.ok) {
				const data = await response.json();
				dafSupplierData = {
					mainText: data.mainText || data.text || '',
					rashi: data.rashi,
					tosafot: data.tosafot
				};
			} else {
				console.error('Failed to fetch from daf-supplier:', response.status);
			}
		} catch (e) {
			console.error('Error fetching daf-supplier:', e);
		} finally {
			loadingDafSupplier = false;
		}
	}
	
	function formatJSON(obj: any, indent = 2) {
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
			// Keep ״ for abbreviation detection, but remove ׳
			.replace(/[׳]/g, '') // Remove geresh but keep gershayim
			.replace(/[-—–]/g, ' ') // Remove dashes (regular, em-dash, en-dash)
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
	
	// Format matched text with underlines for EXACT matches only
	function formatMatchedText(text: string, segmentText: string, exactMatchIndices: number[]) {
		if (!text || !segmentText || !exactMatchIndices || exactMatchIndices.length === 0) return text;
		
		// exactMatchIndices are indices of words in the Sefaria segment that EXACTLY matched
		const segmentWords = segmentText.split(' ').filter(w => w.length > 0);
		const dafWords = text.split(' ');
		
		// Get the exactly matched words from the segment
		const exactWords = exactMatchIndices.map(i => segmentWords[i]).filter(w => w);
		
		// Mark words in the daf text that EXACTLY match
		const formattedWords = dafWords.map((word, idx) => {
			const normalizedWord = normalizeHebrew(word);
			
			// Check against each exactly matched word
			for (let i = 0; i < exactWords.length; i++) {
				if (normalizedWord === exactWords[i]) {
					// Also check position to avoid underlining wrong occurrences
					// The word at position idx in daf should roughly correspond to position in segment
					if (idx < segmentWords.length + 5) { // Within reasonable range
						return `<u>${word}</u>`;
					}
				}
			}
			return word;
		});
		
		return formattedWords.join(' ');
	}
	
	// Track matching progress for display
	let matchingProgress = [];
	let isMatching = false;
	
	// Advanced matching with multi-pass optimization
	function getMatchedSegments() {
		if (!response?.he || !dafSupplierData?.mainText) return [];
		
		// If currently matching, return current segments
		if (isMatching) return sefariaSegments;
		
		matchingProgress = []; // Reset progress
		isMatching = true;
		
		console.clear(); // Clear console for fresh debug output
		
		const sefariaSegments = response.he.map((hebrew: string, i: number) => ({
			index: i,
			hebrew,
			english: response.text?.[i] || '',
			normalized: normalizeHebrew(hebrew),
			ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`,
			dafSupplierMatch: null as string | null,
			similarity: 0,
			matchedIndices: [] as number[],
			exactMatchIndices: [] as number[] // Track only exact matches for underlining
		}));
		
		const dafTextExtracted = extractTalmudContent(dafSupplierData.mainText);
		const dafNormalized = normalizeHebrew(dafTextExtracted);
		const dafWords = dafNormalized.split(' ').filter(w => w.length > 0);
		
		matchingProgress.push({ type: 'info', message: `Processing ${sefariaSegments.length} segments against ${dafWords.length} words` });
		
		// CRITICAL DEBUG: Let's see what we're actually working with
		console.log('=== CRITICAL MATCHING DEBUG for', response.ref, '===');
		console.log('Total daf words:', dafWords.length);
		console.log('Total segments:', sefariaSegments.length);
		
		// Show first 3 segments in detail
		sefariaSegments.slice(0, 3).forEach((seg, i) => {
			const words = seg.normalized.split(' ').filter(w => w.length > 0);
			console.log(`\nSegment ${i + 1} (${words.length} words):`);
			console.log('  First 10 words:', words.slice(0, 10).join(' | '));
		});
		
		console.log('\nFirst 100 daf words (grouped by 10):');
		for (let i = 0; i < Math.min(100, dafWords.length); i += 10) {
			console.log(`  [${i}-${i+9}]:`, dafWords.slice(i, i + 10).join(' | '));
		}
		console.log('===================================');
		
		// NEW SIMPLIFIED APPROACH: Sequential matching with clear boundaries
		let currentDafPosition = 0;
		const matches = [];
		
		console.log('\n=== SIMPLIFIED MATCHING APPROACH ===');
		
		for (let segIdx = 0; segIdx < sefariaSegments.length; segIdx++) {
			const segment = sefariaSegments[segIdx];
			const segmentWords = segment.normalized.split(' ').filter(w => w.length > 0);
			
			if (segmentWords.length === 0) {
				matches.push(null);
				continue;
			}
			
			console.log(`\n--- Matching Segment ${segIdx + 1} (${segmentWords.length} words) ---`);
			console.log('Looking for:', segmentWords.slice(0, 5).join(' '), '...');
			
			// Find the best match starting from current position
			let bestMatch = null;
			let bestScore = 0;
			
			// Search in a reasonable window
			const searchRange = Math.min(100, dafWords.length - currentDafPosition);
			
			for (let startPos = currentDafPosition; startPos < currentDafPosition + searchRange; startPos++) {
				// Count how many words match at this position
				let matchCount = 0;
				let exactMatchCount = 0;
				const matchedIndices = [];
				const exactIndices = [];
				
				for (let i = 0; i < Math.min(segmentWords.length, 10); i++) {
					if (startPos + i < dafWords.length) {
						const segWord = segmentWords[i];
						const dafWord = dafWords[startPos + i];
						
						// Check for exact match first
						if (segWord === dafWord) {
							matchCount++;
							exactMatchCount++;
							matchedIndices.push(i);
							exactIndices.push(i);
						} else if (wordsMatch(segWord, dafWord)) {
							matchCount++;
							matchedIndices.push(i);
						}
					}
				}
				
				// Calculate score based on match quality
				const score = (matchCount / Math.min(segmentWords.length, 10)) * 
							  (exactMatchCount > 0 ? 1.5 : 1); // Bonus for exact matches
				
				if (score > bestScore && matchCount >= 2) { // Require at least 2 matches
					bestScore = score;
					bestMatch = {
						startIndex: startPos,
						endIndex: Math.min(startPos + segmentWords.length + 3, dafWords.length),
						matchedIndices,
						exactIndices,
						score,
						matchCount,
						exactMatchCount
					};
					
					// If we found a really good match, stop searching
					if (exactMatchCount >= 3 || matchCount >= segmentWords.length * 0.6) {
						console.log(`  Found good match at position ${startPos} (${matchCount} matches, ${exactMatchCount} exact)`);
						break;
					}
				}
			}
			
			if (bestMatch) {
				matches.push(bestMatch);
				currentDafPosition = bestMatch.endIndex - 2; // Overlap slightly for next search
				console.log(`  ✓ Matched at position ${bestMatch.startIndex}-${bestMatch.endIndex}`);
				console.log(`    ${bestMatch.matchCount} words matched (${bestMatch.exactMatchCount} exact)`);
			} else {
				// No match found - use estimated position
				const estimatedEnd = Math.min(currentDafPosition + segmentWords.length + 5, dafWords.length);
				matches.push({
					startIndex: currentDafPosition,
					endIndex: estimatedEnd,
					matchedIndices: [],
					exactIndices: [],
					score: 0,
					matchCount: 0,
					exactMatchCount: 0
				});
				currentDafPosition = estimatedEnd;
				console.log(`  ✗ No match found, using position ${currentDafPosition}-${estimatedEnd}`);
			}
		}
		
		// Apply the simplified matches
		console.log('\n=== APPLYING MATCHES ===');
		let totalMatched = 0;
		let totalExact = 0;
		
		for (let i = 0; i < sefariaSegments.length; i++) {
			const match = matches[i];
			if (match) {
				sefariaSegments[i].dafSupplierMatch = dafWords.slice(match.startIndex, match.endIndex).join(' ');
				sefariaSegments[i].similarity = match.score;
				sefariaSegments[i].matchedIndices = match.matchedIndices;
				sefariaSegments[i].exactMatchIndices = match.exactIndices; // Only exact matches for underlining
				
				if (match.matchCount > 0) totalMatched++;
				if (match.exactMatchCount > 0) totalExact++;
			}
		}
		
		console.log(`\nMATCHING SUMMARY:`);
		console.log(`  Total segments: ${sefariaSegments.length}`);
		console.log(`  Segments with matches: ${totalMatched}`);
		console.log(`  Segments with exact matches: ${totalExact}`);
		
		matchingProgress.push({ 
			type: 'result', 
			message: `Matched ${totalMatched}/${sefariaSegments.length} segments (${totalExact} with exact matches)` 
		});
		
		isMatching = false;
		return sefariaSegments;
	}
	
	// Fill gaps between matched segments
	function fillGapsBetweenMatches(matches: any[], dafWords: string[]) {
		for (let i = 0; i < matches.length; i++) {
			// If this segment has no match but is surrounded by matches, fill the gap
			if (!matches[i] && i > 0 && i < matches.length - 1) {
				const prevMatch = matches[i - 1];
				const nextMatch = matches[i + 1];
				
				if (prevMatch && nextMatch) {
					// Use the text between the two matched segments
					const gapStart = prevMatch.endIndex;
					const gapEnd = nextMatch.startIndex;
					
					if (gapEnd > gapStart && gapEnd - gapStart < 50) { // Reasonable gap size
						matches[i] = {
							text: dafWords.slice(gapStart, gapEnd).join(' '),
							similarity: 0.5, // Mark as gap-filled
							matchedIndices: [],
							startIndex: gapStart,
							endIndex: gapEnd,
							gapFilled: true
						};
						
						matchingProgress.push({ 
							type: 'gap', 
							message: `Filled gap at segment ${i + 1} with ${gapEnd - gapStart} words` 
						});
					}
				}
			}
		}
	}
	
	// Try a complete matching strategy
	function tryMatchingStrategy(segments: any[], dafWords: string[], strategy: any) {
		// Use anchor-based matching for better accuracy
		if (strategy.useAnchors) {
			return tryAnchorBasedMatching(segments, dafWords, strategy);
		}
		
		const matches = [];
		let currentWordIndex = 0;
		
		for (let i = 0; i < segments.length; i++) {
			const segmentWords = segments[i].normalized.split(' ').filter(w => w.length > 0);
			
			// Try to find match with current strategy
			const match = findSegmentMatchWithStrategy(
				dafWords, 
				segmentWords, 
				currentWordIndex, 
				strategy
			);
			
			if (match.found) {
				// Determine segment end more conservatively
				const endIndex = determineSegmentEndConservative(
					dafWords,
					match.startIndex,
					segmentWords,
					match.matchedIndices,
					i < segments.length - 1 ? segments[i + 1] : null
				);
				
				matches[i] = {
					text: dafWords.slice(match.startIndex, endIndex).join(' '),
					similarity: match.matchLength / segmentWords.length,
					matchedIndices: match.matchedIndices,
					startIndex: match.startIndex,
					endIndex
				};
				
				currentWordIndex = endIndex;
			} else {
				matches[i] = null;
				// Don't advance too far when no match found
				currentWordIndex = Math.min(currentWordIndex + 3, dafWords.length);
			}
		}
		
		return matches;
	}
	
	// Anchor-based matching: find unique words first, then expand
	function tryAnchorBasedMatching(segments: any[], dafWords: string[], strategy: any) {
		const matches = [];
		matchingProgress.push({ type: 'info', message: 'Using anchor-based matching strategy' });
		
		// First pass: find strong anchors (unique or rare words)
		const anchors = [];
		let searchStartIndex = 0; // Track where we should start searching
		
		for (let i = 0; i < segments.length; i++) {
			const segmentWords = segments[i].normalized.split(' ').filter(w => w.length > 0);
			if (segmentWords.length === 0) continue;
			
			// Priority 1: Look for 2+ consecutive word matches (lowered from 3)
			let bestAnchor = null;
			
			// Expand search window based on strategy
			const searchWindow = strategy.searchWindow || 50;
			
			// Try to find a sequence of words that match
			for (let startPos = searchStartIndex; startPos < Math.min(dafWords.length, searchStartIndex + searchWindow); startPos++) {
				let consecutiveMatches = 0;
				let matchedIndices = [];
				let skipsUsed = 0;
				
				// Check how many consecutive words match from the beginning
				for (let j = 0; j < Math.min(segmentWords.length, 7); j++) {
					let found = false;
					
					// Allow some skips based on strategy
					for (let skip = 0; skip <= strategy.maxInitialSkip && !found; skip++) {
						const dafIdx = startPos + j + skip;
						if (dafIdx < dafWords.length && wordsMatch(segmentWords[j], dafWords[dafIdx])) {
							consecutiveMatches++;
							matchedIndices.push(j);
							skipsUsed += skip;
							found = true;
						}
					}
					
					// If we didn't find a match and we're past the first few words, stop
					if (!found && j > 2 && consecutiveMatches < 2) {
						break;
					}
				}
				
				// Accept if we have 2+ consecutive matches or 50% of segment (lowered thresholds)
				if (consecutiveMatches >= 2 || consecutiveMatches >= segmentWords.length * 0.5) {
					const endIndex = Math.min(startPos + segmentWords.length + 5, dafWords.length);
					const score = (consecutiveMatches / segmentWords.length) * (1 - skipsUsed * 0.1); // Penalize skips
					
					if (!bestAnchor || score > bestAnchor.score) {
						bestAnchor = {
							segmentIndex: i,
							dafIndex: startPos,
							word: segmentWords[0],
							score: score,
							startIndex: startPos,
							endIndex: endIndex,
							consecutiveMatches,
							matchedIndices
						};
					}
					
					// If we got a really good match, stop searching
					if (consecutiveMatches >= 4 && skipsUsed <= 1) {
						break;
					}
				}
			}
			
			// Priority 2: If no consecutive match, look for unique words
			if (!bestAnchor) {
				const uniqueWords = segmentWords.filter(w => w.length > 4 || isAbbreviation(w));
				if (uniqueWords.length === 0) {
					uniqueWords.push(...segmentWords.filter(w => w.length > 2));
				}
				
				for (const word of uniqueWords) {
					for (let j = searchStartIndex; j < Math.min(dafWords.length, searchStartIndex + 50); j++) {
						if (wordsMatch(word, dafWords[j])) {
							const contextMatch = verifyAnchorContext(segmentWords, dafWords, j, word);
							if (contextMatch.score > 0.25) {
								if (!bestAnchor || contextMatch.score > bestAnchor.score) {
									bestAnchor = {
										segmentIndex: i,
										dafIndex: j,
										word,
										score: contextMatch.score,
										startIndex: contextMatch.startIndex,
										endIndex: contextMatch.endIndex
									};
								}
							}
						}
					}
				}
			}
			
			if (bestAnchor) {
				anchors.push(bestAnchor);
				searchStartIndex = bestAnchor.endIndex; // Update search position
				matchingProgress.push({ 
					type: 'success', 
					message: `Found anchor for segment ${i + 1}: ${bestAnchor.consecutiveMatches || 'unique'} matches at position ${bestAnchor.startIndex}` 
				});
			} else {
				matchingProgress.push({ 
					type: 'gap', 
					message: `No anchor found for segment ${i + 1}` 
				});
			}
		}
		
		// Sort anchors by daf position
		anchors.sort((a, b) => a.dafIndex - b.dafIndex);
		
		// Second pass: use anchors to match segments
		let lastEndIndex = 0;
		for (let i = 0; i < segments.length; i++) {
			const segmentWords = segments[i].normalized.split(' ').filter(w => w.length > 0);
			const anchor = anchors.find(a => a.segmentIndex === i);
			
			if (anchor) {
				// We have an anchor for this segment
				matches[i] = {
					text: dafWords.slice(anchor.startIndex, anchor.endIndex).join(' '),
					similarity: anchor.score,
					matchedIndices: [],
					startIndex: anchor.startIndex,
					endIndex: anchor.endIndex
				};
				lastEndIndex = anchor.endIndex;
			} else {
				// No anchor - try to match based on position
				const match = findSegmentMatchWithStrategy(
					dafWords,
					segmentWords,
					lastEndIndex,
					strategy
				);
				
				if (match.found) {
					const endIndex = Math.min(
						match.startIndex + segmentWords.length + 5,
						dafWords.length
					);
					
					matches[i] = {
						text: dafWords.slice(match.startIndex, endIndex).join(' '),
						similarity: match.matchLength / segmentWords.length,
						matchedIndices: match.matchedIndices,
						startIndex: match.startIndex,
						endIndex
					};
					lastEndIndex = endIndex;
				} else {
					matches[i] = null;
				}
			}
		}
		
		return matches;
	}
	
	// Verify context around an anchor word
	function verifyAnchorContext(segmentWords: string[], dafWords: string[], anchorIndex: number, anchorWord: string) {
		const segmentAnchorIndex = segmentWords.indexOf(anchorWord);
		if (segmentAnchorIndex === -1) return { score: 0, startIndex: anchorIndex, endIndex: anchorIndex + 1 };
		
		let matchCount = 1; // We already matched the anchor
		let startIndex = anchorIndex;
		let endIndex = anchorIndex + 1;
		
		// Check words before the anchor
		for (let i = 1; i <= segmentAnchorIndex && i <= 3; i++) {
			const segWord = segmentWords[segmentAnchorIndex - i];
			const dafWord = dafWords[anchorIndex - i];
			if (segWord && dafWord && wordsMatch(segWord, dafWord)) {
				matchCount++;
				startIndex = anchorIndex - i;
			}
		}
		
		// Check words after the anchor
		for (let i = 1; i < segmentWords.length - segmentAnchorIndex && i <= 5; i++) {
			const segWord = segmentWords[segmentAnchorIndex + i];
			const dafWord = dafWords[anchorIndex + i];
			if (segWord && dafWord && wordsMatch(segWord, dafWord)) {
				matchCount++;
				endIndex = anchorIndex + i + 1;
			}
		}
		
		const score = matchCount / segmentWords.length;
		return { score, startIndex, endIndex };
	}
	
	// Calculate overall matching score
	function calculateOverallScore(matches: any[]) {
		if (!matches || matches.length === 0) return 0;
		
		let totalScore = 0;
		let matchedCount = 0;
		
		for (const match of matches) {
			if (match) {
				totalScore += match.similarity;
				matchedCount++;
			}
		}
		
		// Penalize if too many segments didn't match
		const matchRate = matchedCount / matches.length;
		return matchRate * (totalScore / matches.length);
	}
	
	// Common Talmudic abbreviations mapping
	const abbreviationMap: Record<string, string> = {
		'אכ': 'אם כן',
		'אר': 'אמר רבי',
		'דר': 'דאמר רבי',
		'וכו': 'וכולי',
		'תר': 'תנא רבנן',
		'בד': 'בית דין',
		'לר': 'לרבי',
		'דכ': 'דכתיב',
		'אע': 'אף על',
		'אעפ': 'אף על פי',
		'אעג': 'אף על גב',
		'מש': 'משום',
		'בש': 'בית שמאי',
		'בה': 'בית הלל'
	};
	
	// Check if a word looks like an abbreviation
	function isAbbreviation(word: string) {
		return word.includes('״');
	}
	
	// Check if two words are equivalent (handles abbreviations)
	function wordsMatch(word1: string, word2: string, debug: boolean = false) {
		// Direct match
		if (word1 === word2) {
			if (debug) console.log(`✓ Direct match: ${word1} === ${word2}`);
			return true;
		}
		
		// Remove ״ for comparison if present
		const clean1 = word1.replace(/״/g, '');
		const clean2 = word2.replace(/״/g, '');
		
		// Check if one is an abbreviation of the other
		if (abbreviationMap[clean1] === clean2 || abbreviationMap[clean2] === clean1) {
			if (debug) console.log(`✓ Abbreviation match: ${word1} <-> ${word2}`);
			return true;
		}
		if (abbreviationMap[word1] === word2 || abbreviationMap[word2] === word1) {
			if (debug) console.log(`✓ Abbreviation match (with ״): ${word1} <-> ${word2}`);
			return true;
		}
		
		// If one has ״ (abbreviation marker), be more flexible
		if (isAbbreviation(word1) || isAbbreviation(word2)) {
			// Allow abbreviations to match their expansions more loosely
			if (clean1.startsWith(clean2) || clean2.startsWith(clean1)) {
				if (debug) console.log(`✓ Partial abbreviation match: ${word1} ~ ${word2}`);
				return true;
			}
		}
		
		// Check if they're very similar (edit distance <= 1 for short words)
		if (Math.abs(clean1.length - clean2.length) <= 1 && clean1.length <= 4) {
			const similarity = calculateLevenshteinDistance(clean1, clean2);
			if (similarity <= 1) {
				if (debug) console.log(`✓ Fuzzy match (distance ${similarity}): ${word1} ~ ${word2}`);
				return true;
			}
		}
		
		if (debug && word1 && word2) {
			console.log(`✗ No match: ${word1} ≠ ${word2}`);
		}
		
		return false;
	}
	
	// Calculate Levenshtein distance for fuzzy matching
	function calculateLevenshteinDistance(str1: string, str2: string) {
		const matrix = [];
		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}
		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1
					);
				}
			}
		}
		return matrix[str2.length][str1.length];
	}
	
	// Find segment match with specific strategy
	function findSegmentMatchWithStrategy(dafWords: string[], segmentWords: string[], startFrom: number, strategy: any) {
		let bestMatch = {
			found: false,
			startIndex: -1,
			matchedIndices: [] as number[],
			matchLength: 0
		};
		
		for (let startIndex = startFrom; startIndex < Math.min(dafWords.length - 2, startFrom + strategy.searchWindow); startIndex++) {
			const matchResult = tryMatchWithStrategy(dafWords, segmentWords, startIndex, strategy);
			
			// Require good start or high match rate
			const hasGoodStart = matchResult.consecutiveFromStart >= 3;
			const hasHighMatchRate = matchResult.totalMatches >= segmentWords.length * 0.6;
			
			if (hasGoodStart || hasHighMatchRate) {
				if (matchResult.totalMatches > bestMatch.matchLength) {
					bestMatch = {
						found: true,
						startIndex,
						matchedIndices: matchResult.matchedIndices,
						matchLength: matchResult.totalMatches
					};
				}
				
				// Early exit on excellent match
				if (matchResult.consecutiveFromStart >= 5) {
					break;
				}
			}
		}
		
		return bestMatch;
	}
	
	// Try matching with specific strategy parameters
	function tryMatchWithStrategy(dafWords: string[], segmentWords: string[], startIndex: number, strategy: any) {
		const matchedIndices: number[] = [];
		let totalMatches = 0;
		let consecutiveFromStart = 0;
		let dafOffset = 0;
		let inInitialRun = true;
		
		for (let segIndex = 0; segIndex < segmentWords.length; segIndex++) {
			let matched = false;
			const maxSkip = (segIndex < 3 || inInitialRun) ? strategy.maxInitialSkip : strategy.maxLaterSkip;
			
			for (let skip = 0; skip <= maxSkip && !matched; skip++) {
				const dafIndex = startIndex + segIndex + dafOffset + skip;
				if (dafIndex < dafWords.length) {
					if (wordsMatch(segmentWords[segIndex], dafWords[dafIndex])) {
						matchedIndices.push(segIndex);
						totalMatches++;
						if (inInitialRun) consecutiveFromStart++;
						dafOffset += skip;
						matched = true;
					}
				}
			}
			
			if (!matched && inInitialRun) {
				inInitialRun = false;
			}
		}
		
		return { totalMatches, matchedIndices, consecutiveFromStart };
	}
	
	// Determine segment end conservatively
	function determineSegmentEndConservative(dafWords: string[], startIndex: number, segmentWords: string[], matchedIndices: number[], nextSegment: any) {
		// Start with a conservative estimate based on matched words
		let endIndex = startIndex + segmentWords.length;
		
		// If we have a next segment, check where it starts
		if (nextSegment) {
			const nextWords = nextSegment.normalized.split(' ').filter(w => w.length > 0);
			if (nextWords.length >= 3) {
				// Look for the start of the next segment
				for (let i = startIndex + segmentWords.length; i < Math.min(dafWords.length, startIndex + segmentWords.length + 10); i++) {
					let matchCount = 0;
					for (let j = 0; j < Math.min(3, nextWords.length); j++) {
						if (i + j < dafWords.length && wordsMatch(nextWords[j], dafWords[i + j])) {
							matchCount++;
						}
					}
					// If we found the start of the next segment, stop here
					if (matchCount >= 2) {
						return i;
					}
				}
			}
		}
		
		// Adjust based on match quality
		if (matchedIndices.length > 0) {
			const lastMatchedIndex = Math.max(...matchedIndices);
			// Don't include too many unmatched words at the end
			endIndex = Math.min(endIndex, startIndex + lastMatchedIndex + 3);
		}
		
		return endIndex;
	}
	
	// Improved matching algorithm with better constraints
	function findSegmentMatch(dafWords: string[], segmentWords: string[], startFrom: number) {
		let bestMatch = {
			found: false,
			startIndex: -1,
			matchedIndices: [] as number[],
			totalMatches: 0,
			matchQuality: 0,
			consecutiveMatches: 0
		};
		
		// Only search within a reasonable window
		const searchWindow = Math.min(15, segmentWords.length * 2);
		
		for (let startIndex = startFrom; startIndex < Math.min(dafWords.length - 2, startFrom + searchWindow); startIndex++) {
			const matchResult = tryMatchAtPosition(dafWords, segmentWords, startIndex);
			
			// Require at least 3 consecutive matches at the beginning OR 60% total matches
			const hasGoodStart = matchResult.consecutiveFromStart >= 3;
			const hasHighMatchRate = matchResult.totalMatches >= segmentWords.length * 0.6;
			
			if (hasGoodStart || hasHighMatchRate) {
				const quality = (matchResult.totalMatches / segmentWords.length) * 
				               (matchResult.consecutiveFromStart / Math.min(5, segmentWords.length));
				
				if (quality > bestMatch.matchQuality) {
					bestMatch = {
						...matchResult,
						found: true,
						startIndex,
						matchQuality: quality
					};
				}
				
				// If we found an excellent match, stop searching
				if (matchResult.consecutiveFromStart >= 5 && matchResult.totalMatches >= segmentWords.length * 0.75) {
					break;
				}
			}
		}
		
		return {
			found: bestMatch.found,
			startIndex: bestMatch.startIndex,
			matchLength: bestMatch.totalMatches,
			matchedIndices: bestMatch.matchedIndices
		};
	}
	
	// Try to match at a specific position with controlled flexibility
	function tryMatchAtPosition(dafWords: string[], segmentWords: string[], startIndex: number) {
		const matchedIndices: number[] = [];
		let totalMatches = 0;
		let consecutiveFromStart = 0;
		let dafOffset = 0;
		let maxSkipsUsed = 0;
		let inInitialRun = true;
		
		for (let segIndex = 0; segIndex < segmentWords.length; segIndex++) {
			let matched = false;
			
			// For the first few words, be stricter (allow max 1 skip)
			// For later words, allow up to 2 skips
			const maxSkip = (segIndex < 3 || inInitialRun) ? 1 : 2;
			
			for (let skip = 0; skip <= maxSkip && !matched; skip++) {
				const dafIndex = startIndex + segIndex + dafOffset + skip;
				if (dafIndex < dafWords.length) {
					if (wordsMatch(segmentWords[segIndex], dafWords[dafIndex])) {
						matchedIndices.push(segIndex);
						totalMatches++;
						
						// Track consecutive matches from the start
						if (inInitialRun) {
							consecutiveFromStart++;
						}
						
						dafOffset += skip;
						maxSkipsUsed = Math.max(maxSkipsUsed, skip);
						matched = true;
					}
				}
			}
			
			// If we didn't match and we're still in the initial run, end it
			if (!matched && inInitialRun) {
				inInitialRun = false;
			}
			
			// If we've used too many skips total, this is probably not a good match
			if (maxSkipsUsed > 3) {
				break;
			}
		}
		
		return { 
			totalMatches, 
			matchedIndices,
			consecutiveFromStart
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
				prevSegment.matchedIndices = []; // Clear since we're correcting the boundary
				currentSegment.dafSupplierMatch = currentText;
				currentSegment.similarity = matchLength / currentSegmentWords.length;
				// Mark which words were matched in the current segment
				const currentMatchedIndices = [];
				for (let i = 0; i < currentSegmentWords.length; i++) {
					for (let j = 0; j < matchLength; j++) {
						if (i + j < currentSegmentWords.length && 
							wordsMatch(currentSegmentWords[i], prevWords[startPos + i + j])) {
							currentMatchedIndices.push(i);
							break;
						}
					}
				}
				currentSegment.matchedIndices = currentMatchedIndices;
				
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
						// For gap-filled segments, try to identify which words match
						const gapWords = normalizeHebrew(gapText).split(' ').filter(w => w.length > 0);
						const segWords = segment.normalized.split(' ').filter(w => w.length > 0);
						const gapMatchedIndices = [];
						for (let i = 0; i < segWords.length; i++) {
							for (let j = 0; j < gapWords.length; j++) {
								if (wordsMatch(segWords[i], gapWords[j])) {
									gapMatchedIndices.push(i);
									break;
								}
							}
						}
						segment.matchedIndices = gapMatchedIndices;
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
		// Initialize state from URL first
		initializeFromUrl();
		// Then test the endpoint with the restored state
		testEndpoint();
	});
	
	// Update URL when endpoint changes
	$: if (browser && selectedEndpoint) {
		updateUrl();
	}
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
			
			<div class="summary">
				<h4>Summary</h4>
				<pre>{getResponseSummary()}</pre>
			</div>
				
				{#if selectedEndpoint === 'texts' && response.text}
					<div class="text-preview">
						{#if dafSupplierData || loadingDafSupplier || isMatching}
							<details class="matching-debug" open={isMatching}>
								<summary>
									Matching Progress 
									{#if isMatching}
										<span class="loading-indicator">(Matching in progress...)</span>
									{:else if loadingDafSupplier}
										<span class="loading-indicator">(Loading HebrewBooks data...)</span>
									{:else}
										({matchingProgress.filter(p => p.type === 'result')[0]?.message || 'Ready'})
									{/if}
								</summary>
								<div class="progress-log">
									{#each matchingProgress as progress}
										<div class="progress-item {progress.type}">
											<span class="type-badge">{progress.type}</span>
											<span class="message">{progress.message}</span>
										</div>
									{/each}
								</div>
							</details>
						{/if}
						<div class="text-content three-column">
							<div class="column-headers" class:with-daf={dafSupplierData}>
								<div class="header">Reference</div>
								<div class="header">Sefaria Hebrew</div>
								{#if dafSupplierData}
									<div class="header">HebrewBooks Match</div>
								{/if}
							</div>
							{#each (dafSupplierData ? getMatchedSegments() : getTextSegments()) as segment}
								<div class="segment-row" class:with-daf={dafSupplierData}>
									<div class="ref-label">{segment.ref}</div>
									<div class="hebrew sefaria">{segment.hebrew}</div>
									{#if dafSupplierData}
										<div class="hebrew daf-supplier">
											{#if segment.dafSupplierMatch}
												<div class="match-content">
													{@html formatMatchedText(segment.dafSupplierMatch, segment.normalized, segment.exactMatchIndices || [])}
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
		grid-template-columns: 100px 1fr 1fr;
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
		grid-template-columns: 100px 1fr 1fr;
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
	
	.match-content u {
		text-decoration: underline;
		text-decoration-color: #4ade80;
		text-decoration-thickness: 2px;
		text-underline-offset: 2px;
		background-color: rgba(74, 222, 128, 0.1);
	}
	
	.matching-debug {
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: #f8f9fa;
		border: 1px solid #dee2e6;
		border-radius: 0.25rem;
	}
	
	.matching-debug summary {
		cursor: pointer;
		font-weight: 600;
		color: #495057;
	}
	
	.progress-log {
		margin-top: 0.5rem;
		max-height: 200px;
		overflow-y: auto;
		font-size: 0.875rem;
	}
	
	.progress-item {
		display: flex;
		gap: 0.5rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid #e9ecef;
	}
	
	.type-badge {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		min-width: 60px;
		text-align: center;
	}
	
	.progress-item.info .type-badge { background: #cfe2ff; color: #004085; }
	.progress-item.strategy .type-badge { background: #fff3cd; color: #856404; }
	.progress-item.score .type-badge { background: #d1ecf1; color: #0c5460; }
	.progress-item.success .type-badge { background: #d4edda; color: #155724; }
	.progress-item.result .type-badge { background: #d6d8db; color: #383d41; }
	.progress-item.gap .type-badge { background: #f8d7da; color: #721c24; }
	
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
	
	.hebrew.sefaria {
		/* Remove width constraint to let grid handle sizing */
	}
	
	.segment-row.with-daf .hebrew.sefaria {
		padding-right: 1rem;
	}
	
	.segment-row.with-daf .hebrew.daf-supplier {
		background: #f0f9ff;
		border-left: 2px solid #60a5fa;
		padding-left: 1rem !important;
		padding-right: 1rem;
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