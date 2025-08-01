<script lang="ts">
	import { onMount } from 'svelte';
	import dafRenderer from 'daf-renderer';
	import { hebrewBooksAPI, type HebrewBooksPage } from '$lib/hebrewbooks';
	
	let dafContainer: HTMLDivElement;
	let renderer: any;
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pageData = $state<HebrewBooksPage | null>(null);
	
	// Current page selection
	let currentTractate = $state('Berakhot');
	let currentPage = $state('2a');
	let selectedTractate = $state('Berakhot');
	let selectedPage = $state('2');
	let selectedAmud = $state('a');
	
	// Update selected values when current page changes
	$effect(() => {
		selectedTractate = currentTractate;
		const match = currentPage.match(/^(\d+)([ab])$/);
		if (match) {
			selectedPage = match[1];
			selectedAmud = match[2];
		} else {
			// Handle edge case where page might just be a number
			selectedPage = currentPage.replace(/[ab]$/, '');
			selectedAmud = currentPage.endsWith('b') ? 'b' : 'a';
		}
	});
	
	// Tractate options for the dropdown
	const tractateOptions = [
		{ value: 'Berakhot', label: 'ברכות', id: 1 },
		{ value: 'Shabbat', label: 'שבת', id: 2 },
		{ value: 'Eruvin', label: 'עירובין', id: 3 },
		{ value: 'Pesachim', label: 'פסחים', id: 4 },
		{ value: 'Shekalim', label: 'שקלים', id: 5 },
		{ value: 'Yoma', label: 'יומא', id: 6 },
		{ value: 'Sukkah', label: 'סוכה', id: 7 },
		{ value: 'Beitzah', label: 'ביצה', id: 8 },
		{ value: 'Rosh Hashanah', label: 'ראש השנה', id: 9 },
		{ value: 'Taanit', label: 'תענית', id: 10 },
		{ value: 'Megillah', label: 'מגילה', id: 11 },
		{ value: 'Moed Katan', label: 'מועד קטן', id: 12 },
		{ value: 'Chagigah', label: 'חגיגה', id: 13 },
		{ value: 'Yevamot', label: 'יבמות', id: 14 },
		{ value: 'Ketubot', label: 'כתובות', id: 15 },
		{ value: 'Nedarim', label: 'נדרים', id: 16 },
		{ value: 'Nazir', label: 'נזיר', id: 17 },
		{ value: 'Sotah', label: 'סוטה', id: 18 },
		{ value: 'Gittin', label: 'גיטין', id: 19 },
		{ value: 'Kiddushin', label: 'קידושין', id: 20 },
		{ value: 'Bava Kamma', label: 'בבא קמא', id: 21 },
		{ value: 'Bava Metzia', label: 'בבא מציעא', id: 22 },
		{ value: 'Bava Batra', label: 'בבא בתרא', id: 23 },
		{ value: 'Sanhedrin', label: 'סנהדרין', id: 24 },
		{ value: 'Makkot', label: 'מכות', id: 25 },
		{ value: 'Shevuot', label: 'שבועות', id: 26 },
		{ value: 'Avodah Zarah', label: 'עבודה זרה', id: 27 },
		{ value: 'Horayot', label: 'הוריות', id: 28 },
		{ value: 'Zevachim', label: 'זבחים', id: 29 },
		{ value: 'Menachot', label: 'מנחות', id: 30 },
		{ value: 'Chullin', label: 'חולין', id: 31 },
		{ value: 'Bekhorot', label: 'בכורות', id: 32 },
		{ value: 'Arakhin', label: 'ערכין', id: 33 },
		{ value: 'Temurah', label: 'תמורה', id: 34 },
		{ value: 'Keritot', label: 'כריתות', id: 35 },
		{ value: 'Meilah', label: 'מעילה', id: 36 },
		{ value: 'Niddah', label: 'נידה', id: 37 }
	];
	
	async function loadTalmudPage(tractate: string, page: string) {
		console.log('loadTalmudPage called with:', { tractate, page });
		loading = true;
		error = null;
		pageData = null; // Reset pageData first
		
		try {
			console.log('Fetching from hebrewBooksAPI...');
			const data = await hebrewBooksAPI.fetchPage(tractate, page);
			console.log('Received data from API:', data);
			
			if (data) {
				pageData = data;
				console.log('pageData set to:', pageData);
			} else {
				console.error('No data received from API');
				error = 'No data received from API';
			}
			
			loading = false;
			console.log('Loading set to false, pageData is:', pageData);
			
			// Wait for DOM to update after loading is false
			await new Promise(resolve => requestAnimationFrame(resolve));
			
			// Initialize renderer if needed
			initializeRenderer();
			
			// If renderer wasn't initialized, wait and try again
			if (!renderer && dafContainer) {
				console.log('Renderer not initialized, waiting for DOM...');
				await new Promise(resolve => setTimeout(resolve, 100));
				initializeRenderer();
			}
			
			// Re-render with new data
			if (renderer && pageData) {
				console.log('About to render, pageData structure:', {
					hasMainText: !!pageData.mainText,
					mainTextLength: pageData.mainText?.length,
					hasRashi: !!pageData.rashi,
					rashiLength: pageData.rashi?.length,
					hasTosafot: !!pageData.tosafot,
					tosafotLength: pageData.tosafot?.length,
					tractate: pageData.tractate,
					daf: pageData.daf,
					amud: pageData.amud
				});
				
				// Format text for daf-renderer with HTML spans
				const formatText = (text: string, prefix: string): string => {
					console.log(`formatText called for ${prefix}, text length:`, text?.length || 0);
					console.log(`First 200 chars of ${prefix}:`, text?.substring(0, 200));
					
					if (!text || text.trim() === '') {
						return `<span class='sentence' id='sentence-${prefix}-0'></span>`;
					}
					
					// Check if text already contains HTML
					const hasHTML = /<[^>]+>/.test(text);
					console.log(`${prefix} has HTML:`, hasHTML);
					
					if (hasHTML) {
						// If it already has HTML, just wrap it in a container
						return `<div class='${prefix}-content'>${text}</div>`;
					}
					
					let html = '';
					let wordId = 0;
					
					// Split by newlines first, then into words
					const lines = text.split(/\n+/);
					lines.forEach((line, lineIndex) => {
						if (line.trim()) {
							html += `<span class='sentence' id='sentence-${prefix}-${lineIndex}'>`;
							const words = line.trim().split(/\s+/);
							words.forEach(word => {
								if (word) {
									html += `<span class='word' id='word-${prefix}-${wordId}'>${word}</span> `;
									wordId++;
								}
							});
							html += '</span> ';
						}
					});
					
					return html.trim() || `<span class='sentence' id='sentence-${prefix}-0'></span>`;
				};
				
				const mainFormatted = formatText(pageData.mainText || '', 'main');
				const rashiFormatted = formatText(pageData.rashi || '', 'rashi');
				const tosafotFormatted = formatText(pageData.tosafot || '', 'tosafot');
				const pageLabel = page.replace('a', 'א').replace('b', 'ב');
				
				console.log('Rendering with:', {
					mainLength: mainFormatted.length,
					rashiLength: rashiFormatted.length,
					tosafotLength: tosafotFormatted.length,
					pageLabel
				});
				
				renderer.render(mainFormatted, rashiFormatted, tosafotFormatted, pageLabel);
				
				// Check what's in the container after rendering
				setTimeout(() => {
					console.log('Container innerHTML length:', dafContainer.innerHTML.length);
					console.log('Container has children:', dafContainer.children.length);
					console.log('Container first 500 chars:', dafContainer.innerHTML.substring(0, 500));
				}, 500);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load Talmud page';
			console.error('Error loading page:', e);
			loading = false;
		}
	}
	
	function initializeRenderer() {
		console.log('initializeRenderer called, dafContainer:', !!dafContainer, 'renderer:', !!renderer);
		if (!dafContainer || renderer) return;
		
		try {
			renderer = dafRenderer(dafContainer, {
				padding: { 
					vertical: "25px",
					horizontal: "25px"
				},
				fontFamily: {
					inner: "Rashi", 
					outer: "Rashi", 
					main: "Vilna"
				},
				fontSize: {
					main: "24px",
					side: "16px"
				},
				lineHeight: {
					main: "30px",
					side: "22px"
				},
				mainWidth: "52%",
				contentWidth: "850px",
				innerPadding: "8px",
				outerPadding: "8px",
				direction: "rtl"
			});
			console.log('Renderer initialized successfully');
		} catch (e) {
			console.error('Error initializing renderer:', e);
		}
	}
	
	onMount(async () => {
		// Load initial page
		await loadTalmudPage(currentTractate, currentPage);
	});
	
	// Function to change pages
	async function changePage(tractate: string, page: string) {
		currentTractate = tractate;
		currentPage = page;
		await loadTalmudPage(tractate, page);
	}
	
	// Function to handle form submission
	async function handlePageChange() {
		const page = `${selectedPage}${selectedAmud}`;
		console.log('handlePageChange called with:', { selectedTractate, selectedPage, selectedAmud, resultingPage: page });
		await changePage(selectedTractate, page);
	}
	
	// Generate Hebrew page numbers
	function getHebrewPageNumber(num: number): string {
		const hebrewNumbers = {
			1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י',
			11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ',
			21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל',
			31: 'לא', 32: 'לב', 33: 'לג', 34: 'לד', 35: 'לה', 36: 'לו', 37: 'לז', 38: 'לח', 39: 'לט', 40: 'מ',
			41: 'מא', 42: 'מב', 43: 'מג', 44: 'מד', 45: 'מה', 46: 'מו', 47: 'מז', 48: 'מח', 49: 'מט', 50: 'נ',
			51: 'נא', 52: 'נב', 53: 'נג', 54: 'נד', 55: 'נה', 56: 'נו', 57: 'נז', 58: 'נח', 59: 'נט', 60: 'ס',
			61: 'סא', 62: 'סב', 63: 'סג', 64: 'סד', 65: 'סה', 66: 'סו', 67: 'סז', 68: 'סח', 69: 'סט', 70: 'ע',
			71: 'עא', 72: 'עב', 73: 'עג', 74: 'עד', 75: 'עה', 76: 'עו'
		};
		return hebrewNumbers[num] || num.toString();
	}
</script>

<main class="min-h-screen bg-gray-100 p-8">
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Header -->
		<div class="bg-white rounded-lg shadow-md p-8">
			<h1 class="text-4xl font-bold text-gray-800 mb-4">Talmud Study Application</h1>
			<p class="text-gray-600 mb-6">
				Interactive Talmud study with AI-powered translations and analysis
			</p>
		</div>

		<!-- Daf Renderer -->
		<div class="bg-white rounded-lg shadow-md p-8">
			<div class="flex items-center justify-between mb-6">
				<h2 class="text-2xl font-bold text-gray-800">
					{currentTractate} {currentPage}
				</h2>
				
				<!-- Page Navigation Form -->
				<div class="flex items-center gap-4 flex-wrap">
					<!-- Tractate Selector -->
					<div class="flex items-center gap-2">
						<label for="tractate-select" class="text-sm font-medium text-gray-700">מסכת:</label>
						<select 
							id="tractate-select"
							bind:value={selectedTractate}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={loading}
						>
							{#each tractateOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					
					<!-- Page Number Input -->
					<div class="flex items-center gap-2">
						<label for="page-select" class="text-sm font-medium text-gray-700">דף:</label>
						<select 
							id="page-select"
							bind:value={selectedPage}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"
							disabled={loading}
						>
							{#each Array.from({length: 76}, (_, i) => i + 2) as pageNum}
								<option value={pageNum.toString()}>{getHebrewPageNumber(pageNum)}</option>
							{/each}
						</select>
					</div>
					
					<!-- Amud Selector -->
					<div class="flex items-center gap-2">
						<label for="amud-select" class="text-sm font-medium text-gray-700">עמוד:</label>
						<select 
							id="amud-select"
							bind:value={selectedAmud}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={loading}
						>
							<option value="a">א</option>
							<option value="b">ב</option>
						</select>
					</div>
					
					<!-- Go Button -->
					<button 
						onclick={handlePageChange}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
						disabled={loading}
					>
						{loading ? 'טוען...' : 'עבור'}
					</button>
				</div>
			</div>
			
			<!-- Loading State -->
			{#if loading}
				<div class="w-full h-[800px] border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center">
					<div class="text-center">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
						<p class="mt-4 text-gray-600">Loading Talmud page...</p>
					</div>
				</div>
			{:else if error}
				<div class="w-full h-[800px] border border-red-300 rounded-lg bg-red-50 flex items-center justify-center">
					<div class="text-center">
						<p class="text-red-600 font-semibold">Error loading page</p>
						<p class="text-red-500 mt-2">{error}</p>
						<button 
							onclick={() => loadTalmudPage(currentTractate, currentPage)}
							class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
						>
							Retry
						</button>
					</div>
				</div>
			{:else}
				<!-- Container for the daf renderer -->
				<div bind:this={dafContainer} class="w-full min-h-[900px] h-[900px] max-w-[1200px] mx-auto border border-gray-300 rounded-lg overflow-auto bg-[#f5f5dc]" style="position: relative;">
					<!-- The daf-renderer will populate this container -->
				</div>
				
				<!-- Debug: Show raw data if renderer fails -->
				{#if pageData && !renderer}
					<div class="mt-4 p-4 bg-yellow-100 border border-yellow-300 rounded">
						<p class="font-bold mb-2">Debug: Renderer not initialized, showing raw data</p>
						<div class="grid grid-cols-3 gap-4 text-sm">
							<div>
								<h4 class="font-semibold">Main Text ({pageData.mainText?.length || 0} chars)</h4>
								<div class="max-h-40 overflow-auto bg-white p-2 rounded" style="direction: rtl;">
									{@html pageData.mainText || 'No content'}
								</div>
							</div>
							<div>
								<h4 class="font-semibold">Rashi ({pageData.rashi?.length || 0} chars)</h4>
								<div class="max-h-40 overflow-auto bg-white p-2 rounded" style="direction: rtl;">
									{@html pageData.rashi || 'No content'}
								</div>
							</div>
							<div>
								<h4 class="font-semibold">Tosafot ({pageData.tosafot?.length || 0} chars)</h4>
								<div class="max-h-40 overflow-auto bg-white p-2 rounded" style="direction: rtl;">
									{@html pageData.tosafot || 'No content'}
								</div>
							</div>
						</div>
					</div>
				{/if}
				
				<!-- Page info below the daf -->
				{#if pageData}
					<div class="mt-8 space-y-4">
						<div class="border-t pt-4">
							<p class="text-sm text-gray-500">
								Source: HebrewBooks.org | {pageData.tractate} {pageData.daf}{pageData.amud}
							</p>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Footer -->
		<div class="text-center text-sm text-gray-500">
			<p>Powered by daf-renderer, Sefaria API, and OpenRouter</p>
		</div>
	</div>
</main>