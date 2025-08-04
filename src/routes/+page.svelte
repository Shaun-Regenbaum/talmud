<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo } from '$lib/stores/talmud';
	import { rendererStore } from '$lib/stores/renderer';
	import TranslationPopup from '$lib/components/TranslationPopup.svelte';
	import { openRouterTranslator } from '$lib/openrouter-translator';
	
	// Store cleanup function
	let translationCleanup: (() => void) | undefined;
	
	// Get data from load function
	let { data } = $props();
	
	let dafContainer = $state<HTMLDivElement>();
	
	// Responsive scaling variables
	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
	let rendered = $state(false);
	const dafWidth = 600; // Our content width (from default options)
	const dafOfWindow = 4.4 / 12; // Proportion of window width to use
	
	// Form state - initialized from URL
	let selectedTractate = $state(data.tractate);
	let selectedPage = $state(data.page);
	let selectedAmud = $state(data.amud);
	
	// Translation popup state
	let showTranslationPopup = $state(false);
	let translationPopupX = $state(0);
	let translationPopupY = $state(0);
	let selectedHebrewText = $state('');
	let selectedTranslation = $state('');

	// Summary state
	let summary = $state<any>(null);
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);
	
	
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
	


	// Handle rendering when page data changes
	$effect(() => {
		const pageData = $currentPage;
		const loading = $isLoading;
		
		if (loading || !pageData || !dafContainer) {
			return;
		}
		
		
		// Add a small delay to ensure DOM is stable after loading state changes
		setTimeout(() => {
			// Initialize renderer only once
			if (!rendererStore.getRenderer()) {
				rendererStore.initialize(dafContainer);
			}
			
			// Process header markers in the text
			const processHeaders = (text: string, prefix: string) => {
				if (!text) return '';
				return text.replace(/\{([^\{\}]+)\}/g, `<b class='${prefix}-header'>$1</b>`);
			};
			
			const mainHTML = processHeaders(pageData.mainText || ' ', 'main');
			const rashiHTML = processHeaders(pageData.rashi || ' ', 'rashi');
			const tosafotHTML = processHeaders(pageData.tosafot || ' ', 'tosafot');
			const pageLabel = (pageData.daf + pageData.amud).replace('a', 'א').replace('b', 'ב');
			
			
			// Small delay to ensure renderer is ready
			setTimeout(() => {
				rendererStore.render(mainHTML, rashiHTML, tosafotHTML, pageLabel);
				
				// Check for spacing issues after render
				setTimeout(() => {
					const renderer = rendererStore.getRenderer();
					if (renderer && renderer.checkExcessiveSpacing) {
						renderer.checkExcessiveSpacing();
					}
				}, 100);
				
				// Apply dynamic layer selection after rendering
				setTimeout(() => {
					// Set up text selection handling for translations with OpenRouter only
					if (pageData.mainText) {
						setupTextSelectionHandling();
					}
					
					// Mark as rendered for scaling
					rendered = true;
				}, 300);
			}, 50);
		}, 100);
	});
	
	// Watch for data changes from navigation
	// In Svelte 5, we need to be explicit about what triggers the effect
	$effect(() => {
		// Access data properties to make them reactive dependencies
		const { tractate, page: pageNum, amud } = data;
		
		// Only trigger if the data actually changed
		if (selectedTractate === tractate && selectedPage === pageNum && selectedAmud === amud) {
			return;
		}
		
		// Update form state when data changes
		selectedTractate = tractate;
		selectedPage = pageNum;
		selectedAmud = amud;
		
		// Load the new page
		talmudStore.loadPage(tractate, pageNum, amud);
		
		// Load summary for the new page
		loadSummary();
	});
	
	onMount(async () => {
		// Initial load is handled by the effect above
		
		// Setup window resize handler
		const handleResize = () => {
			windowWidth = window.innerWidth;
			rendered = false;
			// Re-enable rendered after a short delay
			setTimeout(() => rendered = true, 100);
		};
		
		window.addEventListener('resize', handleResize);
		
		// Cleanup on unmount
		return () => {
			window.removeEventListener('resize', handleResize);
			// Clean up translation event listeners if they exist
			if (translationCleanup) {
				translationCleanup();
				translationCleanup = undefined;
			}
		};
	});
	
	// Function to handle form submission
	async function handlePageChange() {
		// Update the URL using SvelteKit navigation
		const params = new URLSearchParams({
			tractate: selectedTractate,
			page: selectedPage,
			amud: selectedAmud
		});
		
		// Force a full page reload to ensure clean rendering
		window.location.href = `?${params.toString()}`;
	}
	
	// Generate transform style for responsive scaling
	function getTransformStyle(): string {
		// TEMPORARILY DISABLED FOR DEBUGGING
		return '';
		
		// if (!rendered) return '';
		// const scale = Math.min(1, (windowWidth * dafOfWindow) / dafWidth); // Cap at 1x scale
		// return scale < 1 ? `transform: scale(${scale}); transform-origin: top left;` : '';
	}
	
	// Load page summary
	async function loadSummary() {
		if (!openRouterTranslator.isConfigured()) {
			summaryError = null; // Don't show error if API key not configured
			return;
		}

		summaryLoading = true;
		summaryError = null;

		try {
			const response = await fetch(`/api/summary?tractate=${selectedTractate}&page=${selectedPage}&amud=${selectedAmud}`);
			if (!response.ok) {
				throw new Error(`Failed to load summary: ${response.status}`);
			}

			const summaryData = await response.json();
			summary = summaryData;
		} catch (error) {
			console.error('Summary loading error:', error);
			summaryError = error instanceof Error ? error.message : 'Failed to load summary';
		} finally {
			summaryLoading = false;
		}
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

	// Text selection handling for translations
	function setupTextSelectionHandling() {
		// Only set up if OpenRouter is configured
		if (!openRouterTranslator.isConfigured()) {
			return;
		}
		
		// Handle text selection on the daf container
		const handleMouseUp = (event: MouseEvent) => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) {
				showTranslationPopup = false;
				return;
			}
			
			// Check if the selection is within the daf container
			const target = event.target as Element;
			if (!target.closest('.daf')) {
				showTranslationPopup = false;
				return;
			}
			
			const selectedText = selection.toString().trim();
			if (!selectedText || selectedText.length < 2) {
				showTranslationPopup = false;
				return;
			}
			
			
			// Get selection range for popup positioning
			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();
			
			// Translate using OpenRouter
			selectedHebrewText = selectedText;
			selectedTranslation = 'Translating...';
			
			// Position the popup near the selection with viewport boundary checks
			const popupWidth = 400; // Max width from TranslationPopup.svelte
			const popupHeight = 250; // Conservative estimate for height with translation
			const padding = 20;
			
			// Calculate X position - prevent bleeding off right edge
			translationPopupX = rect.left;
			if (translationPopupX + popupWidth > window.innerWidth - padding) {
				translationPopupX = window.innerWidth - popupWidth - padding;
			}
			// Prevent bleeding off left edge
			if (translationPopupX < padding) {
				translationPopupX = padding;
			}
			
			// Calculate Y position - prefer below selection, but flip above if needed
			translationPopupY = rect.bottom + 10;
			if (translationPopupY + popupHeight > window.innerHeight - padding) {
				// Show above selection instead
				translationPopupY = rect.top - popupHeight - 10;
				// If still off screen, just position at bottom of viewport
				if (translationPopupY < padding) {
					translationPopupY = window.innerHeight - popupHeight - padding;
				}
			}
			
			showTranslationPopup = true;
			
			// Build context
			const contextInfo = `Talmud ${$pageInfo.tractate} ${$pageInfo.page}${$pageInfo.amud}`;
			
			// Fetch translation from OpenRouter
			openRouterTranslator.translateText({
				text: selectedText,
				context: contextInfo
			}).then(response => {
				selectedTranslation = response.translation;
			}).catch(error => {
				selectedTranslation = 'Translation failed';
			});
		};
		
		// Hide popup when clicking elsewhere
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target.closest('.translation-popup')) {
				showTranslationPopup = false;
			}
		};
		
		// Add event listeners
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousedown', handleMouseDown);
		
		// Store cleanup function to be called later
		translationCleanup = () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mousedown', handleMouseDown);
		};
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

		<!-- Page Summary -->
		{#if summaryLoading}
			<div class="bg-blue-50 rounded-lg shadow-md p-6">
				<div class="flex items-center gap-3">
					<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
					<h3 class="text-lg font-semibold text-blue-800">Loading page summary...</h3>
				</div>
			</div>
		{:else if summary}
			<div class="bg-blue-50 rounded-lg shadow-md p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-blue-800">Page Summary</h3>
					<div class="flex items-center gap-2 text-sm text-blue-600">
						{#if summary.cached}
							<span class="px-2 py-1 bg-blue-100 rounded">Cached</span>
						{:else}
							<span class="px-2 py-1 bg-green-100 text-green-700 rounded">Fresh</span>
						{/if}
						<span>{summary.wordCount} words</span>
					</div>
				</div>
				<div class="prose max-w-none text-gray-700 leading-relaxed">
					{@html summary.summary.replace(/\n/g, '<br>')}
				</div>
				{#if !summary.cached}
					<div class="mt-4 text-xs text-blue-500">
						Generated with {summary.model} • {new Date(summary.generated).toLocaleString()}
					</div>
				{/if}
			</div>
		{:else if summaryError}
			<div class="bg-red-50 rounded-lg shadow-md p-6">
				<div class="flex items-center justify-between">
					<div>
						<h3 class="text-lg font-semibold text-red-800">Summary Error</h3>
						<p class="text-red-600 mt-1">{summaryError}</p>
					</div>
					<button 
						onclick={loadSummary}
						class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-sm"
					>
						Retry
					</button>
				</div>
			</div>
		{/if}

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
					
					<!-- Story Link -->
					<a 
						href="/story?tractate={selectedTractate}&page={selectedPage}&amud={selectedAmud}"
						class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition text-sm font-medium"
					>
						📖 Stories
					</a>
					
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
					<div bind:this={dafContainer} class="daf" style="position: relative; {getTransformStyle()}">
						<!-- The daf-renderer will populate this container -->
						{#if !$currentPage}
							<div class="flex items-center justify-center h-full text-gray-400">
								<p>Select a page to view</p>
							</div>
						{/if}
					</div>
					
					<!-- Traditional daf-renderer layout only -->
					
					<span class="preload">preload</span>
					
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
			<p>Powered by daf-renderer, HebrewBooks.org, and OpenRouter</p>
		</div>
	</div>
	
	<!-- Translation Popup -->
	<TranslationPopup 
		x={translationPopupX}
		y={translationPopupY}
		selectedText={selectedHebrewText}
		translation={selectedTranslation}
		visible={showTranslationPopup}
	/>
	
</main>

<style>
	/* Import daf-renderer styles */
	@import '$lib/daf-renderer/styles.css';
	
	/* Hebrew fonts are loaded via app.css */
	
	/* Ensure daf-renderer content is visible */
	:global(.dafRoot) {
		position: relative;
		width: 600px;
		margin: 0 auto;
	}
	
	:global(.daf .text) {
		opacity: 1;
		visibility: visible;
		display: block;
	}
	
	:global(.daf .spacer) {
		display: block;
	}
	
	/* Ensure text spans are visible */
	:global(.daf span) {
		display: inline !important;
		opacity: 1 !important;
		visibility: visible !important;
	}
	
	/* Force font sizes to prevent 0px issue - using default options */
	:global(.dafRoot .main .text span) {
		font-size: 15px !important;
		font-family: "Vilna", serif !important;
	}
	
	:global(.dafRoot .inner .text span) {
		font-size: 10.5px !important;
		font-family: "Rashi", serif !important;
	}
	
	:global(.dafRoot .outer .text span) {
		font-size: 10.5px !important;
		font-family: "Rashi", serif !important;
	}
	
	/* Force layout dimensions - using default options */
	:global(.dafRoot) {
		width: 600px !important;
		--contentWidth: 600px !important;
		--mainWidth: 50% !important;
		--fontSize-main: 15px !important;
		--fontSize-side: 10.5px !important;
		--lineHeight-main: 17px !important;
		--lineHeight-side: 14px !important;
	}
	
	:global(.dafRoot .main),
	:global(.dafRoot .inner),  
	:global(.dafRoot .outer) {
		width: 600px !important;
	}
	
	:global(.dafRoot .text) {
		width: 100% !important;
	}
	
	/* Talmud-vue styling improvements */
	:global(.daf div) {
		text-align-last: initial !important;
	}
	
	/* Hadran styling */
	:global(div.hadran) {
		display: flex;
		justify-content: center;
		font-size: 135%;
		font-family: Vilna;
		transform: translateY(50%);
	}
	
	:global(.hadran span) {
		display: inline-block;
	}
	
	
	/* Preload font */
	:global(.preload) {
		font-family: Vilna;
		opacity: 0;
	}
	
	/* Header styling */
	:global(.tosafot-header) {
		font-family: Vilna;
		font-size: 135%;
		vertical-align: bottom;
	}
	
	:global(.tosafot-header:nth-of-type(odd)) {
		font-size: 180%;
		vertical-align: bottom;
	}
	
	:global(.main-header, .rashi-header) {
		font-weight: bold;
	}
	
</style>