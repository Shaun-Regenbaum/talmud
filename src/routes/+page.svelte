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
	
	async function loadTalmudPage(tractate: string, page: string) {
		loading = true;
		error = null;
		
		try {
			pageData = await hebrewBooksAPI.fetchPage(tractate, page);
			loading = false;
			
			// Wait for DOM to update after loading is false
			await new Promise(resolve => requestAnimationFrame(resolve));
			
			// Initialize renderer if needed
			initializeRenderer();
			
			// Re-render with new data
			if (renderer && pageData) {
				// Format text for daf-renderer with HTML spans
				const formatText = (text: string, prefix: string): string => {
					if (!text || text.trim() === '') {
						return `<span class='sentence' id='sentence-${prefix}-0'></span>`;
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
				
				renderer.render(
					formatText(pageData.mainText || '', 'main'),
					formatText(pageData.rashi || '', 'rashi'),
					formatText(pageData.tosafot || '', 'tosafot'),
					page.replace('a', 'א').replace('b', 'ב')
				);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load Talmud page';
			console.error('Error loading page:', e);
			loading = false;
		}
	}
	
	function initializeRenderer() {
		if (!dafContainer || renderer) return;
		
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
				
				<!-- Page Navigation -->
				<div class="flex items-center gap-4">
					<button 
						onclick={() => changePage('Berakhot', '2a')}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
						disabled={loading}
					>
						Berakhot 2a
					</button>
					<button 
						onclick={() => changePage('Berakhot', '2b')}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
						disabled={loading}
					>
						Berakhot 2b
					</button>
					<button 
						onclick={() => changePage('Berakhot', '3a')}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
						disabled={loading}
					>
						Berakhot 3a
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
				<div bind:this={dafContainer} class="w-full min-h-[900px] h-[900px] max-w-[1200px] mx-auto border border-gray-300 rounded-lg overflow-auto bg-[#f5f5dc]">
					<!-- The daf-renderer will populate this container -->
				</div>
				
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