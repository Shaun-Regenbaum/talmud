<!--
	@component DafRenderer
	
	Renders a Talmud page using the daf-renderer library.
	Handles loading states, error states, and responsive scaling.
	
	@example
	```svelte
	<DafRenderer
		pageData={currentPageData}
		loading={false}
		error={null}
		vilnaMode={true}
	/>
	```
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { rendererStore } from '$lib/stores/renderer';
	import { processTextsForRenderer } from '$lib/utils/text-processor';
	import Toggle from './Toggle.svelte';
	import type { HebrewBooksPage } from '$lib/api/hebrewbooks';
	
	/**
	 * Component props interface
	 */
	interface Props {
		/** Page data to render */
		pageData: HebrewBooksPage | null;
		/** Whether page is loading */
		loading?: boolean;
		/** Error message if load failed */
		error?: string | null;
		/** Whether to use Vilna mode (with line breaks) */
		vilnaMode?: boolean;
		/** Callback when retry is clicked */
		onRetry?: () => void;
	}
	
	let { 
		pageData = null,
		loading = false,
		error = null,
		vilnaMode = $bindable(false),
		onRetry
	}: Props = $props();
	
	let dafContainer = $state<HTMLDivElement>();
	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
	let rendered = $state(false);
	
	// Constants for responsive scaling
	const dafWidth = 600; // Our content width (from default options)
	const dafOfWindow = 4.4 / 12; // Proportion of window width to use
	
	// Track last rendered page to prevent excessive re-renders
	let lastRenderedKey = $state('');
	
	// Handle rendering when page data changes
	$effect(() => {
		if (loading || !pageData || !dafContainer) {
			return;
		}
		
		// Create unique key for this page data including display mode
		const currentPageKey = `${pageData.tractate}-${pageData.daf}-${pageData.amud}-${vilnaMode}`;
		
		// Skip if we already rendered this exact data with same mode
		if (lastRenderedKey === currentPageKey) {
			return;
		}
		
		// Update tracking key
		lastRenderedKey = currentPageKey;
		
		// Add a small delay to ensure DOM is stable after loading state changes
		setTimeout(() => {
			// Initialize renderer container only once
			if (dafContainer) {
				rendererStore.initialize(dafContainer);
			}
			
			// Use advanced text processor for proper styling
			const { mainHTML, rashiHTML, tosafotHTML } = processTextsForRenderer(
				pageData.mainText || '',
				pageData.rashi || '',
				pageData.tosafot || ''
			);
			const pageLabel = (pageData.daf + pageData.amud).replace('a', 'א').replace('b', 'ב');
			
			// Small delay to ensure renderer is ready
			setTimeout(() => {
				try {
					// Pass vilnaMode as lineBreakMode (Vilna uses line breaks, custom doesn't)
					rendererStore.render(mainHTML, rashiHTML, tosafotHTML, pageLabel, vilnaMode);
					
					// Check for spacing issues after render
					setTimeout(() => {
						const renderer = rendererStore.getRenderer();
						if (renderer && renderer.checkExcessiveSpacing) {
							renderer.checkExcessiveSpacing();
						}
					}, 100);
					
					// Mark as rendered for scaling
					setTimeout(() => {
						rendered = true;
					}, 300);
				} catch (error) {
					// Silently handle render errors
				}
			}, 50);
		}, 100);
	});
	
	onMount(() => {
		// Setup window resize handler
		const handleResize = () => {
			windowWidth = window.innerWidth;
		};
		
		window.addEventListener('resize', handleResize);
		
		// Cleanup on unmount
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
	
	// Generate transform style for responsive scaling
	function getTransformStyle(): string {
		// Always calculate scale, don't depend on rendered state
		const scale = Math.min(1, (windowWidth * dafOfWindow) / dafWidth); // Cap at 1x scale
		return scale < 1 ? `transform: scale(${scale}); transform-origin: top left;` : '';
	}
</script>

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
			{#if onRetry}
				<button 
					onclick={onRetry}
					class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
				>
					Retry
				</button>
			{/if}
		</div>
	</div>
{:else}
	<!-- Always show the container, even if no data yet -->
	<div class="relative">
		<!-- Loading overlay -->
		{#if loading}
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
			{#if !pageData && !loading}
				<div class="flex items-center justify-center h-full text-gray-400">
					<p>Select a page to view</p>
				</div>
			{/if}
		</div>
		
		<!-- Traditional daf-renderer layout only -->
		<span class="preload">preload</span>
		
		<!-- Page info below the daf -->
		{#if pageData}
			<div class="mt-8 space-y-4">
				<div class="border-t pt-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-gray-500">
							Source: HebrewBooks.org | {pageData.tractate} {pageData.daf}{pageData.amud}
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

<style>
	/* Import daf-renderer styles */
	@import '$lib/daf-renderer/styles.css';
	
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