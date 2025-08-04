<script>
	import { onMount } from 'svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	import { defaultOptions } from '$lib/daf-renderer/options.js';
	import { calculateSpacersFromMeasurements } from '$lib/daf-renderer/measure-and-fit.js';
	
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
	let showDebugOverlay = true;
	let useMeasurementBasedCalculation = false; // New option for measurement-based approach
	
	// Layout configuration options
	let contentWidth = 600; // px
	let mainWidthPercent = 50; // %
	let sideWidthAdjustment = 0; // px adjustment to side column widths
	
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
			
			// Use default options as base, with configurable layout parameters
			const options = {
				...defaultOptions,
				// Configurable layout options
				contentWidth: `${contentWidth}px`,
				mainWidth: `${mainWidthPercent}%`,
				// Custom options for testing enhanced spacer calculation
				...(forceLineBreaks ? {
					lineBreaks: true,
					useLineAnalysis: useLineAnalysis,
					useAreaCalculation: useAreaCalculation
				} : {})
			};
			
			// Create a wrapper div for the renderer
			const wrapperDiv = document.createElement('div');
			wrapperDiv.id = 'daf-wrapper';
			container.appendChild(wrapperDiv);
			
			// Call the renderer function directly
			rendererInstance = createDafRenderer(wrapperDiv, options);
			
			// Prepare text for line break mode if needed
			let mainText = data.mainText || '';
			let rashiText = data.rashi || '';
			let tosafotText = data.tosafot || '';
			
			// If forcing line breaks but text doesn't have <br> tags, simulate them
			if (forceLineBreaks && !mainText.includes('<br>')) {
				console.log('📝 Simulating line breaks for testing');
				
				// Strip HTML tags first
				const stripHtml = (html) => {
					// Create a temporary div to parse HTML
					const temp = document.createElement('div');
					temp.innerHTML = html;
					// Get text content which strips all HTML
					return temp.textContent || temp.innerText || '';
				};
				
				// Split text into chunks to simulate line breaks
				const addLineBreaks = (text, isCommentary = false) => {
					if (!text) return '';
					// First strip all HTML
					const plainText = stripHtml(text);
					
					// Different line lengths for main vs commentary
					const maxLineLength = isCommentary ? 50 : 80; // Commentary lines are narrower
					const breakAtPeriod = isCommentary ? 30 : 40;
					
					const chunks = [];
					let currentChunk = '';
					const words = plainText.split(' ');
					
					for (const word of words) {
						// Check if adding this word would exceed the line length
						if (currentChunk.length > 0 && 
						    currentChunk.length + word.length + 1 > maxLineLength) {
							// Line would be too long, start a new line
							chunks.push(currentChunk.trim());
							currentChunk = word + ' ';
						} else {
							currentChunk += word + ' ';
							// Break at periods if line is long enough
							if (word.endsWith('.') && currentChunk.length > breakAtPeriod) {
								chunks.push(currentChunk.trim());
								currentChunk = '';
							}
						}
					}
					if (currentChunk) chunks.push(currentChunk.trim());
					
					return chunks.join('<br>');
				};
				
				mainText = addLineBreaks(mainText, false);
				rashiText = addLineBreaks(rashiText, true);
				tosafotText = addLineBreaks(tosafotText, true);
				
				console.log('📝 Line break simulation complete:', {
					mainLines: mainText.split('<br>').length,
					rashiLines: rashiText.split('<br>').length,
					tosafotLines: tosafotText.split('<br>').length
				});
			}
			
			// If using measurement-based calculation, do it before rendering
			let measurementResults = null;
			if (forceLineBreaks && useMeasurementBasedCalculation) {
				console.log('📏 Using measurement-based calculation...');
				
				// Create a temporary dummy element for measurements
				const measureDummy = document.createElement('div');
				measureDummy.style.position = 'absolute';
				measureDummy.style.visibility = 'hidden';
				document.body.appendChild(measureDummy);
				
				// Calculate spacers based on measurements
				measurementResults = calculateSpacersFromMeasurements(
					mainText,
					rashiText,
					tosafotText,
					options,
					measureDummy
				);
				
				// Clean up
				measureDummy.remove();
				
				console.log('📊 Measurement results:', measurementResults);
				
				// Use the fixed text if lines were modified
				if (measurementResults.texts.inner !== rashiText || 
				    measurementResults.texts.outer !== tosafotText) {
					console.log('📝 Text was modified to fit properly');
					rashiText = measurementResults.texts.inner;
					tosafotText = measurementResults.texts.outer;
				}
			}
			
			// The render method doesn't return a value, it updates the renderer instance
			rendererInstance.render(
				mainText,
				rashiText,
				tosafotText,
				data.amud || 'a',
				forceLineBreaks ? 'br' : false
			);
			
			// Extract spacer calculation results from the renderer instance
			spacerResults = {
				spacerHeights: rendererInstance.spacerHeights,
				options: options,
				data: data,
				forceLineBreaks: forceLineBreaks,
				measurementResults: measurementResults
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
					
					// Check DOM structure
					console.log('DOM Structure:');
					const containers = {
						main: rootEl.querySelector('.main'),
						inner: rootEl.querySelector('.inner'),
						outer: rootEl.querySelector('.outer')
					};
					
					Object.entries(containers).forEach(([name, container]) => {
						if (container) {
							const children = Array.from(container.children);
							console.log(`${name} container children:`, children.map(child => ({
								tag: child.tagName,
								classes: child.className,
								height: getComputedStyle(child).height
							})));
						}
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

<div class="container mx-auto p-4 max-w-9xl">
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
				<label class="flex items-center">
					<input type="checkbox" bind:checked={useMeasurementBasedCalculation} class="mr-2" disabled={!forceLineBreaks} />
					<span class="text-sm {!forceLineBreaks ? 'text-gray-400' : ''}">Use Measurement-Based Calculation</span>
				</label>
				<label class="flex items-center">
					<input type="checkbox" bind:checked={showDebugOverlay} class="mr-2" />
					<span class="text-sm">Show Debug Overlay</span>
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
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-hidden">
			<h2 class="text-lg font-semibold mb-3">Rendered Page</h2>
			<div class="overflow-x-auto overflow-y-hidden">
				<div bind:this={container} class="daf-container {showDebugOverlay ? 'debug-overlay' : ''}" style="width: 800px; margin: 0 auto; max-width: 100%;"></div>
			</div>
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
						{#if spacerResults.forceLineBreaks}
							<div class="flex justify-between text-purple-600">
								<span class="font-medium">Mode:</span>
								<span>Line Break Mode</span>
							</div>
						{:else}
							<div class="flex justify-between text-green-600">
								<span class="font-medium">Mode:</span>
								<span>Standard Mode</span>
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
								{#if analysis}
									<div class="border-b pb-2 last:border-0">
										<h3 class="font-medium capitalize">{textType}</h3>
										<div class="grid grid-cols-2 gap-2 text-sm mt-1">
											<div>Lines: {analysis.stats?.totalLines || 0}</div>
											<div>Blocks: {analysis.blocks?.length || 0}</div>
											<div>Height: {(analysis.stats?.totalHeight || 0).toFixed(1)}px</div>
											<div>Avg Length: {(analysis.stats?.averageLength || 0).toFixed(1)}</div>
										</div>
										{#if analysis.lengthCategories}
											<div class="mt-1 text-xs">
												Categories: 
												{#each Object.entries(analysis.lengthCategories) as [cat, data]}
													<span class="inline-block mr-2">{cat}: {data.count}</span>
												{/each}
											</div>
										{/if}
										{#if analysis.blocks && analysis.blocks.length > 0}
											<details class="mt-2">
												<summary class="cursor-pointer text-xs text-gray-600">Block Details</summary>
												<div class="mt-1 space-y-1">
													{#each analysis.blocks as block, i}
														<div class="text-xs bg-gray-50 p-1 rounded">
															Block {i + 1}: {block.category} ({block.lines.length} lines, {block.totalHeight.toFixed(1)}px)
														</div>
													{/each}
												</div>
											</details>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
				
				<!-- Debug Data -->
				<details class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<summary class="cursor-pointer font-semibold">Full Spacer Data</summary>
					<pre class="mt-4 p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-lg">{JSON.stringify(spacerResults.spacerHeights, null, 2)}</pre>
				</details>
				
				<!-- Layout Fix Suggestions -->
				{#if spacerResults.measurementResults?.layoutAnalysis}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">🔧 Layout Fix Suggestions</h2>
						
						<!-- Problem Summary -->
						<div class="mb-4 p-3 {spacerResults.measurementResults.layoutAnalysis.needsFix ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'} rounded">
							<div class="flex items-center mb-2">
								<span class="text-lg {spacerResults.measurementResults.layoutAnalysis.needsFix ? 'text-red-600' : 'text-green-600'}">
									{spacerResults.measurementResults.layoutAnalysis.needsFix ? '⚠️' : '✅'}
								</span>
								<h3 class="ml-2 font-medium {spacerResults.measurementResults.layoutAnalysis.needsFix ? 'text-red-800' : 'text-green-800'}">
									{spacerResults.measurementResults.layoutAnalysis.message}
								</h3>
							</div>
							
							<!-- Line Count Summary -->
							<div class="grid grid-cols-3 gap-4 text-xs">
								<div class="text-center">
									<div class="font-medium">Main Text</div>
									<div class="text-gray-600">{spacerResults.measurementResults.layoutAnalysis.originalCounts.main} → {spacerResults.measurementResults.layoutAnalysis.renderedCounts.main}</div>
									<div class="text-red-600 font-medium">{spacerResults.measurementResults.layoutAnalysis.overflowRatios.main.toFixed(1)}x</div>
								</div>
								<div class="text-center">
									<div class="font-medium">Inner (Rashi)</div>
									<div class="text-gray-600">{spacerResults.measurementResults.layoutAnalysis.originalCounts.inner} → {spacerResults.measurementResults.layoutAnalysis.renderedCounts.inner}</div>
									<div class="text-red-600 font-medium">{spacerResults.measurementResults.layoutAnalysis.overflowRatios.inner.toFixed(1)}x</div>
								</div>
								<div class="text-center">
									<div class="font-medium">Outer (Tosafot)</div>
									<div class="text-gray-600">{spacerResults.measurementResults.layoutAnalysis.originalCounts.outer} → {spacerResults.measurementResults.layoutAnalysis.renderedCounts.outer}</div>
									<div class="text-red-600 font-medium">{spacerResults.measurementResults.layoutAnalysis.overflowRatios.outer.toFixed(1)}x</div>
								</div>
							</div>
						</div>
						
						<!-- Fix Suggestions -->
						{#if spacerResults.measurementResults.layoutAnalysis.needsFix && spacerResults.measurementResults.layoutAnalysis.suggestions}
							<div class="mb-4">
								<h3 class="font-medium mb-3">Recommended Fixes (Click to Apply)</h3>
								<div class="space-y-3">
									{#each spacerResults.measurementResults.layoutAnalysis.suggestions as suggestion, i}
										<div class="p-3 border rounded {suggestion.effectiveness === 'high' ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}">
											<div class="flex items-center justify-between mb-2">
												<h4 class="font-medium text-sm">{suggestion.name}</h4>
												<span class="text-xs px-2 py-1 rounded {suggestion.effectiveness === 'high' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}">
													{suggestion.effectiveness} effectiveness
												</span>
											</div>
											<p class="text-xs text-gray-600 mb-2">{suggestion.description}</p>
											<button 
												on:click={() => {
													contentWidth = suggestion.contentWidth;
													mainWidthPercent = suggestion.mainWidthPercent;
													fetchAndAnalyze();
												}}
												class="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
											>
												Apply This Fix
											</button>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						
						<!-- Current Settings vs Suggested -->
						<div class="grid grid-cols-2 gap-4 text-xs">
							<div class="bg-gray-50 p-3 rounded">
								<h4 class="font-medium text-gray-800">Current Settings</h4>
								<div class="mt-1 space-y-1">
									<div>Content Width: {contentWidth}px</div>
									<div>Main Text Width: {mainWidthPercent}%</div>
									<div>Commentary Width: {((100 - mainWidthPercent) / 2).toFixed(1)}% each</div>
								</div>
							</div>
							{#if spacerResults.measurementResults.layoutAnalysis.suggestions?.[0]}
								<div class="bg-blue-50 p-3 rounded">
									<h4 class="font-medium text-blue-800">Best Suggestion</h4>
									<div class="mt-1 space-y-1">
										<div>Content Width: {spacerResults.measurementResults.layoutAnalysis.suggestions[0].contentWidth}px</div>
										<div>Main Text Width: {spacerResults.measurementResults.layoutAnalysis.suggestions[0].mainWidthPercent}%</div>
										<div>Commentary Width: {((100 - spacerResults.measurementResults.layoutAnalysis.suggestions[0].mainWidthPercent) / 2).toFixed(1)}% each</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Measurement Results -->
				{#if spacerResults.measurementResults}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">Line Count Analysis</h2>
						
						<!-- Line Count Comparison Table -->
						{#if spacerResults.measurementResults.lineCounts}
							<div class="mb-4">
								<h3 class="font-medium mb-2">Original vs Rendered Line Counts</h3>
								<div class="overflow-x-auto">
									<table class="w-full text-xs border-collapse border border-gray-300">
										<thead>
											<tr class="bg-gray-100">
												<th class="border border-gray-300 p-2 text-left">Section</th>
												<th class="border border-gray-300 p-2 text-center">Original<br>(from &lt;br&gt; tags)</th>
												<th class="border border-gray-300 p-2 text-center">Rendered<br>(actual DOM)</th>
												<th class="border border-gray-300 p-2 text-center">Difference</th>
											</tr>
										</thead>
										<tbody>
											<tr>
												<td class="border border-gray-300 p-2 font-medium">Main</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.original?.main || 0}</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.rendered?.main || 0}</td>
												<td class="border border-gray-300 p-2 text-center {(spacerResults.measurementResults.lineCounts?.rendered?.main || 0) - (spacerResults.measurementResults.lineCounts?.original?.main || 0) !== 0 ? 'text-red-600 font-medium' : 'text-gray-500'}">
													{(spacerResults.measurementResults.lineCounts?.rendered?.main || 0) - (spacerResults.measurementResults.lineCounts?.original?.main || 0) > 0 ? '+' : ''}{(spacerResults.measurementResults.lineCounts?.rendered?.main || 0) - (spacerResults.measurementResults.lineCounts?.original?.main || 0)}
												</td>
											</tr>
											<tr>
												<td class="border border-gray-300 p-2 font-medium">Inner (Rashi)</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.original?.inner || 0}</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.rendered?.inner || 0}</td>
												<td class="border border-gray-300 p-2 text-center {(spacerResults.measurementResults.lineCounts?.rendered?.inner || 0) - (spacerResults.measurementResults.lineCounts?.original?.inner || 0) !== 0 ? 'text-red-600 font-medium' : 'text-gray-500'}">
													{(spacerResults.measurementResults.lineCounts?.rendered?.inner || 0) - (spacerResults.measurementResults.lineCounts?.original?.inner || 0) > 0 ? '+' : ''}{(spacerResults.measurementResults.lineCounts?.rendered?.inner || 0) - (spacerResults.measurementResults.lineCounts?.original?.inner || 0)}
												</td>
											</tr>
											<tr>
												<td class="border border-gray-300 p-2 font-medium">Outer (Tosafot)</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.original?.outer || 0}</td>
												<td class="border border-gray-300 p-2 text-center">{spacerResults.measurementResults.lineCounts?.rendered?.outer || 0}</td>
												<td class="border border-gray-300 p-2 text-center {(spacerResults.measurementResults.lineCounts?.rendered?.outer || 0) - (spacerResults.measurementResults.lineCounts?.original?.outer || 0) !== 0 ? 'text-red-600 font-medium' : 'text-gray-500'}">
													{(spacerResults.measurementResults.lineCounts?.rendered?.outer || 0) - (spacerResults.measurementResults.lineCounts?.original?.outer || 0) > 0 ? '+' : ''}{(spacerResults.measurementResults.lineCounts?.rendered?.outer || 0) - (spacerResults.measurementResults.lineCounts?.original?.outer || 0)}
												</td>
											</tr>
										</tbody>
									</table>
								</div>
							</div>
							
							<!-- Spacer Logic Comparison -->
							{#if spacerResults.measurementResults.lineCounts?.originalLogic}
								<div class="mb-4">
									<h3 class="font-medium mb-2">Spacer Logic Comparison</h3>
									<div class="grid grid-cols-2 gap-4 text-xs">
										<div class="bg-blue-50 p-3 rounded">
											<h4 class="font-medium text-blue-800">Original Logic</h4>
											<div class="mt-1 space-y-1">
												<div>Start: {spacerResults.measurementResults.lineCounts.originalLogic?.start || 0} lines</div>
												<div>Inner: {spacerResults.measurementResults.lineCounts.originalLogic?.inner || 0} lines</div>
												<div>Outer: {spacerResults.measurementResults.lineCounts.originalLogic?.outer || 0} lines</div>
											</div>
										</div>
										<div class="bg-green-50 p-3 rounded">
											<h4 class="font-medium text-green-800">Rendered Logic (Used)</h4>
											<div class="mt-1 space-y-1">
												<div>Start: {spacerResults.measurementResults.lineCounts.renderedLogic?.start || 0} lines</div>
												<div>Inner: {spacerResults.measurementResults.lineCounts.renderedLogic?.inner || 0} lines</div>
												<div>Outer: {spacerResults.measurementResults.lineCounts.renderedLogic?.outer || 0} lines</div>
											</div>
										</div>
									</div>
								</div>
							{/if}
						{/if}

						<!-- Summary Stats -->
						<div class="grid grid-cols-2 gap-4 text-sm mb-4">
							<div class="text-center">
								<div class="text-lg font-semibold text-red-600">
									{(spacerResults.measurementResults.measurements?.inner?.problematicLines?.length || 0) + (spacerResults.measurementResults.measurements?.outer?.problematicLines?.length || 0)}
								</div>
								<div class="text-xs text-gray-600">Overflow Lines</div>
								<div class="text-xs text-gray-500 mt-1">
									Inner: {spacerResults.measurementResults.measurements?.inner?.problematicLines?.length || 0} | 
									Outer: {spacerResults.measurementResults.measurements?.outer?.problematicLines?.length || 0}
								</div>
							</div>
							<div class="text-center">
								<div class="text-lg font-semibold text-purple-600">
									{(spacerResults.measurementResults.spacerHeights?.start || 0).toFixed(0)}px
								</div>
								<div class="text-xs text-gray-600">Start Height</div>
								<div class="text-xs text-gray-500 mt-1">
									Inner: {(spacerResults.measurementResults.spacerHeights?.inner || 0).toFixed(0)}px | 
									Outer: {(spacerResults.measurementResults.spacerHeights?.outer || 0).toFixed(0)}px
								</div>
							</div>
						</div>

						<!-- Line Categories -->
						{#if spacerResults.measurementResults.lineAnalysis}
							<div class="grid grid-cols-3 gap-4 text-xs">
								<div>
									<h4 class="font-medium mb-1">Main ({spacerResults.measurementResults.lineAnalysis.main?.totalLines || 0})</h4>
									{#each Object.entries(spacerResults.measurementResults.lineAnalysis.main?.categories || {}) as [category, lineIndices]}
										{#if lineIndices.length > 0}
											<div class="text-gray-600">{category}: {lineIndices.length}</div>
										{/if}
									{/each}
								</div>
								<div>
									<h4 class="font-medium mb-1">Inner ({spacerResults.measurementResults.lineAnalysis.inner?.totalLines || 0})</h4>
									{#each Object.entries(spacerResults.measurementResults.lineAnalysis.inner?.categories || {}) as [category, lineIndices]}
										{#if lineIndices.length > 0}
											<div class="text-gray-600">{category}: {lineIndices.length}</div>
										{/if}
									{/each}
								</div>
								<div>
									<h4 class="font-medium mb-1">Outer ({spacerResults.measurementResults.lineAnalysis.outer?.totalLines || 0})</h4>
									{#each Object.entries(spacerResults.measurementResults.lineAnalysis.outer?.categories || {}) as [category, lineIndices]}
										{#if lineIndices.length > 0}
											<div class="text-gray-600">{category}: {lineIndices.length}</div>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
						
						{#if spacerResults.measurementResults.measurements?.inner?.problematicLines?.length > 0}
							<details class="mt-4">
								<summary class="cursor-pointer text-sm font-medium text-red-600">Inner Overflow Lines</summary>
								<div class="mt-2 space-y-1 text-xs">
									{#each spacerResults.measurementResults.measurements.inner.problematicLines as line}
										<div class="bg-red-50 p-2 rounded">
											Line {line.index + 1}: {line.text.substring(0, 80)}... 
											(Natural: {line.naturalWidth}px, Fits: {line.fitsInWidth ? 'Yes' : 'No'})
										</div>
									{/each}
								</div>
							</details>
						{/if}
						
						{#if spacerResults.measurementResults.measurements?.outer?.problematicLines?.length > 0}
							<details class="mt-4">
								<summary class="cursor-pointer text-sm font-medium text-red-600">Outer Overflow Lines</summary>
								<div class="mt-2 space-y-1 text-xs">
									{#each spacerResults.measurementResults.measurements.outer.problematicLines as line}
										<div class="bg-red-50 p-2 rounded">
											Line {line.index + 1}: {line.text.substring(0, 80)}... 
											(Natural: {line.naturalWidth}px, Fits: {line.fitsInWidth ? 'Yes' : 'No'})
										</div>
									{/each}
								</div>
							</details>
						{/if}
					</div>
				{/if}
				
				<!-- Raw Text Preview (Line Break Mode) -->
				{#if spacerResults.forceLineBreaks}
					<details class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<summary class="cursor-pointer font-semibold">Line Break Text Preview</summary>
						<div class="mt-4 space-y-4 text-xs">
							<div>
								<h4 class="font-medium mb-1">Main Text Lines:</h4>
								<div class="bg-gray-50 p-2 rounded space-y-1">
									{#each (spacerResults.data.mainText || '').split('<br>').slice(0, 5) as line, i}
										<div class="border-b border-gray-200 pb-1">Line {i + 1}: {line.substring(0, 100)}{line.length > 100 ? '...' : ''}</div>
									{/each}
								</div>
							</div>
						</div>
					</details>
				{/if}
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
	:global(.debug-overlay .spacer) {
		background-color: rgba(255, 0, 0, 0.1);
		border: 1px dashed red;
		box-sizing: border-box;
	}
	
	:global(.debug-overlay .spacer.start) {
		background-color: rgba(0, 255, 0, 0.1);
		border-color: green;
	}
	
	:global(.debug-overlay .spacer.innerMid) {
		background-color: rgba(0, 0, 255, 0.1);
		border-color: blue;
	}
	
	:global(.debug-overlay .spacer.outerMid) {
		background-color: rgba(255, 255, 0, 0.1);
		border-color: orange;
	}
	
	:global(.debug-overlay .spacer.end) {
		background-color: rgba(255, 0, 255, 0.1);
		border-color: purple;
	}
</style>