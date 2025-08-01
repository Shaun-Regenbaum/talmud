<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo } from '$lib/stores/talmud';
	import { rendererStore } from '$lib/stores/renderer';
	
	// Get data from load function
	let { data } = $props();
	
	let dafContainer = $state<HTMLDivElement>();
	
	// Form state - initialized from URL
	let selectedTractate = $state(data.tractate);
	let selectedPage = $state(data.page);
	let selectedAmud = $state(data.amud);
	
	// Subscribe to store updates
	$effect(() => {
		const info = $pageInfo;
		selectedTractate = info.tractate;
		selectedPage = info.page;
		selectedAmud = info.amud;
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
	
	// Format text for daf-renderer with HTML spans
	function formatText(text: string, prefix: string): string {
		if (!text || text.trim() === '') {
			return `<span class='sentence' id='sentence-${prefix}-0'></span>`;
		}
		
		// Check if text already contains HTML
		const hasHTML = /<[^>]+>/.test(text);
		
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
	}
	
	// Handle rendering when page data changes
	$effect(() => {
		const pageData = $currentPage;
		const loading = $isLoading;
		
		if (loading || !pageData || !dafContainer) {
			return;
		}
		
		console.log('Effect: Rendering data for', pageData.tractate, pageData.daf + pageData.amud);
		
		// Add a small delay to ensure DOM is stable after loading state changes
		setTimeout(() => {
			// Initialize renderer only once
			if (!rendererStore.getRenderer()) {
				rendererStore.initialize(dafContainer);
			}
			
			// Format and render
			const mainFormatted = formatText(pageData.mainText || ' ', 'main');
			const rashiFormatted = formatText(pageData.rashi || ' ', 'rashi');
			const tosafotFormatted = formatText(pageData.tosafot || ' ', 'tosafot');
			const pageLabel = (pageData.daf + pageData.amud).replace('a', 'א').replace('b', 'ב');
			
			console.log('Formatted text lengths:', {
				main: mainFormatted.length,
				rashi: rashiFormatted.length,
				tosafot: tosafotFormatted.length
			});
			
			// Small delay to ensure renderer is ready
			setTimeout(() => {
				rendererStore.render(mainFormatted, rashiFormatted, tosafotFormatted, pageLabel);
			}, 50);
		}, 100);
	});
	
	// Watch for data changes from navigation
	// In Svelte 5, we need to be explicit about what triggers the effect
	$effect(() => {
		// Access data properties to make them reactive dependencies
		const { tractate, page: pageNum, amud } = data;
		
		// Update form state when data changes
		selectedTractate = tractate;
		selectedPage = pageNum;
		selectedAmud = amud;
		
		// Load the new page
		console.log('Loading page from data:', { tractate, pageNum, amud });
		talmudStore.loadPage(tractate, pageNum, amud);
	});
	
	onMount(async () => {
		// Initial load is handled by the effect above
		console.log('Component mounted with data:', data);
	});
	
	// Function to handle form submission
	async function handlePageChange() {
		console.log('handlePageChange called with:', { selectedTractate, selectedPage, selectedAmud });
		
		// Update the URL using SvelteKit navigation
		const params = new URLSearchParams({
			tractate: selectedTractate,
			page: selectedPage,
			amud: selectedAmud
		});
		
		// Force a full page reload to ensure clean rendering
		window.location.href = `?${params.toString()}`;
	}
	
	// Generate Hebrew page numbers
	function getHebrewPageNumber(num: number): string {
		const hebrewNumbers: Record<number, string> = {
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
					{$pageInfo.tractate} {$pageInfo.fullPage}
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
							disabled={$isLoading}
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
							disabled={$isLoading}
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
							disabled={$isLoading}
						>
							<option value="a">א</option>
							<option value="b">ב</option>
						</select>
					</div>
					
					<!-- Go Button -->
					<button 
						onclick={handlePageChange}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
						disabled={$isLoading}
					>
						{$isLoading ? 'טוען...' : 'עבור'}
					</button>
				</div>
			</div>
			
			<!-- Loading State -->
			{#if $isLoading}
				<div class="w-full h-[800px] border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center">
					<div class="text-center">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
						<p class="mt-4 text-gray-600">Loading Talmud page...</p>
					</div>
				</div>
			{:else if $pageError}
				<div class="w-full h-[800px] border border-red-300 rounded-lg bg-red-50 flex items-center justify-center">
					<div class="text-center">
						<p class="text-red-600 font-semibold">Error loading page</p>
						<p class="text-red-500 mt-2">{$pageError}</p>
						<button 
							onclick={() => talmudStore.loadPage($pageInfo.tractate, $pageInfo.page, $pageInfo.amud)}
							class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
						>
							Retry
						</button>
					</div>
				</div>
			{:else}
				<!-- Always show the container, even if no data yet -->
				<div>
					<!-- Container for the daf renderer -->
					<div bind:this={dafContainer} class="daf-container w-full min-h-[900px] h-[900px] max-w-[1200px] mx-auto border border-gray-300 rounded-lg overflow-auto bg-[#f5f5dc]" style="position: relative;">
						<!-- The daf-renderer will populate this container -->
						{#if !$currentPage}
							<div class="flex items-center justify-center h-full text-gray-400">
								<p>Select a page to view</p>
							</div>
						{/if}
					</div>
					
					<!-- Page info below the daf -->
					{#if $currentPage}
						<div class="mt-8 space-y-4">
							<div class="border-t pt-4">
								<p class="text-sm text-gray-500">
									Source: HebrewBooks.org | {$currentPage.tractate} {$currentPage.daf}{$currentPage.amud}
								</p>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="text-center text-sm text-gray-500">
			<p>Powered by daf-renderer, Sefaria API, and OpenRouter</p>
		</div>
	</div>
</main>

<style>
	/* Import daf-renderer styles */
	@import '$lib/daf-renderer/styles.css';
	
	/* Ensure daf-renderer content is visible */
	:global(.dafRoot) {
		position: relative !important;
		width: 900px !important;
		margin: 0 auto;
	}
	
	:global(.daf-container .text) {
		opacity: 1 !important;
		visibility: visible !important;
		display: block !important;
	}
	
	:global(.daf-container .spacer) {
		display: block !important;
	}
	
	/* Ensure text spans are visible */
	:global(.daf-container span) {
		display: inline !important;
		opacity: 1 !important;
		visibility: visible !important;
	}
</style>