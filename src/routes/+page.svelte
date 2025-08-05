<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo } from '$lib/stores/talmud';
	import TranslationPopup from '$lib/components/TranslationPopup.svelte';
	import PageNavigator from '$lib/components/PageNavigator.svelte';
	import PageSummary from '$lib/components/PageSummary.svelte';
	import DafRenderer from '$lib/components/DafRenderer.svelte';
	import { openRouterTranslator } from '$lib/api/openrouter-translator';
	import '$lib/styles/talmud-text.css';
	import '$lib/styles/daf-renderer-enhancements.css';
	
	// Store cleanup function
	let translationCleanup: (() => void) | undefined;
	
	// Get data from load function
	let { data } = $props();
	
	
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
		
		// Set up text selection handling for translations
		setupTextSelectionHandling();
		
		// Cleanup on unmount
		return () => {
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
		<PageSummary 
			summary={summary}
			loading={summaryLoading}
			error={summaryError}
			on:refresh={() => loadSummary(true)}
			on:retry={() => loadSummary()}
		/>

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
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
						disabled={$isLoading}
					>
						{#if $isLoading}
							<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
						{/if}
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
				<div class="relative">
					<!-- Loading overlay -->
					{#if $isLoading}
						<div class="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
							<div class="text-center">
								<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
								<p class="mt-2 text-gray-600 text-sm">Loading page...</p>
							</div>
						</div>
					{/if}
					
					<!-- Container for the daf renderer -->
					<div bind:this={dafContainer} class="daf" style="position: relative; {getTransformStyle()}">
						<!-- The daf-renderer will populate this container -->
						{#if !$currentPage && !$isLoading}
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