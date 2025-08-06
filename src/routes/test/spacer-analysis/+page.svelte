<script>
	import { onMount } from 'svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	import { defaultOptions } from '$lib/daf-renderer/options.js';
	import { SliderInput, SelectInput, TextInput } from '$lib/components';
	
	let tractate = 'Berakhot';
	let daf = '2';
	let loading = false;
	let error = null;
	let spacerResults = null;
	let rendererInstance = null;
	let container;
	let forceRefresh = false; // Add state for cache bypass
	
	// Test options
	let forceLineBreaks = true; // Default to true to show line break mode
	let showDebugOverlay = true;
	let showWbrMarkers = true; // Show <wbr> visual indicators
	
	// Editable options that correspond to defaultOptions
	let editableOptions = {
		contentWidth: "600px",
		mainWidth: "50%",
		padding: {
			vertical: "10px",
			horizontal: "16px",
		},
		innerPadding: "4px",
		outerPadding: "4px",
		halfway: "50%",
		fontFamily: {
			inner: "Rashi",
			outer: "Rashi",
			main: "Vilna"
		},
		direction: "rtl",
		fontSize: {
			main: "15px",
			side: "10.5px"
		},
		lineHeight: {
			main: "17px",
			side: "14px",
		}
	};
	
	// Debounce timer for option changes
	let updateTimeout;
	
	// Function to handle option changes with debouncing
	function handleOptionChange() {
		// Only trigger if we have initial data
		if (!spacerResults) return;
		
		// Clear existing timeout
		if (updateTimeout) {
			clearTimeout(updateTimeout);
		}
		
		// Debounce the re-render
		updateTimeout = setTimeout(() => {
			fetchAndAnalyze();
		}, 300);
	}
	
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
	
	// Helper function to convert daf format to daf-supplier format
	function convertDafToSupplierFormat(dafStr) {
		// Parse the daf string (e.g., "2a" or "2b" or just "2")
		const pageNum = parseInt(dafStr.replace(/[ab]/, ''));
		const amud = dafStr.includes('b') ? 'b' : 'a';
		
		// daf-supplier numbering: 2a=2, 2b=3, 3a=4, 3b=5, etc.
		// Formula: for page N amud a: (N-1)*2 + 2
		//          for page N amud b: (N-1)*2 + 3
		const dafSupplierNum = (pageNum - 1) * 2 + (amud === 'a' ? 2 : 3);
		return dafSupplierNum.toString();
	}
	
	async function fetchAndAnalyze(bypassCache = false) {
		loading = true;
		error = null;
		spacerResults = null;
		
		try {
			// Get mesechta ID
			const selectedTractate = tractates.find(t => t.value === tractate);
			if (!selectedTractate) {
				throw new Error('Invalid tractate selected');
			}
			
			// Convert daf format for daf-supplier
			const convertedDaf = convertDafToSupplierFormat(daf);
			
			// Fetch from daf-supplier with br parameter based on forceLineBreaks setting, add nocache if bypassing
			const url = `/api/daf-supplier?mesechta=${selectedTractate.mesechta}&daf=${convertedDaf}${forceLineBreaks ? '&br=true' : ''}${bypassCache ? '&nocache=true' : ''}`;
			console.log('Fetching:', url);
			console.log(`Converted ${daf} to daf-supplier format: ${convertedDaf}, forceLineBreaks: ${forceLineBreaks}, bypassCache: ${bypassCache}`);
			
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
			
			// Use editable options instead of defaults
			const options = {
				...defaultOptions,
				...editableOptions
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
			
			// Measurement-based calculation is disabled for now
			let measurementResults = null;
			
			// The render method doesn't return a value, it updates the renderer instance
			console.log('🔧 Rendering with parameters:', {
				forceLineBreaks,
				linebreakParam: forceLineBreaks ? 'br' : false,
				mainTextSample: mainText.substring(0, 100),
				rashiTextSample: rashiText.substring(0, 100),
				mainHasBr: mainText.includes('<br>'),
				rashiHasBr: rashiText.includes('<br>')
			});
			
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
	
	<!-- Basic Controls -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
		<div class="flex flex-wrap items-end gap-4">
			<!-- Input Controls -->
			<div class="flex gap-3 flex-1">
				<div class="min-w-[180px]">
					<label class="block text-xs font-medium text-gray-600 mb-1">Tractate</label>
					<select 
						bind:value={tractate}
						class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						{#each tractates as t}
							<option value={t.value}>{t.value}</option>
						{/each}
					</select>
				</div>
				
				<div class="w-24">
					<label class="block text-xs font-medium text-gray-600 mb-1">Daf</label>
					<input 
						type="text"
						bind:value={daf}
						placeholder="2a"
						class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
			</div>
			
			<!-- Checkboxes -->
			<div class="flex gap-4 items-center">
				<label class="flex items-center cursor-pointer">
					<input type="checkbox" bind:checked={forceLineBreaks} class="mr-1.5 text-blue-600 rounded focus:ring-1 focus:ring-blue-500" />
					<span class="text-sm text-gray-700">Force Line Breaks</span>
				</label>
				<label class="flex items-center cursor-pointer">
					<input type="checkbox" bind:checked={showDebugOverlay} class="mr-1.5 text-blue-600 rounded focus:ring-1 focus:ring-blue-500" />
					<span class="text-sm text-gray-700">Show Debug Overlay</span>
				</label>
				{#if forceLineBreaks}
					<label class="flex items-center cursor-pointer">
						<input type="checkbox" bind:checked={showWbrMarkers} on:change={handleOptionChange} class="mr-1.5 text-blue-600 rounded focus:ring-1 focus:ring-blue-500" />
						<span class="text-sm text-gray-700">Show &lt;wbr&gt; Markers (red lines)</span>
					</label>
				{/if}
			</div>
			
			<!-- Buttons -->
			<div class="flex gap-2 ml-auto">
				<button 
					on:click={() => fetchAndAnalyze()}
					disabled={loading}
					class="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{loading ? 'Loading...' : 'Analyze'}
				</button>
				
				<button 
					on:click={() => fetchAndAnalyze(true)}
					disabled={loading}
					class="px-3 py-1.5 text-sm border border-orange-300 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					title="Bypass cache and force fresh fetch from HebrewBooks"
				>
					{loading ? 'Refreshing...' : 'Force Refresh'}
				</button>
			</div>
		</div>
	</div>

	<!-- Editable Options -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
		<h2 class="text-lg font-semibold mb-3">Renderer Options (defaultOptions)</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<!-- Layout Options -->
			<div class="space-y-4">
				<h3 class="font-medium text-gray-700 border-b pb-1">Layout</h3>
				<SliderInput 
					label="Content Width" 
					bind:value={editableOptions.contentWidth}
					min={400} 
					max={1200} 
					step={10}
					unit="px"
					on:input={handleOptionChange}
				/>
				<SliderInput 
					label="Main Width" 
					bind:value={editableOptions.mainWidth}
					min={30} 
					max={70} 
					step={1}
					unit="%"
					on:input={handleOptionChange}
				/>
				<SliderInput 
					label="Halfway Point" 
					bind:value={editableOptions.halfway}
					min={30} 
					max={70} 
					step={1}
					unit="%"
					on:input={handleOptionChange}
				/>
				<SelectInput 
					label="Direction" 
					bind:value={editableOptions.direction}
					options={[
						{value: 'rtl', label: 'Right to Left'},
						{value: 'ltr', label: 'Left to Right'}
					]}
					on:change={handleOptionChange}
				/>
			</div>

			<!-- Padding Options -->
			<div class="space-y-4">
				<h3 class="font-medium text-gray-700 border-b pb-1">Padding</h3>
				<SliderInput 
					label="Vertical Padding" 
					bind:value={editableOptions.padding.vertical}
					min={0} 
					max={30} 
					step={1}
					unit="px"
					on:input={handleOptionChange}
				/>
				<SliderInput 
					label="Horizontal Padding" 
					bind:value={editableOptions.padding.horizontal}
					min={0} 
					max={40} 
					step={1}
					unit="px"
					on:input={handleOptionChange}
				/>
				<SliderInput 
					label="Inner Padding" 
					bind:value={editableOptions.innerPadding}
					min={0} 
					max={20} 
					step={1}
					unit="px"
					on:input={handleOptionChange}
				/>
				<SliderInput 
					label="Outer Padding" 
					bind:value={editableOptions.outerPadding}
					min={0} 
					max={20} 
					step={1}
					unit="px"
					on:input={handleOptionChange}
				/>
			</div>

			<!-- Typography Options -->
			<div class="space-y-4">
				<h3 class="font-medium text-gray-700 border-b pb-1">Typography</h3>
				<SelectInput 
					label="Main Font" 
					bind:value={editableOptions.fontFamily.main}
					options={[
						{value: 'Vilna', label: 'Vilna'},
						{value: 'serif', label: 'Serif'},
						{value: 'sans-serif', label: 'Sans-serif'},
						{value: 'Frank Ruhl Libre', label: 'Frank Ruhl Libre'}
					]}
					on:change={handleOptionChange}
				/>
				<SelectInput 
					label="Commentary Font" 
					bind:value={editableOptions.fontFamily.inner}
					options={[
						{value: 'Rashi', label: 'Rashi'},
						{value: 'serif', label: 'Serif'},
						{value: 'sans-serif', label: 'Sans-serif'},
						{value: 'Noto Rashi Hebrew', label: 'Noto Rashi Hebrew'}
					]}
					on:change={(e) => {
						editableOptions.fontFamily.outer = editableOptions.fontFamily.inner;
						handleOptionChange();
					}}
				/>
				<div class="grid grid-cols-2 gap-3">
					<SliderInput 
						label="Main Font Size" 
						bind:value={editableOptions.fontSize.main}
						min={8} 
						max={24} 
						step={0.5}
						unit="px"
						on:input={handleOptionChange}
					/>
					<SliderInput 
						label="Side Font Size" 
						bind:value={editableOptions.fontSize.side}
						min={6} 
						max={20} 
						step={0.5}
						unit="px"
						on:input={handleOptionChange}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<SliderInput 
						label="Main Line Height" 
						bind:value={editableOptions.lineHeight.main}
						min={10} 
						max={30} 
						step={0.5}
						unit="px"
						on:input={handleOptionChange}
					/>
					<SliderInput 
						label="Side Line Height" 
						bind:value={editableOptions.lineHeight.side}
						min={8} 
						max={24} 
						step={0.5}
						unit="px"
						on:input={handleOptionChange}
					/>
				</div>
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
				<div bind:this={container} class="daf-container {showDebugOverlay ? 'debug-overlay' : ''} {forceLineBreaks ? 'force-line-breaks' : ''} {forceLineBreaks && showWbrMarkers ? 'show-wbr-markers' : ''}" style="width: 800px; margin: 0 auto; max-width: 100%;"></div>
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
				

				<!-- Measurement Results -->
				{#if spacerResults.measurementResults}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">Line Count Analysis</h2>
						
						<!-- Summary Stats -->
						<div class="grid grid-cols-3 gap-4 text-sm mb-4">
							<div class="text-center">
								<div class="text-lg font-semibold text-blue-600">
									{spacerResults.measurementResults.lineCounts?.original?.main || 0}
								</div>
								<div class="text-xs text-gray-600">Main Lines</div>
								<div class="text-xs text-gray-500 mt-1">
									Original: {spacerResults.measurementResults.lineCounts?.original?.main || 0}
								</div>
							</div>
							<div class="text-center">
								<div class="text-lg font-semibold text-green-600">
									{spacerResults.measurementResults.lineCounts?.original?.inner || 0}
								</div>
								<div class="text-xs text-gray-600">Inner Lines</div>
								<div class="text-xs text-gray-500 mt-1">
									Original: {spacerResults.measurementResults.lineCounts?.original?.inner || 0}
								</div>
							</div>
							<div class="text-center">
								<div class="text-lg font-semibold text-orange-600">
									{spacerResults.measurementResults.lineCounts?.original?.outer || 0}
								</div>
								<div class="text-xs text-gray-600">Outer Lines</div>
								<div class="text-xs text-gray-500 mt-1">
									Original: {spacerResults.measurementResults.lineCounts?.original?.outer || 0}
								</div>
							</div>
						</div>

						<!-- Detailed Line Breakdown -->
						{#if spacerResults.measurementResults.lineBreakdown}
							<div class="mb-4">
								<h3 class="font-medium mb-3">📊 Line Breakdown by Category</h3>
								<div class="grid grid-cols-3 gap-4 text-xs">
									<!-- Main Text -->
									<div class="bg-blue-50 p-3 rounded">
										<h4 class="font-medium text-blue-800 mb-2">Main Text ({spacerResults.measurementResults.lineBreakdown.main?.totalLines || 0} lines)</h4>
										{#if spacerResults.measurementResults.lineBreakdown.main?.summary}
											<div class="space-y-1">
												{#each Object.entries(spacerResults.measurementResults.lineBreakdown.main.summary) as [category, count]}
													{#if count > 0}
														<div class="flex justify-between">
															<span class="capitalize text-gray-700">{category}:</span>
															<span class="font-medium">{count}</span>
														</div>
													{/if}
												{/each}
											</div>
										{/if}
									</div>

									<!-- Inner Commentary (Rashi) -->
									<div class="bg-green-50 p-3 rounded">
										<h4 class="font-medium text-green-800 mb-2">Inner/Rashi ({spacerResults.measurementResults.lineBreakdown.inner?.totalLines || 0} lines)</h4>
										{#if spacerResults.measurementResults.lineBreakdown.inner?.summary}
											<div class="space-y-1">
												{#each Object.entries(spacerResults.measurementResults.lineBreakdown.inner.summary) as [category, count]}
													{#if count > 0}
														<div class="flex justify-between">
															<span class="capitalize text-gray-700 {category === 'start' ? 'font-bold' : ''}">{category}:</span>
															<span class="font-medium {category === 'start' ? 'text-green-900' : ''}">{count}</span>
														</div>
													{/if}
												{/each}
											</div>
										{/if}
									</div>

									<!-- Outer Commentary (Tosafot) -->
									<div class="bg-orange-50 p-3 rounded">
										<h4 class="font-medium text-orange-800 mb-2">Outer/Tosafot ({spacerResults.measurementResults.lineBreakdown.outer?.totalLines || 0} lines)</h4>
										{#if spacerResults.measurementResults.lineBreakdown.outer?.summary}
											<div class="space-y-1">
												{#each Object.entries(spacerResults.measurementResults.lineBreakdown.outer.summary) as [category, count]}
													{#if count > 0}
														<div class="flex justify-between">
															<span class="capitalize text-gray-700 {category === 'start' ? 'font-bold' : ''}">{category}:</span>
															<span class="font-medium {category === 'start' ? 'text-orange-900' : ''}">{count}</span>
														</div>
													{/if}
												{/each}
											</div>
										{/if}
									</div>
								</div>
								
								<!-- Category Legend -->
								<div class="mt-3 p-3 bg-gray-50 rounded text-xs">
									<h5 class="font-medium mb-2">Category Definitions:</h5>
									<div class="grid grid-cols-2 gap-x-4 gap-y-1">
										<div><span class="font-medium">Start:</span> First 4 lines of commentary</div>
										<div><span class="font-medium">Empty:</span> 0 characters</div>
										<div><span class="font-medium">Single:</span> ≤20 characters</div>
										<div><span class="font-medium">Short:</span> 21-40 characters</div>
										<div><span class="font-medium">Medium:</span> 41-60 characters</div>
										<div><span class="font-medium">Long:</span> >60 characters</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
				
				<!-- Raw Text Preview (Line Break Mode) -->
				{#if spacerResults.forceLineBreaks}
					<details class="bg-white rounded-lg shadow-sm border border-gray-200 p-4" open>
						<summary class="cursor-pointer font-semibold">Line Break Text Preview</summary>
						<div class="mt-4 space-y-4 text-xs">
							<!-- Main Text Analysis -->
							<div>
								<h4 class="font-medium mb-2 text-base">Main Text Lines</h4>
								<div class="max-h-96 overflow-y-auto border border-gray-200 rounded">
									<table class="w-full text-xs">
										<thead class="bg-gray-50 sticky top-0">
											<tr>
												<th class="px-2 py-1 text-left">#</th>
												<th class="px-2 py-1 text-left">Length</th>
												<th class="px-2 py-1 text-left">Category</th>
												<th class="px-2 py-1 text-right">Content</th>
											</tr>
										</thead>
										<tbody>
											{#each (spacerResults.data.mainText || '').split('<br>') as line, i}
												{@const trimmed = line.replace(/<[^>]*>/g, '').trim()}
												{@const len = trimmed.length}
												{@const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 58 ? 'short' : len <= 85 ? 'medium' : 'long'}
												<tr class="border-b hover:bg-gray-50">
													<td class="px-2 py-1">{i + 1}</td>
													<td class="px-2 py-1">{len}</td>
													<td class="px-2 py-1">
														<span class="text-xs font-mono {category === 'empty' ? 'text-gray-400' : category === 'single' ? 'text-yellow-600' : category === 'short' ? 'text-blue-600' : category === 'medium' ? 'text-green-600' : 'text-red-600'}">{category}</span>
													</td>
													<td class="px-2 py-1 text-right font-mono" dir="rtl">
														{#if len === 0}
															<span class="text-gray-400">[empty]</span>
														{:else}
															{trimmed.substring(0, 60)}{trimmed.length > 60 ? '...' : ''}
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								
								<!-- Main Text Flow Pattern -->
								<div class="bg-blue-50 p-2 rounded mt-2">
									<h5 class="font-medium text-xs mb-1">Text Flow Pattern:</h5>
									<div class="flex flex-wrap gap-1">
										{#each (() => {
											const mainLines = (spacerResults.data.mainText || '').split('<br>');
											const blocks = [];
											let currentBlock = null;
											mainLines.forEach((line, i) => {
												const trimmed = line.replace(/<[^>]*>/g, '').trim();
												const len = trimmed.length;
												const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 58 ? 'short' : len <= 85 ? 'medium' : 'long';
												
												if (!currentBlock || currentBlock.category !== category) {
													currentBlock = { category, startIndex: i, endIndex: i, count: 1 };
													blocks.push(currentBlock);
												} else {
													currentBlock.endIndex = i;
													currentBlock.count++;
												}
											});
											return blocks;
										})() as block}
											{@const colors = {
												empty: 'bg-gray-200',
												single: 'bg-yellow-200',
												short: 'bg-blue-200',
												medium: 'bg-green-200',
												long: 'bg-red-200'
											}}
											<div 
												class="px-2 py-1 text-xs rounded {colors[block.category] || 'bg-gray-100'}"
												title="{block.category}: lines {block.startIndex + 1}-{block.endIndex + 1} ({block.count} lines)"
											>
												{block.category}
												<span class="text-gray-600">({block.count})</span>
											</div>
										{/each}
									</div>
								</div>
							</div>
							
							<!-- Rashi Text Analysis -->
							<div>
								<h4 class="font-medium mb-2 text-base">Rashi Lines</h4>
								<div class="max-h-96 overflow-y-auto border border-gray-200 rounded">
									<table class="w-full text-xs">
										<thead class="bg-gray-50 sticky top-0">
											<tr>
												<th class="px-2 py-1 text-left">#</th>
												<th class="px-2 py-1 text-left">Length</th>
												<th class="px-2 py-1 text-left">Category</th>
												<th class="px-2 py-1 text-right">Content</th>
											</tr>
										</thead>
										<tbody>
											{#each (spacerResults.data.rashi || '').split('<br>') as line, i}
												{@const trimmed = line.replace(/<[^>]*>/g, '').trim()}
												{@const len = trimmed.length}
												{@const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 38 ? 'short' : len <= 80 ? 'half' : 'long'}
												{@const isStart = i < 4 && len > 0}
												<tr class="border-b hover:bg-gray-50">
													<td class="px-2 py-1">{i + 1}</td>
													<td class="px-2 py-1">{len}</td>
													<td class="px-2 py-1">
														<span class="text-xs font-mono {category === 'empty' ? 'text-gray-400' : category === 'single' ? 'text-yellow-600' : category === 'short' ? 'text-blue-600' : category === 'half' ? 'text-purple-600' : 'text-red-600'}">{category}</span>
														{#if isStart}
															<span class="text-xs bg-purple-200 px-1 rounded ml-1">start</span>
														{/if}
													</td>
													<td class="px-2 py-1 text-right font-mono" dir="rtl">
														{#if len === 0}
															<span class="text-gray-400">[empty]</span>
														{:else}
															{trimmed.substring(0, 50)}{trimmed.length > 50 ? '...' : ''}
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								
								<!-- Rashi Text Flow Pattern -->
								<div class="bg-green-50 p-2 rounded mt-2">
									<h5 class="font-medium text-xs mb-1">Text Flow Pattern:</h5>
									<div class="flex flex-wrap gap-1">
										{#each (() => {
											const rashiLines = (spacerResults.data.rashi || '').split('<br>');
											const blocks = [];
											let currentBlock = null;
											rashiLines.forEach((line, i) => {
												const trimmed = line.replace(/<[^>]*>/g, '').trim();
												const len = trimmed.length;
												const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 38 ? 'short' : len <= 80 ? 'half' : 'long';
												
												if (!currentBlock || currentBlock.category !== category) {
													currentBlock = { category, startIndex: i, endIndex: i, count: 1 };
													blocks.push(currentBlock);
												} else {
													currentBlock.endIndex = i;
													currentBlock.count++;
												}
											});
											return blocks;
										})() as block}
											{@const colors = {
												empty: 'bg-gray-200',
												single: 'bg-yellow-200',
												short: 'bg-blue-200',
												half: 'bg-purple-200',
												long: 'bg-red-200'
											}}
											<div 
												class="px-2 py-1 text-xs rounded {colors[block.category] || 'bg-gray-100'}"
												title="{block.category}: lines {block.startIndex + 1}-{block.endIndex + 1} ({block.count} lines)"
											>
												{block.category}
												<span class="text-gray-600">({block.count})</span>
											</div>
										{/each}
									</div>
								</div>
							</div>
							
							<!-- Tosafot Text Analysis -->
							<div>
								<h4 class="font-medium mb-2 text-base">Tosafot Lines</h4>
								<div class="max-h-96 overflow-y-auto border border-gray-200 rounded">
									<table class="w-full text-xs">
										<thead class="bg-gray-50 sticky top-0">
											<tr>
												<th class="px-2 py-1 text-left">#</th>
												<th class="px-2 py-1 text-left">Length</th>
												<th class="px-2 py-1 text-left">Category</th>
												<th class="px-2 py-1 text-right">Content</th>
											</tr>
										</thead>
										<tbody>
											{#each (spacerResults.data.tosafot || '').split('<br>') as line, i}
												{@const trimmed = line.replace(/<[^>]*>/g, '').trim()}
												{@const len = trimmed.length}
												{@const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 38 ? 'short' : len <= 80 ? 'half' : 'long'}
												{@const isStart = i < 4 && len > 0}
												<tr class="border-b hover:bg-gray-50">
													<td class="px-2 py-1">{i + 1}</td>
													<td class="px-2 py-1">{len}</td>
													<td class="px-2 py-1">
														<span class="text-xs font-mono {category === 'empty' ? 'text-gray-400' : category === 'single' ? 'text-yellow-600' : category === 'short' ? 'text-blue-600' : category === 'half' ? 'text-purple-600' : 'text-red-600'}">{category}</span>
														{#if isStart}
															<span class="text-xs bg-purple-200 px-1 rounded ml-1">start</span>
														{/if}
													</td>
													<td class="px-2 py-1 text-right font-mono" dir="rtl">
														{#if len === 0}
															<span class="text-gray-400">[empty]</span>
														{:else}
															{trimmed.substring(0, 50)}{trimmed.length > 50 ? '...' : ''}
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								
								<!-- Tosafot Text Flow Pattern -->
								<div class="bg-orange-50 p-2 rounded mt-2">
									<h5 class="font-medium text-xs mb-1">Text Flow Pattern:</h5>
									<div class="flex flex-wrap gap-1">
										{#each (() => {
											const tosafotLines = (spacerResults.data.tosafot || '').split('<br>');
											const blocks = [];
											let currentBlock = null;
											tosafotLines.forEach((line, i) => {
												const trimmed = line.replace(/<[^>]*>/g, '').trim();
												const len = trimmed.length;
												const category = len === 0 ? 'empty' : len <= 20 ? 'single' : len <= 38 ? 'short' : len <= 80 ? 'half' : 'long';
												
												if (!currentBlock || currentBlock.category !== category) {
													currentBlock = { category, startIndex: i, endIndex: i, count: 1 };
													blocks.push(currentBlock);
												} else {
													currentBlock.endIndex = i;
													currentBlock.count++;
												}
											});
											return blocks;
										})() as block}
											{@const colors = {
												empty: 'bg-gray-200',
												single: 'bg-yellow-200',
												short: 'bg-blue-200',
												half: 'bg-purple-200',
												long: 'bg-red-200'
											}}
											<div 
												class="px-2 py-1 text-xs rounded {colors[block.category] || 'bg-gray-100'}"
												title="{block.category}: lines {block.startIndex + 1}-{block.endIndex + 1} ({block.count} lines)"
											>
												{block.category}
												<span class="text-gray-600">({block.count})</span>
											</div>
										{/each}
									</div>
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
	
	/* Visual indicators for <wbr> tags - actual span elements */
	:global(.wbr-marker) {
		display: inline-block;
		width: 0;
		height: 1.2em;
		border-left: 2px solid black;
		vertical-align: text-top;
		opacity: 0.5;
		position: relative;
		margin: 0 -1px; /* Negative margin to not add space */
		pointer-events: none; /* Don't interfere with text selection */
	}
	
	/* Make the indicators more visible/colorful if needed */
	:global(.show-wbr-markers .wbr-marker) {
		border-left-color: #ff0000;
		opacity: 0.7;
		border-left-width: 2px;
		box-shadow: 0 0 2px rgba(255, 0, 0, 0.5);
	}
	
	/* Hide the markers when checkbox is unchecked */
	:global(.force-line-breaks:not(.show-wbr-markers) .wbr-marker) {
		display: none;
	}
</style>