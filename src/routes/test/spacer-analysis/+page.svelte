<script>
	import { onMount } from 'svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	
	let tractate = 'Berakhot';
	let daf = '2';
	let loading = false;
	let error = null;
	let spacerResults = null;
	let rendererInstance = null;
	let container;
	
	// Test options
	let useLineAnalysis = true;
	let useAreaCalculation = false;
	let forceLineBreaks = false; // Start with false since text doesn't have <br> tags
	
	// Tractate options
	const tractates = [
		{ value: 'Berakhot', mesechta: '1' },
		{ value: 'Shabbat', mesechta: '2' },
		{ value: 'Eruvin', mesechta: '3' },
		{ value: 'Pesachim', mesechta: '4' },
		{ value: 'Shekalim', mesechta: '5' },
		{ value: 'Yoma', mesechta: '6' },
		{ value: 'Sukkah', mesechta: '7' },
		{ value: 'Beitzah', mesechta: '8' },
		{ value: 'Rosh Hashanah', mesechta: '9' },
		{ value: 'Taanit', mesechta: '10' },
		{ value: 'Megillah', mesechta: '11' },
		{ value: 'Moed Katan', mesechta: '12' },
		{ value: 'Chagigah', mesechta: '13' }
	];
	
	async function fetchAndAnalyze() {
		loading = true;
		error = null;
		spacerResults = null;
		
		try {
			// Get mesechta ID
			const selectedTractate = tractates.find(t => t.value === tractate);
			if (!selectedTractate) {
				throw new Error('Invalid tractate selected');
			}
			
			// Convert daf format for daf-supplier (remove 'a' or 'b')
			const dafNumber = daf.replace(/[ab]$/, '');
			
			// Fetch from daf-supplier
			const url = `https://daf-supplier.402.workers.dev/?mesechta=${selectedTractate.mesechta}&daf=${dafNumber}`;
			console.log('Fetching:', url);
			
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			const data = await response.json();
			console.log('Raw data:', data);
			console.log('Main text sample:', data.mainText?.substring(0, 200));
			console.log('Has <br> tags:', data.mainText?.includes('<br>'));
			
			// Clean up existing renderer
			if (rendererInstance) {
				// Renderer doesn't have a cleanup method, just clear the reference
				rendererInstance = null;
			}
			
			// Clear container
			if (container) {
				container.innerHTML = '';
			}
			
			// Make sure container exists
			if (!container) {
				throw new Error('Container element not found');
			}
			
			// Initialize renderer with test options (expects strings for numbers)
			const options = {
				contentWidth: '600',
				lineBreaks: forceLineBreaks,
				useLineAnalysis: useLineAnalysis,
				useAreaCalculation: useAreaCalculation,
				fontSize: {
					main: '16',
					side: '12'
				},
				lineHeight: {
					main: '22',
					side: '16'
				},
				fontFamily: {
					main: 'Frank Ruhl Libre',
					inner: 'Noto Rashi Hebrew',
					outer: 'Noto Rashi Hebrew'
				},
				padding: {
					vertical: '10',
					horizontal: '10'
				},
				halfway: '50',
				mainWidth: '50'
			};
			
			// Create a wrapper div for the renderer
			const wrapperDiv = document.createElement('div');
			wrapperDiv.id = 'daf-wrapper';
			container.appendChild(wrapperDiv);
			
			// Call the renderer function directly
			rendererInstance = createDafRenderer(wrapperDiv, options);
			
			// The render method doesn't return a value, it updates the renderer instance
			rendererInstance.render(
				data.mainText || '',
				data.rashi || '',
				data.tosafot || '',
				data.amud || 'a',
				forceLineBreaks ? 'br' : false
			);
			
			// Extract spacer calculation results from the renderer instance
			spacerResults = {
				spacerHeights: rendererInstance.spacerHeights,
				options: options,
				data: data
			};
			
			console.log('Spacer calculation results:', spacerResults);
			
			// Debug: Check if CSS variables are set
			setTimeout(() => {
				const rootEl = document.querySelector('.dafRoot');
				if (rootEl) {
					const computedStyle = getComputedStyle(rootEl);
					console.log('CSS Variables applied:');
					console.log('--spacerHeights-start:', computedStyle.getPropertyValue('--spacerHeights-start'));
					console.log('--spacerHeights-inner:', computedStyle.getPropertyValue('--spacerHeights-inner'));
					console.log('--spacerHeights-outer:', computedStyle.getPropertyValue('--spacerHeights-outer'));
					console.log('--spacerHeights-end:', computedStyle.getPropertyValue('--spacerHeights-end'));
					
					// Check actual spacer elements
					const spacers = rootEl.querySelectorAll('.spacer');
					spacers.forEach(spacer => {
						const height = getComputedStyle(spacer).height;
						const classes = Array.from(spacer.classList).join(' ');
						console.log(`Spacer (${classes}): ${height}`);
					});
				}
			}, 100);
			
		} catch (err) {
			console.error('Error:', err);
			error = err.message;
		} finally {
			loading = false;
		}
	}
	
	onMount(() => {
		// Wait a tick to ensure container is ready
		setTimeout(() => {
			if (container) {
				fetchAndAnalyze();
			}
		}, 0);
		
		return () => {
			// Cleanup on unmount
			rendererInstance = null;
		};
	});
