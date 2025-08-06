<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { 
		alignTexts, 
		normalizeHebrew, 
		extractTalmudContent,
		wordsMatchFuzzy 
	} from '$lib/services/textAlignment';
	
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
	
	// Click-to-context functionality
	let selectedContext: SelectionContext | null = null;
	let correspondingContext: SelectionContext | null = null;
	let matchedSegments: SegmentMapping[] = [];
	let showContextModal = false;
	let lastAlignment: any = null;
	let segmentMappings: SegmentMapping[] = [];
	
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
		goto(newUrl, { replaceState: true, noScroll: true });
	}
	
	// Define endpoints
	const endpoints: Record<string, any> = {
		texts: {
			name: 'Texts API',
			url: (params: any) => `https://www.sefaria.org/api/texts/${params.ref}?commentary=0`,
			description: 'Retrieve text content with Hebrew and English translations',
			params: { ref: 'textRef' }
		},
		search: {
			name: 'Search',
			url: (params: any) => `https://www.sefaria.org/api/search?q=${encodeURIComponent(params.query)}&size=10&field=exact`,
			description: 'Search across all texts',
			params: { query: 'searchQuery' }
		},
		index: {
			name: 'Index',
			url: (params: any) => `https://www.sefaria.org/api/index/${params.title}`,
			description: 'Get structural information about a text',
			params: { title: 'indexTitle' }
		},
		topics: {
			name: 'Topics',
			url: (params: any) => `https://www.sefaria.org/api/topics/${params.slug}`,
			description: 'Get information about a specific topic',
			params: { slug: 'topicSlug' }
		},
		links: {
			name: 'Links',
			url: (params: any) => {
				let url = `https://www.sefaria.org/api/links/${params.ref}`;
				const queryParams = [];
				if (params.type) queryParams.push(`type=${params.type}`);
				if (params.direction) queryParams.push(`direction=${params.direction}`);
				if (queryParams.length) url += `?${queryParams.join('&')}`;
				return url;
			},
			description: 'Get connections between texts',
			params: { ref: 'linkRef', type: 'linkType', direction: 'linkDirection' }
		},
		calendars: {
			name: 'Calendars',
			url: (params: any) => `https://www.sefaria.org/api/calendars/${params.date}`,
			description: 'Get Jewish calendar information for a specific date',
			params: { date: 'calendars' }
		},
		name: {
			name: 'Name Lookup',
			url: (params: any) => `https://www.sefaria.org/api/name/${encodeURIComponent(params.query)}`,
			description: 'Look up information about a person or term',
			params: { query: 'nameQuery' }
		},
		person: {
			name: 'Person',
			url: (params: any) => `https://www.sefaria.org/api/person/${params.key}`,
			description: 'Get detailed information about a specific person',
			params: { key: 'personKey' }
		},
		collections: {
			name: 'Collections',
			url: (params: any) => `https://www.sefaria.org/api/collections/${params.slug}`,
			description: 'Get information about text collections',
			params: { slug: 'collectionSlug' }
		},
		groups: {
			name: 'Groups',
			url: (params: any) => `https://www.sefaria.org/api/groups/${params.name}`,
			description: 'Get information about user groups',
			params: { name: 'groupName' }
		},
		terms: {
			name: 'Terms',
			url: (params: any) => `https://www.sefaria.org/api/terms/${params.name}`,
			description: 'Get information about specific terms',
			params: { name: 'termName' }
		}
	};
	
	// Test the selected endpoint
	async function testEndpoint() {
		loading = true;
		error = '';
		response = null;
		
		try {
			// Build parameters based on endpoint
			const endpoint = endpoints[selectedEndpoint];
			const params: any = {};
			
			// Map parameter names to values
			switch (selectedEndpoint) {
				case 'texts':
					params.ref = textRef;
					break;
				case 'search':
					params.query = searchQuery;
					break;
				case 'index':
					params.title = indexTitle;
					break;
				case 'topics':
					params.slug = topicSlug;
					break;
				case 'links':
					params.ref = linkRef;
					params.type = linkType;
					params.direction = linkDirection;
					break;
				case 'calendars':
					params.date = calendars;
					break;
				case 'name':
					params.query = nameQuery;
					break;
				case 'person':
					params.key = personKey;
					break;
				case 'collections':
					params.slug = collectionSlug;
					break;
				case 'groups':
					params.name = groupName;
					break;
				case 'terms':
					params.name = termName;
					break;
			}
			
			const url = endpoint.url(params);
			console.log('Fetching:', url);
			
			const startTime = performance.now();
			const res = await fetch(url);
			responseTime = performance.now() - startTime;
			
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}
			
			response = await res.json();
			console.log('Response:', response);
			
			// For texts endpoint, also fetch from daf-supplier
			if (selectedEndpoint === 'texts' && response.he) {
				await fetchDafSupplierData();
			}
			
		} catch (e: any) {
			error = e.message || 'An error occurred';
			console.error('Error:', e);
		} finally {
			loading = false;
		}
	}
	
	// Fetch from daf-supplier API
	async function fetchDafSupplierData() {
		loadingDafSupplier = true;
		dafSupplierData = null;
		
		try {
			// Extract tractate and daf from textRef
			const parts = textRef.split('.');
			if (parts.length !== 2) return;
			
			const tractate = parts[0];
			const daf = parts[1];
			
			// Convert daf format for daf-supplier
			// The pattern is: 2a=2, 2b=3, 3a=4, 3b=5, etc.
			// So: page N amud a = (N*2), page N amud b = (N*2) + 1
			const dafNum = parseInt(daf);
			const isAmudB = daf.includes('b');
			const sequentialDaf = isAmudB ? (dafNum * 2) + 1 : (dafNum * 2);
			
			console.log('Converting daf:', { daf, dafNum, isAmudB, sequentialDaf });
			
			// Map tractate to numeric ID (simplified mapping)
			const tractateMap: Record<string, string> = {
				'Berakhot': '1',
				'Shabbat': '2',
				'Eruvin': '3',
				'Pesachim': '4',
				'Shekalim': '5',
				'Yoma': '6',
				'Sukkah': '7',
				'Beitzah': '8',
				'Rosh_Hashanah': '9',
				'Taanit': '10',
				'Megillah': '11',
				'Moed_Katan': '12',
				'Chagigah': '13'
			};
			
			const mesechtaId = tractateMap[tractate];
			if (!mesechtaId) {
				console.log('Unknown tractate:', tractate);
				return;
			}
			
			const url = `/api/daf-supplier?mesechta=${mesechtaId}&daf=${sequentialDaf}`;
			console.log('Fetching daf-supplier:', url);
			
			const response = await fetch(url);
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
	
	// Get aligned word pairs for display
	function getAlignedWordPairs() {
		if (!response?.he || !dafSupplierData?.mainText) return null;
		
		// Combine all Sefaria segments
		const combinedSefariaText = response.he
			.filter((h: any) => h != null)
			.join(' ');
			
		if (!combinedSefariaText.trim()) return null;
		
		// Extract and clean HebrewBooks text
		const hebrewBooksExtracted = extractTalmudContent(dafSupplierData.mainText);
		
		// Use alignment service
		const alignmentResult = alignTexts(combinedSefariaText, hebrewBooksExtracted, Math.max(1000, combinedSefariaText.split(' ').length + 200));
		
		return {
			alignment: alignmentResult.alignment,
			wordComparison: alignmentResult.wordComparison,
			statistics: alignmentResult.statistics
		};
	}
	
	// Get matched segments with proper word-to-segment mapping
	function getMatchedSegments() {
		// Validate inputs
		if (!response?.he || !Array.isArray(response.he) || !dafSupplierData?.mainText) {
			console.log('Invalid response data for matching');
			return [];
		}
		
		if (response.error || !response.he.length) {
			console.log('API returned error or empty segments');
			return [];
		}
		
		if (isMatching) return [];
		
		matchingProgress = [];
		isMatching = true;
		
		// Create segments with metadata
		const sefariaSegments = response.he
			.filter((hebrew: any) => hebrew != null)
			.map((hebrew: string, i: number) => {
				const hebrewText = typeof hebrew === 'string' ? hebrew : String(hebrew || '');
				return {
					index: i,
					hebrew: hebrewText,
					english: response.text?.[i] || '',
					normalized: hebrewText ? normalizeHebrew(hebrewText) : '',
					ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`,
					dafSupplierMatch: null as string | null,
					similarity: 0,
					matchedIndices: [] as number[],
					exactMatchIndices: [] as number[]
				};
			});
		
		if (sefariaSegments.length === 0) {
			isMatching = false;
			return [];
		}
		
		// Build word-to-segment mapping BEFORE joining
		const wordToSegmentMap: number[] = [];
		const allSefariaWords: string[] = [];
		
		for (let segIdx = 0; segIdx < sefariaSegments.length; segIdx++) {
			const words = sefariaSegments[segIdx].hebrew.split(' ').filter(w => w.trim());
			for (const word of words) {
				allSefariaWords.push(word);
				wordToSegmentMap.push(segIdx);
			}
		}
		
		const combinedSefariaText = allSefariaWords.join(' ');
		const hebrewBooksExtracted = extractTalmudContent(dafSupplierData.mainText);
		
		console.log('=== ALIGNMENT START ===');
		console.log(`Total segments: ${sefariaSegments.length}`);
		console.log(`Total Sefaria words: ${allSefariaWords.length}`);
		console.log(`Word-to-segment map length: ${wordToSegmentMap.length}`);
		
		if (!combinedSefariaText.trim() || !hebrewBooksExtracted.trim()) {
			isMatching = false;
			return sefariaSegments;
		}
		
		// Perform alignment
		try {
			var fullAlignment = alignTexts(combinedSefariaText, hebrewBooksExtracted, allSefariaWords.length + 500);
		} catch (error) {
			console.error('Error in alignTexts:', error);
			isMatching = false;
			return sefariaSegments;
		}
		
		if (!fullAlignment.alignment.pairs.length) {
			isMatching = false;
			return sefariaSegments;
		}
		
		// Map alignment back to segments using the word-to-segment map
		const segmentHebrewBooksWords: string[][] = Array(sefariaSegments.length).fill(null).map(() => []);
		const segmentMatches: number[] = Array(sefariaSegments.length).fill(0);
		const segmentExactMatches: number[] = Array(sefariaSegments.length).fill(0);
		
		let sefariaWordIndex = 0;
		
		for (const pair of fullAlignment.alignment.pairs) {
			if (pair.sefaria) {
				// This pair has a Sefaria word
				if (sefariaWordIndex < wordToSegmentMap.length) {
					const segIdx = wordToSegmentMap[sefariaWordIndex];
					
					// Add the HebrewBooks word to this segment
					if (pair.hebrewBooks) {
						segmentHebrewBooksWords[segIdx].push(pair.hebrewBooks);
						
						// Check if it's a match
						if (pair.matched) {
							segmentMatches[segIdx]++;
							
							// Check for exact match
							if (pair.sefaria === pair.hebrewBooks) {
								segmentExactMatches[segIdx]++;
							}
						}
					}
					
					sefariaWordIndex++;
				}
			} else if (pair.hebrewBooks && sefariaWordIndex > 0) {
				// This is an insertion - add it to the previous segment's text
				const segIdx = wordToSegmentMap[Math.min(sefariaWordIndex - 1, wordToSegmentMap.length - 1)];
				if (segIdx !== undefined) {
					segmentHebrewBooksWords[segIdx].push(pair.hebrewBooks);
				}
			}
		}
		
		// Apply results to segments
		for (let i = 0; i < sefariaSegments.length; i++) {
			const segment = sefariaSegments[i];
			const segmentWordCount = segment.hebrew.split(' ').filter(w => w.trim()).length;
			
			if (segmentHebrewBooksWords[i].length > 0) {
				segment.dafSupplierMatch = segmentHebrewBooksWords[i].join(' ');
				segment.similarity = segmentWordCount > 0 ? segmentMatches[i] / segmentWordCount : 0;
				
				console.log(`Segment ${i + 1}: ${segmentMatches[i]}/${segmentWordCount} matches`);
			}
		}
		
		console.log(`Alignment complete: ${fullAlignment.alignment.score * 100}% overall score`);
		
		matchingProgress.push({ 
			type: 'result', 
			message: `Aligned ${sefariaSegments.filter(s => s.dafSupplierMatch).length}/${sefariaSegments.length} segments` 
		});
		
		// Store alignment result for click-to-context
		lastAlignment = fullAlignment;
		
		// Create segment mappings for click-to-context
		if (response?.he && Array.isArray(response.he)) {
			const sefariaSegs = response.he
				.filter((hebrew: any) => hebrew != null)
				.map((hebrew: string, i: number) => ({
					ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`,
					he: typeof hebrew === 'string' ? hebrew : String(hebrew || ''),
					en: response.text?.[i] || ''
				}));
			segmentMappings = createSegmentMappings(sefariaSegs);
		}
		
		isMatching = false;
		return sefariaSegments;
	}
	
	// Handle text selection for click-to-context
	function handleTextClick(event: MouseEvent) {
		if (!lastAlignment || !segmentMappings.length) return;
		
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		
		const selectedText = selection.toString().trim();
		if (!selectedText) return;
		
		// Find the selection in the alignment
		selectedContext = findSelectionInAlignment(selectedText, lastAlignment.alignment, 'hebrewBooks');
		
		if (selectedContext) {
			// Find corresponding text in Sefaria
			correspondingContext = findCorrespondingText(selectedContext, lastAlignment.alignment, 'hebrewBooks');
			
			// Find which Sefaria segments this corresponds to
			if (correspondingContext) {
				matchedSegments = getSegmentsFromSelection(correspondingContext, segmentMappings);
			}
			
			// Get context around selection
			if (selectedContext) {
				const context = getSelectionContext(selectedContext, lastAlignment.alignment, 15, 'hebrewBooks');
				console.log('Selection context:', context);
			}
			
			showContextModal = true;
		}
		
		// Clear selection
		selection.removeAllRanges();
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
										<div class="hebrew daf-supplier" on:mouseup={handleTextClick}>
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
							<div class="search-result" on:click={() => handleTextSelection(hit._id)}>
								<h5>{hit._source.ref}</h5>
								<p class="hebrew">{hit._source.hebrew}</p>
								<p class="english">{hit._source.english || hit._source.text}</p>
								<div class="metadata">
									<span>Category: {hit._source.category}</span>
									<span>Type: {hit._source.type}</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				
				{#if selectedEndpoint === 'links' && response}
					<div class="links-display">
						<h4>Text Links</h4>
						<div class="link-summary">
							<p>Total links: {Array.isArray(response) ? response.length : 0}</p>
						</div>
						{#if Array.isArray(response)}
							<div class="links-grid">
								{#each response.slice(0, 20) as link}
									<div class="link-item">
										<div class="link-header">
											<span class="link-ref">{link.ref}</span>
											<span class="link-type">{link.type}</span>
										</div>
										<div class="link-text">
											{#if link.he}
												<p class="hebrew">{link.he}</p>
											{/if}
											{#if link.text}
												<p class="english">{link.text}</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				
				<details class="raw-response">
					<summary>Raw Response Data</summary>
					<pre>{formatJSON(response)}</pre>
				</details>
		</div>
	{/if}
	
	{#if showTextSelection}
		<div class="text-selection-notice">
			<p>Selected text: <strong>{selectedTextRef}</strong></p>
			<p>Now showing links for this text.</p>
		</div>
	{/if}
	
	<!-- Context Modal -->
	{#if showContextModal && selectedContext}
		<div class="context-modal-overlay" on:click={() => showContextModal = false}>
			<div class="context-modal" on:click|stopPropagation>
				<div class="modal-header">
					<h3>Selected Text Context</h3>
					<button class="close-btn" on:click={() => showContextModal = false}>×</button>
				</div>
				<div class="modal-body">
					<div class="context-section">
						<h4>Selected Text (HebrewBooks)</h4>
						<p class="hebrew selected-text">{selectedContext.text}</p>
						<p class="word-indices">Words {selectedContext.startWordIndex + 1} - {selectedContext.endWordIndex + 1}</p>
					</div>
					
					{#if correspondingContext}
						<div class="context-section">
							<h4>Corresponding Text (Sefaria)</h4>
							<p class="hebrew corresponding-text">{correspondingContext.text}</p>
							<p class="word-indices">Words {correspondingContext.startWordIndex + 1} - {correspondingContext.endWordIndex + 1}</p>
						</div>
					{/if}
					
					{#if matchedSegments.length > 0}
						<div class="context-section">
							<h4>Sefaria Segments</h4>
							{#each matchedSegments as segment}
								<div class="segment-info">
									<div class="segment-ref">{segment.segmentRef}</div>
									<p class="hebrew segment-text">{segment.hebrewText}</p>
									{#if segment.englishText}
										<p class="english segment-translation">{segment.englishText}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	h1 {
		color: #333;
		margin-bottom: 2rem;
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
		background: white;
	}
	
	.description {
		margin-top: 0.5rem;
		color: #666;
		font-size: 0.9rem;
	}
	
	.params {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.params label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	
	.params input,
	.params select {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}
	
	button {
		background: #007bff;
		color: white;
		border: none;
		padding: 0.75rem 2rem;
		font-size: 1rem;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	button:hover:not(:disabled) {
		background: #0056b3;
	}
	
	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.error {
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		padding: 1rem;
		margin-bottom: 2rem;
	}
	
	.error h3 {
		color: #c00;
		margin: 0 0 0.5rem 0;
	}
	
	.error pre {
		margin: 0;
		color: #800;
		font-size: 0.9rem;
	}
	
	.response {
		background: white;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}
	
	.response-header {
		display: flex;
		align-items: center;
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
		background: #f9f9f9;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.summary h4 {
		margin: 0 0 0.5rem 0;
		color: #555;
	}
	
	.summary pre {
		margin: 0;
		font-size: 0.9rem;
		color: #444;
	}
	
	.raw-response {
		margin-top: 1.5rem;
	}
	
	.raw-response summary {
		cursor: pointer;
		padding: 0.5rem;
		background: #f0f0f0;
		border-radius: 4px;
		user-select: none;
	}
	
	.raw-response summary:hover {
		background: #e8e8e8;
	}
	
	.raw-response pre {
		margin-top: 1rem;
		padding: 1rem;
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 0.85rem;
		max-height: 500px;
		overflow-y: auto;
	}
	
	/* Text preview styles */
	.text-preview {
		margin-top: 1.5rem;
	}
	
	.text-preview h4 {
		margin-bottom: 1rem;
		color: #555;
	}
	
	.matching-debug {
		background: #f0f8ff;
		border: 1px solid #b0d4ff;
		border-radius: 4px;
		padding: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.85rem;
	}
	
	.matching-debug summary {
		cursor: pointer;
		font-weight: 600;
		color: #0066cc;
	}
	
	.loading-indicator {
		color: #ff9900;
		font-weight: normal;
		animation: pulse 1.5s ease-in-out infinite;
	}
	
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	
	.progress-log {
		margin-top: 0.5rem;
		max-height: 150px;
		overflow-y: auto;
		font-family: monospace;
		font-size: 0.8rem;
	}
	
	.progress-item {
		padding: 0.25rem 0.5rem;
		margin: 0.25rem 0;
		border-radius: 3px;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	
	.progress-item.info {
		background: #e3f2fd;
		color: #0d47a1;
	}
	
	.progress-item.success {
		background: #e8f5e9;
		color: #1b5e20;
	}
	
	.progress-item.warning {
		background: #fff3e0;
		color: #e65100;
	}
	
	.progress-item.error {
		background: #ffebee;
		color: #b71c1c;
	}
	
	.progress-item.gap {
		background: #fce4ec;
		color: #880e4f;
	}
	
	.progress-item.result {
		background: #f3e5f5;
		color: #4a148c;
		font-weight: 600;
	}
	
	.type-badge {
		background: rgba(0,0,0,0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.7rem;
		text-transform: uppercase;
		font-weight: 600;
	}
	
	.text-content {
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		overflow: hidden;
		background: white;
	}
	
	.text-content.three-column {
		display: table;
		width: 100%;
	}
	
	.column-headers {
		display: table-row;
		background: #f5f5f5;
		font-weight: 600;
		border-bottom: 2px solid #ddd;
	}
	
	.column-headers.with-daf {
		display: table-row;
	}
	
	.column-headers .header {
		display: table-cell;
		padding: 0.75rem;
		text-align: center;
		vertical-align: middle;
		border-right: 1px solid #ddd;
	}
	
	.column-headers .header:last-child {
		border-right: none;
	}
	
	.segment-row {
		display: table-row;
		border-bottom: 1px solid #eee;
	}
	
	.segment-row:hover {
		background: #fafafa;
	}
	
	.segment-row.with-daf {
		display: table-row;
	}
	
	.segment-row > div {
		display: table-cell;
		padding: 0.75rem;
		vertical-align: top;
		border-right: 1px solid #eee;
	}
	
	.segment-row > div:last-child {
		border-right: none;
	}
	
	.ref-label {
		font-weight: 600;
		color: #666;
		font-size: 0.85rem;
		white-space: nowrap;
		width: 120px;
		background: #fafafa;
	}
	
	.hebrew {
		font-family: 'David Libre', 'Noto Serif Hebrew', serif;
		font-size: 1.1rem;
		line-height: 1.6;
		direction: rtl;
		text-align: right;
	}
	
	.hebrew.sefaria {
		background: #fff;
	}
	
	.hebrew.daf-supplier {
		background: #fffef5;
		position: relative;
	}
	
	.match-content {
		position: relative;
	}
	
	.match-content :global(u) {
		text-decoration: underline;
		text-decoration-color: #4caf50;
		text-decoration-thickness: 2px;
		background: rgba(76, 175, 80, 0.1);
	}
	
	.similarity-score {
		position: absolute;
		top: 0;
		left: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: system-ui, -apple-system, sans-serif;
		direction: ltr;
	}
	
	.similarity-score[data-quality="excellent"] {
		background: #4caf50;
		color: white;
		border-color: #388e3c;
	}
	
	.similarity-score[data-quality="good"] {
		background: #8bc34a;
		color: white;
		border-color: #689f38;
	}
	
	.similarity-score[data-quality="fair"] {
		background: #ffeb3b;
		color: #333;
		border-color: #f9a825;
	}
	
	.similarity-score[data-quality="poor"] {
		background: #ff9800;
		color: white;
		border-color: #ef6c00;
	}
	
	.no-match {
		color: #999;
		font-style: italic;
		font-family: system-ui, -apple-system, sans-serif;
	}
	
	.english {
		font-size: 0.95rem;
		line-height: 1.5;
		color: #444;
	}
	
	/* Search results styles */
	.search-results {
		margin-top: 1.5rem;
	}
	
	.search-results h4 {
		margin-bottom: 0.5rem;
		color: #555;
	}
	
	.hint {
		color: #666;
		font-size: 0.9rem;
		margin-bottom: 1rem;
		font-style: italic;
	}
	
	.search-result {
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 1rem;
		margin-bottom: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.search-result:hover {
		background: #f9f9f9;
		border-color: #007bff;
		box-shadow: 0 2px 4px rgba(0,123,255,0.1);
	}
	
	.search-result h5 {
		margin: 0 0 0.5rem 0;
		color: #007bff;
	}
	
	.search-result .hebrew {
		margin: 0.5rem 0;
		padding: 0.5rem;
		background: #f9f9f9;
		border-radius: 4px;
	}
	
	.search-result .english {
		margin: 0.5rem 0;
		color: #555;
	}
	
	.search-result .metadata {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: #666;
	}
	
	.search-result .metadata span {
		background: #f0f0f0;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
	}
	
	/* Links display styles */
	.links-display {
		margin-top: 1.5rem;
	}
	
	.links-display h4 {
		margin-bottom: 1rem;
		color: #555;
	}
	
	.link-summary {
		background: #f9f9f9;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
	}
	
	.link-summary p {
		margin: 0;
		color: #666;
	}
	
	.links-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}
	
	.link-item {
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.75rem;
		background: white;
		transition: border-color 0.2s;
	}
	
	.link-item:hover {
		border-color: #007bff;
	}
	
	.link-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #eee;
	}
	
	.link-ref {
		color: #007bff;
		font-weight: 600;
		font-size: 0.9rem;
	}
	
	.link-type {
		background: #e3f2fd;
		color: #1976d2;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	
	.link-text .hebrew {
		margin: 0.5rem 0;
		padding: 0.5rem;
		background: #f9f9f9;
		border-radius: 4px;
		font-size: 1rem;
	}
	
	.link-text .english {
		margin: 0.5rem 0;
		font-size: 0.9rem;
		color: #555;
		line-height: 1.4;
	}
	
	/* Text selection notice */
	.text-selection-notice {
		background: #e3f2fd;
		border: 1px solid #90caf9;
		border-radius: 4px;
		padding: 1rem;
		margin: 1rem 0;
	}
	
	.text-selection-notice p {
		margin: 0.25rem 0;
		color: #1565c0;
	}
	
	.text-selection-notice strong {
		color: #0d47a1;
	}
	
	/* Click-to-context styles */
	.hebrew.daf-supplier {
		cursor: text;
		user-select: text;
	}
	
	.hebrew.daf-supplier::selection {
		background-color: #b3d9ff;
	}
	
	/* Context Modal */
	.context-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}
	
	.context-modal {
		background: white;
		border-radius: 8px;
		max-width: 800px;
		max-height: 80vh;
		overflow: auto;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}
	
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #e0e0e0;
	}
	
	.modal-header h3 {
		margin: 0;
		font-size: 1.4em;
	}
	
	.close-btn {
		background: none;
		border: none;
		font-size: 28px;
		cursor: pointer;
		color: #666;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.close-btn:hover {
		color: #000;
	}
	
	.modal-body {
		padding: 20px;
	}
	
	.context-section {
		margin-bottom: 25px;
	}
	
	.context-section h4 {
		margin: 0 0 10px 0;
		color: #333;
		font-size: 1.1em;
	}
	
	.selected-text,
	.corresponding-text {
		padding: 15px;
		background: #f8f9fa;
		border-radius: 4px;
		margin: 10px 0;
	}
	
	.selected-text {
		background: #e3f2fd;
	}
	
	.corresponding-text {
		background: #f3e5f5;
	}
	
	.word-indices {
		font-size: 0.9em;
		color: #666;
		margin: 5px 0;
	}
	
	.segment-info {
		margin-bottom: 20px;
		padding: 15px;
		background: #fafafa;
		border-radius: 4px;
		border-left: 3px solid #4CAF50;
	}
	
	.segment-ref {
		font-weight: bold;
		color: #2c5282;
		margin-bottom: 8px;
	}
	
	.segment-text {
		margin: 10px 0;
	}
	
	.segment-translation {
		margin: 10px 0;
		color: #555;
		font-style: italic;
	}
</style>