<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo } from '$lib/stores/talmud';
	import TranslationPopup from '$lib/components/TranslationPopup.svelte';
	import PageNavigator from '$lib/components/PageNavigator.svelte';
	import PageSummary from '$lib/components/PageSummary.svelte';
	import DafRenderer from '$lib/components/DafRenderer.svelte';
	import SefariaSidePanel from '$lib/components/SefariaSidePanel.svelte';
	// Note: Translation now handled via API endpoints, not direct client access
	import { 
		alignTexts, 
		extractTalmudContent,
		createSegmentMappings,
		findSelectionInAlignment,
		findCorrespondingText,
		getSegmentsFromSelection,
		type SegmentMapping,
		type SelectionContext
	} from '$lib/services/textAlignment';
	import { simpleHoverManager } from '$lib/services/simpleHoverManager';
	import { processSefariaSegments } from '$lib/services/segmentSplitter';
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
	
	// Sefaria context popup state
	let sefariaContextX = $state(0);
	let sefariaContextY = $state(0);
	let selectedHebrewForContext = $state('');
	let matchedSefariaSegments = $state<SegmentMapping[]>([]);
	let currentAlignment: any = null;
	let sefariaData: any = null;
	
	// Side panel state
	let showSidePanel = $state(false);
	let selectedSegmentForPanel = $state<SegmentMapping | null>(null);
	let segmentCommentaries = $state<any[]>([]);
	let loadingCommentaries = $state(false);
	
	// Word to segment mapping
	let wordToSegmentMap = $state<Map<number, SegmentMapping>>(new Map());
	
	// Processed Sefaria segments for passing to DafRenderer
	let processedSefariaSegments = $state<any[]>([]);
	
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
		
		// Load Sefaria data for alignment
		loadSefariaData(tractate, pageNum, amud);
	});
	
	// Re-align when page data changes
	$effect(() => {
		if ($currentPage && sefariaData?.he) {
			performTextAlignment();
		}
	});
	
	onMount(async () => {
		// Initial load is handled by the effect above
		
		// Set up text selection handling for translations and Sefaria context
		setupTextSelectionHandling();
		
		// Listen for daf render complete event
		const handleRenderComplete = (event: Event) => {
			console.log('📚 Daf render complete event received');
			// Only set up hover interactions if we have alignment data
			if (currentAlignment && sefariaData) {
				// Add a small delay to ensure DOM is fully settled
				setTimeout(() => {
					console.log('⏱️ Setting up hover after delay...');
					setupHoverInteractions();
				}, 300);
			} else {
				console.log('  ⚠️ Missing data - alignment:', !!currentAlignment, 'sefaria:', !!sefariaData);
			}
		};
		
		document.addEventListener('daf-render-complete', handleRenderComplete);
		
		// Cleanup on unmount
		return () => {
			// Clean up translation event listeners if they exist
			if (translationCleanup) {
				translationCleanup();
				translationCleanup = undefined;
			}
			
			// Clean up render complete listener
			document.removeEventListener('daf-render-complete', handleRenderComplete);
			
			// Clean up hover manager
			simpleHoverManager.destroy();
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
		// Summary API handles API key internally
		// Client doesn't need to check configuration anymore

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
		// Translation popup will handle API availability internally
		
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
			
			// Limit to max 10 words for translation
			const words = selectedText.split(/\s+/);
			if (!selectedText || selectedText.length < 2) {
				showTranslationPopup = false;
				return;
			}
			
			if (words.length > 10) {
				// Too many words - don't show translation popup
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
			
			// Fetch translation from server-side API endpoint
			try {
				const response = await fetch('/api/translate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						text: selectedText,
						context: contextInfo
					})
				});
				
				if (response.ok) {
					const data = await response.json();
					selectedTranslation = data.translation;
				} else {
					selectedTranslation = 'Translation service unavailable';
				}
			} catch (error) {
				selectedTranslation = 'Translation failed';
			}
		};
		
		// Also handle Sefaria context on right-click or Alt+click
		const handleContextMenu = (event: MouseEvent) => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) return;
			
			const target = event.target as Element;
			if (!target.closest('.daf')) return;
			
			const selectedText = selection.toString().trim();
			if (!selectedText || selectedText.length < 2) return;
			
			// Prevent default context menu
			event.preventDefault();
			
			// Show Sefaria context instead of translation
			showSefariaContextForSelection(selectedText, event.clientX, event.clientY);
		};
		
		// Hide popup when clicking elsewhere
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target.closest('.translation-popup') && !target.closest('.sefaria-context-popup')) {
				showTranslationPopup = false;
			}
		};
		
		// Add event listeners
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('contextmenu', handleContextMenu);
		
		// Store cleanup function to be called later
		translationCleanup = () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('contextmenu', handleContextMenu);
		};
	}
	
	// Load Sefaria data for text alignment
	async function loadSefariaData(tractate: string, pageNum: string, amud: string) {
		try {
			const ref = `${tractate}.${pageNum}${amud}`;
			const response = await fetch(`https://www.sefaria.org/api/texts/${ref}`);
			if (response.ok) {
				sefariaData = await response.json();
				// Perform alignment if we have both HebrewBooks and Sefaria data
				if ($currentPage && sefariaData?.he) {
					performTextAlignment();
				}
			}
		} catch (error) {
			console.error('Failed to load Sefaria data:', error);
		}
	}
	
	// Perform text alignment between HebrewBooks and Sefaria
	function performTextAlignment() {
		if (!$currentPage?.mainText || !sefariaData?.he) return;
		
		try {
			// Extract and clean HebrewBooks text
			const hebrewBooksText = extractTalmudContent($currentPage.mainText);
			
			// Combine Sefaria segments
			const sefariaSegments = sefariaData.he
				.filter((h: any) => h != null)
				.map((hebrew: string, i: number) => ({
					ref: sefariaData.ref ? `${sefariaData.ref}:${i + 1}` : `Segment ${i + 1}`,
					he: typeof hebrew === 'string' ? hebrew : String(hebrew || ''),
					en: sefariaData.text?.[i] || ''
				}));
			
			console.log(`Sefaria has ${sefariaSegments.length} segments`);
			
			// Process segments to split large ones
			processedSefariaSegments = processSefariaSegments(sefariaSegments);
			console.log(`Processed into ${processedSefariaSegments.length} sub-segments for better granularity`);
			
			const combinedSefariaText = processedSefariaSegments.map((s: any) => s.he).join(' ');
			
			// Perform alignment
			currentAlignment = alignTexts(combinedSefariaText, hebrewBooksText, Math.max(1000, combinedSefariaText.split(' ').length + 200));
			
			// Create word-to-segment mapping for hover effects using processed segments
			createWordToSegmentMapping(processedSefariaSegments);
			
			// Hover interactions will be set up when daf-render-complete event fires
			
			console.log('Text alignment completed:', currentAlignment.alignment.score);
		} catch (error) {
			console.error('Text alignment failed:', error);
		}
	}
	
	// Show Sefaria context for selected text
	function showSefariaContextForSelection(selectedText: string, x: number, y: number) {
		if (!currentAlignment || !sefariaData) {
			console.log('No alignment data available');
			return;
		}
		
		try {
			// Find selection in alignment
			const selectedContext = findSelectionInAlignment(selectedText, currentAlignment.alignment, 'hebrewBooks');
			
			if (selectedContext) {
				// Find corresponding Sefaria text
				const correspondingContext = findCorrespondingText(selectedContext, currentAlignment.alignment, 'hebrewBooks');
				
				if (correspondingContext) {
					// Create segment mappings
					const sefariaSegments = sefariaData.he
						.filter((h: any) => h != null)
						.map((hebrew: string, i: number) => ({
							ref: sefariaData.ref ? `${sefariaData.ref}:${i + 1}` : `Segment ${i + 1}`,
							he: typeof hebrew === 'string' ? hebrew : String(hebrew || ''),
							en: sefariaData.text?.[i] || ''
						}));
					
					const segmentMappings = createSegmentMappings(sefariaSegments);
					
					// Get matched segments
					matchedSefariaSegments = getSegmentsFromSelection(correspondingContext, segmentMappings);
					
					if (matchedSefariaSegments.length > 0) {
						selectedHebrewForContext = selectedText;
						sefariaContextX = x;
						sefariaContextY = y + 10;
						showSefariaContext = true;
						showTranslationPopup = false; // Hide translation popup if showing context
						console.log(`Found ${matchedSefariaSegments.length} matching Sefaria segments`);
					} else {
						console.log('No matching segments found');
					}
				}
			} else {
				console.log('Could not find selection in alignment');
			}
		} catch (error) {
			console.error('Error showing Sefaria context:', error);
		}
	}
	
	// Create mapping of word indices to segments
	function createWordToSegmentMapping(sefariaSegments: any[]) {
		if (!currentAlignment) return;
		
		const segmentMappings = createSegmentMappings(sefariaSegments);
		const newMap = new Map<number, SegmentMapping>();
		
		console.log('Creating word-to-segment mapping...');
		console.log('Segment mappings:', segmentMappings);
		
		// Map each HebrewBooks word index to its corresponding segment
		for (let i = 0; i < currentAlignment.alignment.pairs.length; i++) {
			const pair = currentAlignment.alignment.pairs[i];
			
			// Only process pairs that have both sides
			if (pair.hebrewBooks && pair.sefaria && pair.sefariaIndex !== undefined && pair.hebrewBooksIndex !== undefined) {
				// Find which segment this Sefaria word belongs to
				for (const segment of segmentMappings) {
					if (pair.sefariaIndex >= segment.startWordIndex && pair.sefariaIndex <= segment.endWordIndex) {
						newMap.set(pair.hebrewBooksIndex, segment);
						break;
					}
				}
			}
		}
		
		console.log(`Mapped ${newMap.size} Hebrew Books words to segments`);
		
		// Debug: show first few mappings
		let debugCount = 0;
		newMap.forEach((segment, wordIndex) => {
			if (debugCount < 5) {
				console.log(`Word ${wordIndex} -> Segment ${segment.segmentRef}`);
				debugCount++;
			}
		});
		
		wordToSegmentMap = newMap;
	}
	
	// Setup hover interactions after rendering is complete
	function setupHoverInteractions() {
		console.log('🎯 setupHoverInteractions called');
		// Only run on client side
		if (typeof window === 'undefined') {
			console.log('  ❌ Not on client side');
			return;
		}
		
		let dafContainer = document.querySelector('.daf') as HTMLElement;
		console.log('  📦 Container .daf found:', !!dafContainer);
		
		// Try to find the actual dafRoot container that daf-renderer creates
		const dafRoot = document.querySelector('.dafRoot') as HTMLElement;
		console.log('  📦 Container .dafRoot found:', !!dafRoot);
		
		// Use dafRoot if available, otherwise fallback to .daf
		if (dafRoot) {
			console.log('  ✅ Using .dafRoot container');
			dafContainer = dafRoot;
		} else if (dafContainer) {
			console.log('  ⚠️ Using .daf container (fallback)');
		} else {
			console.error('  ❌ No container found at all!');
			return;
		}
		
		console.log('  🔗 Alignment available:', !!currentAlignment);
		
		if (!currentAlignment) {
			console.error('  ❌ No alignment data!');
			return;
		}
		
		// Process segments to split large ones
		const sefariaSegments = sefariaData?.he
			?.filter((h: any) => h != null)
			?.map((hebrew: string, i: number) => ({
				ref: sefariaData.ref ? `${sefariaData.ref}:${i + 1}` : `Segment ${i + 1}`,
				he: typeof hebrew === 'string' ? hebrew : String(hebrew || ''),
				en: sefariaData.text?.[i] || ''
			})) || [];
		
		const processedSegments = processSefariaSegments(sefariaSegments);
		console.log(`Split ${sefariaSegments.length} segments into ${processedSegments.length} sub-segments`);
		
		// Always recreate word-to-segment mapping with processed segments
		createWordToSegmentMapping(processedSegments);
		
		// Initialize hover manager immediately since rendering is complete
		console.log('Daf rendering complete, initializing hover manager');
		// Destroy any previous instance first
		simpleHoverManager.destroy();
		// Initialize simple hover manager with styling
		simpleHoverManager.init(dafContainer, wordToSegmentMap, processedSegments, true); // true = apply styling
		
		// Listen for segment clicks
		dafContainer.addEventListener('sefaria-segment-click', ((e: CustomEvent) => {
			const segmentRef = e.detail.segmentRef;
			// Find the segment mapping
			let segmentData: SegmentMapping | null = null;
			wordToSegmentMap.forEach((segment) => {
				if (segment.segmentRef === segmentRef) {
					segmentData = segment;
				}
			});
			
			if (segmentData) {
				handleSegmentClick(segmentData);
			}
		}) as EventListener);
		
		// Simple hover manager handles all the interaction logic
	}
	
	// Handle segment click to show side panel
	async function handleSegmentClick(segment: SegmentMapping) {
		selectedSegmentForPanel = segment;
		showSidePanel = true;
		
		// Load commentaries for this segment
		await loadCommentariesForSegment(segment.segmentRef);
	}
	
	// Load commentaries from Sefaria API
	async function loadCommentariesForSegment(ref: string) {
		loadingCommentaries = true;
		segmentCommentaries = [];
		
		try {
			// Fetch links/commentaries for the specific segment
			const response = await fetch(`https://www.sefaria.org/api/links/${encodeURIComponent(ref)}`);
			if (response.ok) {
				const links = await response.json();
				
				// Filter and format commentaries
				segmentCommentaries = links
					.filter((link: any) => link.category === 'Commentary')
					.map((link: any) => ({
						ref: link.ref,
						text: link.text,
						heText: link.he,
						type: link.collectiveTitle?.en || link.index_title || 'Commentary',
						category: link.category
					}));
				
				console.log(`Loaded ${segmentCommentaries.length} commentaries for ${ref}`);
			}
		} catch (error) {
			console.error('Failed to load commentaries:', error);
		} finally {
			loadingCommentaries = false;
		}
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
	
	
	<!-- Sefaria Side Panel -->
	<SefariaSidePanel
		visible={showSidePanel}
		segment={selectedSegmentForPanel}
		commentaries={segmentCommentaries}
		loading={loadingCommentaries}
		onClose={() => showSidePanel = false}
	/>
	
</main>

<style>
	/* Individual span styles for Sefaria data */
	:global(.daf .has-sefaria-data) {
		cursor: pointer;
		transition: background-color 0.15s ease;
		position: relative;
		border-radius: 2px;
		padding: 0 1px;
	}
	
	/* Ensure word-level spans inherit parent styling */
	:global(.daf .text span span.word-level) {
		/* Inherit all font properties from parent */
		font-family: inherit !important;
		font-size: inherit !important;
		font-weight: inherit !important;
		font-style: inherit !important;
		color: inherit !important;
		text-decoration: inherit !important;
		letter-spacing: inherit !important;
	}
	
	/* Ensure parent styles cascade properly */
	:global(.daf .text span.gdropcap span.word-level) {
		font-size: inherit !important;
		font-weight: inherit !important;
	}
	
	:global(.daf .text span.shastitle4 span.word-level) {
		font-size: inherit !important;
		font-weight: inherit !important;
	}
	
	/* Subtle dotted underline for available data */
	:global(.daf:not(.selecting) .has-sefaria-data) {
		background-image: linear-gradient(to right, rgba(33, 150, 243, 0.2) 25%, transparent 0%);
		background-position: bottom;
		background-size: 3px 1px;
		background-repeat: repeat-x;
	}
	
	/* Hover effect - highlight segment */
	:global(.daf:not(.selecting) .segment-hover) {
		background-color: rgba(33, 150, 243, 0.1) !important;
		background-image: none !important;
		box-shadow: 0 1px 2px rgba(33, 150, 243, 0.15);
	}
	
	/* When selecting, disable all hover effects */
	:global(.daf.selecting .has-sefaria-data) {
		background-color: transparent !important;
		background-image: none !important;
		box-shadow: none !important;
		cursor: text !important;
	}
	
	:global(.daf.selecting .segment-hover) {
		background-color: transparent !important;
		box-shadow: none !important;
	}
	
	/* Text selection style */
	:global(.daf ::selection) {
		background-color: rgba(255, 193, 7, 0.3);
		color: inherit;
	}
	
	/* Ensure proper text selection */
	:global(.daf .text span) {
		user-select: text;
		-webkit-user-select: text;
	}
	
	/* No hover on spacers */
	:global(.daf .spacer) {
		pointer-events: none !important;
		user-select: none !important;
	}
</style>