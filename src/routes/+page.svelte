<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo } from '$lib/stores/talmud';
	import { rendererStore } from '$lib/stores/renderer';
	import TranslationPopup from '$lib/components/TranslationPopup.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { openRouterTranslator } from '$lib/openrouter-translator';
	import { renderMarkdown } from '$lib/markdown';
	import { processTextsForRenderer } from '$lib/text-processor';
	import '$lib/styles/talmud-text.css';
	
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
	let summaryExpanded = $state(false);
	
	// Display mode - true for Vilna (with line breaks), false for Custom (traditional)
	let vilnaMode = $state(data.mode === 'vilna');
	
	// Update URL when mode changes
	function updateMode() {
		const mode = vilnaMode ? 'vilna' : 'custom';
		const url = new URL(window.location.href);
		url.searchParams.set('mode', mode);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}
	
	// Watch for mode changes and update URL
	$effect(() => {
		// Skip on initial load
		if (lastDataKey) {
			updateMode();
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
	


	// Track last rendered page to prevent excessive re-renders
	let lastRenderedKey = $state('');
	
	// Handle rendering when page data changes
	$effect(() => {
		const pageData = $currentPage;
		const loading = $isLoading;
		
		console.log('📊 Render effect triggered:', { 
			hasPageData: !!pageData, 
			loading, 
			hasContainer: !!dafContainer,
			pageInfo: pageData ? `${pageData.tractate} ${pageData.daf}${pageData.amud}` : 'none'
		});
		
		if (loading || !pageData || !dafContainer) {
			return;
		}
		
		// Create unique key for this page data including display mode
		const currentPageKey = `${pageData.tractate}-${pageData.daf}-${pageData.amud}-${pageData.mainText?.length || 0}-${vilnaMode}`;
		
		// Skip if we already rendered this exact data with same mode
		if (lastRenderedKey === currentPageKey) {
			return;
		}
		
		// Update tracking key
		lastRenderedKey = currentPageKey;
		
		// Add a small delay to ensure DOM is stable after loading state changes
		setTimeout(() => {
			// Initialize renderer only once and only if container exists
			if (!rendererStore.getRenderer() && dafContainer) {
				console.log('🚀 Initializing renderer for first time');
				rendererStore.initialize(dafContainer);
			}
			
			// Ensure renderer exists before proceeding
			const renderer = rendererStore.getRenderer();
			if (!renderer) {
				console.error('❌ No renderer available after initialization attempt');
				return;
			}
			
			// Use advanced text processor for proper styling
			console.log('📝 Pre-processing texts:', {
				mainHasBr: (pageData.mainText || '').includes('<br>'),
				rashiHasBr: (pageData.rashi || '').includes('<br>'),
				tosafotHasBr: (pageData.tosafot || '').includes('<br>'),
				mainSample: (pageData.mainText || '').substring(0, 200)
			});
			
			const { mainHTML, rashiHTML, tosafotHTML } = processTextsForRenderer(
				pageData.mainText || ' ',
				pageData.rashi || ' ',
				pageData.tosafot || ' '
			);
			
			console.log('📝 Post-processing texts:', {
				mainHasBr: mainHTML.includes('<br>'),
				rashiHasBr: rashiHTML.includes('<br>'),
				tosafotHasBr: tosafotHTML.includes('<br>'),
				mainSample: mainHTML.substring(0, 200)
			});
			const pageLabel = (pageData.daf + pageData.amud).replace('a', 'א').replace('b', 'ב');
			
			
			// Small delay to ensure renderer is ready
			setTimeout(() => {
				try {
					console.log('🎨 Rendering with mode:', { vilnaMode, pageLabel, hasBrTags: mainHTML.includes('<br>') });
					// Pass vilnaMode as lineBreakMode (Vilna uses line breaks, custom doesn't)
					rendererStore.render(mainHTML, rashiHTML, tosafotHTML, pageLabel, vilnaMode);
					
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
				} catch (error) {
					// Silently handle render errors
				}
			}, 50);
		}, 100);
	});
	
	// Track data changes and load page accordingly
	let lastDataKey = $state('');
	
	$effect(() => {
		// Create a unique key from the data to detect changes
		const { tractate, page: pageNum, amud } = data;
		const currentDataKey = `${tractate}-${pageNum}-${amud}`;
		
		// Skip if this is the same data we already processed
		if (lastDataKey === currentDataKey) {
			return;
		}
		
		// Update tracking key
		lastDataKey = currentDataKey;
		
		// Update form state
		selectedTractate = tractate;
		selectedPage = pageNum;
		selectedAmud = amud;
		
		// Load the new page data with line break mode enabled
		talmudStore.loadPage(tractate, pageNum, amud, { lineBreakMode: true });
		
		// Load summary for the page
		loadSummary();
	});
	
	onMount(async () => {
		// Initial load is handled by the effect above
		
		// Setup window resize handler
		const handleResize = () => {
			windowWidth = window.innerWidth;
			// No need to toggle rendered state - let transform update smoothly
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
			amud: selectedAmud,
			mode: vilnaMode ? 'vilna' : 'custom'
		});
		
		// Use SvelteKit navigation instead of full page reload
		await goto(`?${params.toString()}`);
	}
	
	// Generate transform style for responsive scaling
	function getTransformStyle(): string {
		// Always calculate scale, don't depend on rendered state
		const scale = Math.min(1, (windowWidth * dafOfWindow) / dafWidth); // Cap at 1x scale
		return scale < 1 ? `transform: scale(${scale}); transform-origin: top left;` : '';
	}
	
	// Load page summary
	async function loadSummary(refresh = false) {
		if (!openRouterTranslator.isConfigured()) {
			summaryError = null; // Don't show error if API key not configured
			return;
		}

		summaryLoading = true;
		summaryError = null;

		try {
			const refreshParam = refresh ? '&refresh=true' : '';
			const response = await fetch(`/api/summary?tractate=${selectedTractate}&page=${selectedPage}&amud=${selectedAmud}${refreshParam}`);
			if (!response.ok) {
				throw new Error(`Failed to load summary: ${response.status}`);
			}

			const summaryData = await response.json();
			
			// Check if we need to fetch from daf-supplier first
			if (summaryData.requiresClientFetch) {
				// Fetch from daf-supplier directly
				const dafResponse = await fetch(summaryData.dafSupplierUrl);
				if (!dafResponse.ok) {
					throw new Error(`Failed to fetch Talmud data: ${dafResponse.status}`);
				}
				
				const dafData = await dafResponse.json();
				
				// Now POST the mainText back to generate summary
				const summaryResponse = await fetch('/api/summary', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						tractate: summaryData.tractate,
						page: summaryData.page,
						amud: summaryData.amud,
						mainText: dafData.mainText
					})
				});
				
				if (!summaryResponse.ok) {
					throw new Error(`Failed to generate summary: ${summaryResponse.status}`);
				}
				
				summary = await summaryResponse.json();
			} else {
				summary = summaryData;
			}
		} catch (error) {
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
			<div class="border border-gray-200 rounded-lg p-4 bg-white">
				<div class="flex items-center gap-2">
					<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
					<span class="text-sm text-gray-600">Loading page summary...</span>
				</div>
			</div>
		{:else if summary}
			<div class="border border-gray-200 rounded-lg bg-white">
				<button 
					onclick={() => summaryExpanded = !summaryExpanded}
					class="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
				>
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-gray-700">📖 Page Summary</span>
						<div class="flex items-center gap-2 text-xs text-gray-500">
							{#if summary.cached}
								<span class="px-2 py-1 bg-gray-100 rounded">Cached</span>
								<button 
									onclick={(e) => {
										e.stopPropagation();
										loadSummary(true);
									}}
									class="px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition text-xs"
									disabled={summaryLoading}
								>
									🔄 Refresh
								</button>
							{:else}
								<span class="px-2 py-1 bg-green-100 text-green-600 rounded">Fresh</span>
							{/if}
							<span>{summary.wordCount} words</span>
						</div>
					</div>
					<div class="text-gray-400 transition-transform {summaryExpanded ? 'rotate-180' : ''}">
						▼
					</div>
				</button>
				{#if summaryExpanded}
					<div class="px-4 pb-4 border-t border-gray-100">
						<div class="prose max-w-none text-gray-700 leading-relaxed text-sm mt-3">
							{@html renderMarkdown(summary.summary)}
						</div>
						{#if !summary.cached}
							<div class="mt-3 text-xs text-gray-400">
								Generated with {summary.model} • {new Date(summary.generated).toLocaleString()}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else if summaryError}
			<div class="border border-red-200 rounded-lg p-4 bg-red-50">
				<div class="flex items-center justify-between">
					<div>
						<span class="text-sm font-medium text-red-800">Summary Error</span>
						<p class="text-red-600 mt-1 text-sm">{summaryError}</p>
					</div>
					<button 
						onclick={loadSummary}
						class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-xs"
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
						href="/story?tractate={selectedTractate}&page={selectedPage}&amud={selectedAmud}&mode={vilnaMode ? 'vilna' : 'custom'}"
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
								<div class="flex items-center justify-between">
									<p class="text-sm text-gray-500">
										Source: HebrewBooks.org | {$currentPage.tractate} {$currentPage.daf}{$currentPage.amud}
									</p>
									<div class="flex items-center gap-2">
										<span class="text-sm text-gray-500">Custom</span>
										<Toggle bind:checked={vilnaMode} showIcons={false} />
										<span class="text-sm text-gray-500">Vilna</span>
									</div>
								</div>
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