</script>

<div class="container mx-auto p-4 max-w-7xl">
	<h1 class="text-2xl font-bold mb-4">Spacer Calculation Analysis</h1>
	
	<!-- Controls -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Tractate</label>
				<select 
					bind:value={tractate}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					{#each tractates as t}
						<option value={t.value}>{t.value}</option>
					{/each}
				</select>
			</div>
			
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Daf</label>
				<input 
					type="text"
					bind:value={daf}
					placeholder="e.g., 2a, 3b"
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<div class="space-y-2">
				<label class="flex items-center">
					<input type="checkbox" bind:checked={useLineAnalysis} class="mr-2" />
					<span class="text-sm">Use Line Analysis</span>
				</label>
				<label class="flex items-center">
					<input type="checkbox" bind:checked={useAreaCalculation} class="mr-2" />
					<span class="text-sm">Use Area Calculation</span>
				</label>
				<label class="flex items-center">
					<input type="checkbox" bind:checked={forceLineBreaks} class="mr-2" />
					<span class="text-sm">Force Line Breaks</span>
				</label>
			</div>
			
			<div class="flex items-end">
				<button 
					on:click={fetchAndAnalyze}
					disabled={loading}
					class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{loading ? 'Loading...' : 'Analyze'}
				</button>
			</div>
		</div>
	</div>
	
	<!-- Error Message -->
	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
			{error}
		</div>
	{/if}
	
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Renderer Container -->
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
			<h2 class="text-lg font-semibold mb-3">Rendered Page</h2>
			<div bind:this={container} class="daf-container" style="width: 600px; margin: 0 auto;"></div>
		</div>
		
		<!-- Spacer Analysis -->
		{#if spacerResults}
			<div class="space-y-4">
				<!-- Spacer Heights -->
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<h2 class="text-lg font-semibold mb-3">Calculated Spacer Heights</h2>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="font-medium">Start (Top):</span>
							<span class="font-mono">{(spacerResults.spacerHeights.start || 0).toFixed(2)}px</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Inner (Rashi):</span>
							<span class="font-mono">{(spacerResults.spacerHeights.inner || 0).toFixed(2)}px</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Outer (Tosafot):</span>
							<span class="font-mono">{(spacerResults.spacerHeights.outer || 0).toFixed(2)}px</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">End (Bottom):</span>
							<span class="font-mono">{(spacerResults.spacerHeights.end || 0).toFixed(2)}px</span>
						</div>
						{#if spacerResults.spacerHeights.exception}
							<div class="flex justify-between text-orange-600">
								<span class="font-medium">Exception:</span>
								<span>{spacerResults.spacerHeights.exception}</span>
							</div>
						{/if}
						{#if spacerResults.spacerHeights.calculationMethod}
							<div class="flex justify-between text-blue-600">
								<span class="font-medium">Method:</span>
								<span>{spacerResults.spacerHeights.calculationMethod}</span>
							</div>
						{/if}
						{#if spacerResults.spacerHeights.error}
							<div class="flex justify-between text-red-600">
								<span class="font-medium">Error:</span>
								<span>{spacerResults.spacerHeights.error}</span>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Layout Pattern -->
				{#if spacerResults.spacerHeights.layoutPattern}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">Detected Layout Pattern</h2>
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span class="font-medium">Type:</span>
								<span class="font-mono">{spacerResults.spacerHeights.layoutPattern.type}</span>
							</div>
							<div class="flex justify-between">
								<span class="font-medium">Confidence:</span>
								<span>{(spacerResults.spacerHeights.layoutPattern.confidence * 100).toFixed(0)}%</span>
							</div>
							{#if spacerResults.spacerHeights.layoutPattern.details}
								<div class="mt-2 p-2 bg-gray-50 rounded">
									<pre class="text-xs">{JSON.stringify(spacerResults.spacerHeights.layoutPattern.details, null, 2)}</pre>
								</div>
							{/if}
						</div>
					</div>
				{/if}
				
				<!-- Line Analysis Summary -->
				{#if spacerResults.spacerHeights.lineAnalysis}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">Line Analysis Summary</h2>
						<div class="space-y-3">
							{#each ['main', 'rashi', 'tosafot'] as textType}
								{@const analysis = spacerResults.spacerHeights.lineAnalysis[textType]}
								<div class="border-b pb-2 last:border-0">
									<h3 class="font-medium capitalize">{textType}</h3>
									<div class="grid grid-cols-2 gap-2 text-sm mt-1">
										<div>Lines: {analysis.stats.totalLines}</div>
										<div>Blocks: {analysis.blocks.length}</div>
										<div>Height: {analysis.stats.totalHeight?.toFixed(1)}px</div>
										<div>Avg Length: {analysis.stats.averageLength?.toFixed(1)}</div>
									</div>
									<div class="mt-1 text-xs">
										Categories: 
										{#each Object.entries(analysis.lengthCategories) as [cat, data]}
											<span class="inline-block mr-2">{cat}: {data.count}</span>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				
				<!-- Debug Data -->
				<details class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<summary class="cursor-pointer font-semibold">Full Spacer Data</summary>
					<pre class="mt-4 p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-lg">{JSON.stringify(spacerResults.spacerHeights, null, 2)}</pre>
				</details>
			</div>
		{/if}
	</div>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&display=swap');
	@import url('https://fonts.googleapis.com/css2?family=Noto+Rashi+Hebrew&display=swap');
	
	:global(.daf-container) {
		min-height: 400px;
	}
	
	:global(.daf-container .main-text) {
		font-family: 'Frank Ruhl Libre', serif;
	}
	
	:global(.daf-container .commentary-text) {
		font-family: 'Noto Rashi Hebrew', serif;
	}
	
	/* Debug styles to visualize spacers */
	:global(.dafRoot .spacer) {
		background-color: rgba(255, 0, 0, 0.1);
		border: 1px dashed red;
		box-sizing: border-box;
	}
	
	:global(.dafRoot .spacer.start) {
		background-color: rgba(0, 255, 0, 0.1);
		border-color: green;
	}
	
	:global(.dafRoot .spacer.innerMid) {
		background-color: rgba(0, 0, 255, 0.1);
		border-color: blue;
	}
	
	:global(.dafRoot .spacer.outerMid) {
		background-color: rgba(255, 255, 0, 0.1);
		border-color: orange;
	}
	
	:global(.dafRoot .spacer.end) {
		background-color: rgba(255, 0, 255, 0.1);
		border-color: purple;
	}
</style>