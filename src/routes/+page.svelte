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
			
			// Check if the selection is within the daf container (now inside DafRenderer)
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
				<PageNavigator 
					bind:tractate={selectedTractate}
					bind:page={selectedPage}
					bind:amud={selectedAmud}
					loading={$isLoading}
					vilnaMode={vilnaMode}
					on:change={handlePageChange}
				/>
			</div>
			
			<!-- Daf Renderer Component -->
			<DafRenderer 
				pageData={$currentPage}
				loading={$isLoading}
				error={$pageError}
				bind:vilnaMode={vilnaMode}
				onRetry={() => talmudStore.loadPage($pageInfo.tractate, $pageInfo.page, $pageInfo.amud)}
			/>
		</div>

		<!-- Footer -->
		<div class="text-center text-sm text-gray-500">
			<p>Made by Shaun Regenbaum</p>
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