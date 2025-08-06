<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Timeline from '$lib/components/Timeline.svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	import { defaultOptions } from '$lib/daf-renderer/options.js';
	import { TalmudAnalyzer } from '$lib/api/talmud-analyzer.ts';
	import { alignTexts, normalizeHebrew } from '$lib/services/textAlignment.ts';
	
	// Form inputs - initialize from URL params
	let tractate = $state('Berakhot');
	let daf = $state('2a');
	let includeRashi = $state(false);
	let includeTosafot = $state(false);
	
	// State
	let loading = $state(false);
	let error = $state('');
	let analysisData = $state<any>(null);
	let responseTime = $state(0);
	let forceRefresh = $state(false);
	
	// Daf renderer
	let rendererInstance = $state<any>(null);
	let container: HTMLElement;  // Not reactive - just a reference
	let isRendering = $state(false);
	
	// Visualization
	let selectedRabbi = $state<any>(null);
	let highlightedSection = $state<any>(null);
	
	// Common tractates for quick selection
	const commonTractates = [
		'Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Yoma', 
		'Sukkah', 'Rosh Hashanah', 'Taanit', 'Megillah',
		'Bava Kamma', 'Bava Metzia', 'Bava Batra', 
		'Sanhedrin', 'Makkot', 'Avodah Zarah'
	];
	
	// Color coding for time periods with refined colors
	const periodColors: Record<string, string> = {
		'Tannaim': '#5E72E4',    // Soft indigo
		'Amoraim': '#00B8D4',    // Refined teal
		'Savoraim': '#FFB400',   // Warm amber
		'Geonim': '#F5365C',     // Sophisticated coral
		'Rishonim': '#825EE4',   // Elegant purple
		'Acharonim': '#ec4899'   // Pink
	};
	
	// Helper function to format years
	function formatYear(year: number): string {
		if (year < 0) {
			return `${Math.abs(year)} BCE`;
		}
		return `${year} CE`;
	}
	
	// Prepare timeline data
	let highlightedPeriods = $derived(analysisData?.timePeriods?.map((p: any) => p.name) || []);
	let highlightedDates = $derived(
		analysisData?.rabbis
			?.filter((r: any) => r.period)
			?.flatMap((r: any) => {
				// Create date ranges for each rabbi's period
				const startYear = r.period.startYear;
				const endYear = r.period.endYear;
				// Return key years within the rabbi's period
				return [startYear, endYear];
			}) || []
	);
	
	// Section type colors
	const sectionColors = {
		'aggadah': '#22c55e',
		'halacha': '#3b82f6',
		'mixed': '#a855f7'
	};
	
	// Track if we're initializing to prevent URL update on mount
	let isInitializing = $state(true);
	
	// Update URL whenever form values change (but not on initial load)
	$effect(() => {
		if (typeof window !== 'undefined' && !isInitializing) {
			const params = new URLSearchParams();
			params.set('tractate', tractate);
			params.set('daf', daf);
			if (includeRashi) params.set('rashi', 'true');
			if (includeTosafot) params.set('tosafot', 'true');
			
			const currentUrl = window.location.search;
			const newParams = `?${params.toString()}`;
			
			// Only update if actually different
			if (currentUrl !== newParams) {
				const newUrl = `${window.location.pathname}${newParams}`;
				window.history.replaceState({}, '', newUrl);
			}
		}
	});
	
	async function analyzeText(bypassCache = false) {
		loading = true;
		error = '';
		analysisData = null;
		
		const startTime = Date.now();
		
		try {
			// We'll analyze the rendered text directly rather than using the API
			// This ensures the analysis and highlighting use the same text source
			
			// First get the daf text that will be rendered
			const pageNum = parseInt(daf.replace(/[ab]/, ''));
			const amud = daf.includes('b') ? 'b' : 'a';
			
			const mesechtaId = {
				'Berakhot': '1', 'Shabbat': '2', 'Eruvin': '3', 'Pesachim': '4',
				'Yoma': '6', 'Sukkah': '7', 'Rosh Hashanah': '9', 'Taanit': '10',
				'Megillah': '11', 'Bava Kamma': '15', 'Bava Metzia': '16', 
				'Bava Batra': '17', 'Sanhedrin': '23', 'Makkot': '24', 'Avodah Zarah': '26'
			}[tractate];
			
			if (!mesechtaId) {
				throw new Error('Invalid tractate selected');
			}
			
			const dafSupplierNum = (pageNum - 1) * 2 + (amud === 'a' ? 2 : 3);
			
			// Fetch the raw text with br=true
			const response = await fetch(`/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafSupplierNum}&br=true`);
			if (!response.ok) {
				throw new Error(`Failed to fetch text: ${response.status}`);
			}
			
			const textData = await response.json();
			let analysisText = textData.mainText || '';
			
			// Clean the text the same way the analysis API does
			analysisText = analysisText
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/<[^>]*>/g, '')
				.replace(/&[a-zA-Z]+;/g, '')
				.replace(/&#\d+;/g, '');
			
			// Add commentaries if requested
			if (includeRashi && textData.rashi) {
				const cleanRashi = textData.rashi
					.replace(/<br\s*\/?>/gi, '\n')
					.replace(/<[^>]*>/g, '');
				analysisText += '\n\nרש"י:\n' + cleanRashi;
			}
			
			if (includeTosafot && textData.tosafot) {
				const cleanTosafot = textData.tosafot
					.replace(/<br\s*\/?>/gi, '\n')
					.replace(/<[^>]*>/g, '');
				analysisText += '\n\nתוספות:\n' + cleanTosafot;
			}
			
			// Create analyzer and perform analysis on the same text
			const analyzer = new TalmudAnalyzer();
			if (!analyzer.isConfigured()) {
				throw new Error('TalmudAnalyzer not configured');
			}
			
			const analysis = await analyzer.analyzeTalmudPage({
				text: analysisText,
				tractate,
				page: pageNum.toString(),
				amud,
				includeRashi,
				includeTosafot
			});
			
			// Store both the analysis and the raw text data for rendering
			analysisData = {
				...analysis,
				rawTextData: textData,  // Store for highlighting
				analysisText,  // Store for debugging
				tractate,
				page: pageNum.toString(),
				amud,
				timestamp: Date.now(),
				textLength: analysisText.length,
				includeRashi,
				includeTosafot,
				cached: false
			};
			
			responseTime = Date.now() - startTime;
			console.log('Analysis data:', analysisData);
			
		} catch (err) {
			error = err instanceof Error ? err.message : 'Analysis failed';
			console.error('Analysis error:', err);
		} finally {
			loading = false;
		}
	}
	
	function formatConfidence(confidence: number): string {
		const percent = Math.round(confidence * 100);
		if (percent >= 80) return `${percent}% ⭐`;
		if (percent >= 60) return `${percent}% ✓`;
		return `${percent}%`;
	}
	
	async function renderDafWithHighlights() {
		if (!analysisData || !container || isRendering) return;
		
		// Prevent multiple renders
		isRendering = true;
		
		try {
			// Clean up existing renderer
			if (rendererInstance) {
				rendererInstance = null;
			}
			
			// Clear container
			container.innerHTML = '';
		
		// Create wrapper for renderer
		const wrapperDiv = document.createElement('div');
		wrapperDiv.id = 'daf-wrapper';
		container.appendChild(wrapperDiv);
		
		// Create renderer
		rendererInstance = createDafRenderer(wrapperDiv, defaultOptions);
		
		// Use the text data we already fetched during analysis
		const textData = analysisData.rawTextData;
		if (!textData) {
			console.error('No raw text data available for rendering');
			return;
		}
		
		// Process text with highlights for classified sections
		let mainText = textData.mainText || '';
		let innerText = textData.rashi || '';
		let outerText = textData.tosafot || '';
		
		console.log('Text lengths - Main:', mainText.length, 'Inner:', innerText.length, 'Outer:', outerText.length);
		
		// Skip all the complex highlighting strategies - they don't work
		// The daf renderer strips our modifications anyway
		console.log('Skipping pre-render highlighting - will use overlay approach instead');
		
		// Render the daf with all commentaries (using br mode like spacer-analysis)
		rendererInstance.render(
			mainText,
			innerText,
			outerText,
			textData.amud || 'a',
			'br'  // Force line break mode like spacer-analysis
		);
		
		// Create a separate classification display instead of trying to highlight the daf
		setTimeout(() => {
			if (analysisData.sections && analysisData.sections.length > 0) {
				console.log('Creating section classification display');
				
				// Add styles for section display
				const styleId = 'section-display-styles';
				let existingStyle = document.getElementById(styleId);
				if (existingStyle) {
					existingStyle.remove();
				}
				
				const styleElement = document.createElement('style');
				styleElement.id = styleId;
				styleElement.textContent = `
					.section-markers {
						position: absolute;
						top: 0;
						left: -30px;
						width: 25px;
						height: 100%;
						display: flex;
						flex-direction: column;
						pointer-events: none;
					}
					.section-marker {
						position: relative;
						width: 4px;
						flex: 1;
						min-height: 10px;
						pointer-events: auto;
						cursor: pointer;
						transition: width 0.2s, opacity 0.2s;
						opacity: 0.8;
					}
					.section-marker:hover {
						width: 6px;
						opacity: 1;
					}
					.section-marker.halacha {
						background-color: #3b82f6;
					}
					.section-marker.aggadah {
						background-color: #22c55e;
					}
					.section-marker.mixed {
						background-color: #a855f7;
					}
				`;
				document.head.appendChild(styleElement);
				
				// Create markers container
				const dafContainer = container.querySelector('.dafRoot') || container;
				const existingMarkers = dafContainer.querySelector('.section-markers');
				if (existingMarkers) {
					existingMarkers.remove();
				}
				
				const markersContainer = document.createElement('div');
				markersContainer.className = 'section-markers';
				dafContainer.style.position = 'relative';
				dafContainer.appendChild(markersContainer);
				
				// Add markers for each section - they'll stack vertically as a continuous line
				analysisData.sections.forEach((section, index) => {
					const marker = document.createElement('div');
					marker.className = `section-marker ${section.type}`;
					marker.title = `${section.type} (${Math.round(section.confidence * 100)}%): ${section.text?.substring(0, 50)}...`;
					
					// The flex: 1 in CSS will make each section take proportional height
					markersContainer.appendChild(marker);
				});
				
				console.log('Added', analysisData.sections.length, 'section markers');
			}
		}, 1000); // Give daf renderer time to finish
		} finally {
			// Allow rendering again after a delay
			setTimeout(() => {
				isRendering = false;
			}, 100);
		}
	}
	
	// Trigger render when analysis data changes
	$effect(() => {
		if (analysisData) {
			// Use a small delay to ensure container is ready
			setTimeout(() => {
				if (container && !isRendering) {
					renderDafWithHighlights();
				}
			}, 50);
		}
	});
	
	onMount(() => {
		// Initialize from URL params if present
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.has('tractate')) {
			tractate = urlParams.get('tractate') || 'Berakhot';
		}
		if (urlParams.has('daf')) {
			daf = urlParams.get('daf') || '2a';
		}
		includeRashi = urlParams.get('rashi') === 'true';
		includeTosafot = urlParams.get('tosafot') === 'true';
		
		// Mark initialization as complete
		isInitializing = false;
		
		// Auto-analyze on load with values from URL or defaults
		analyzeText();
	});
</script>

<div class="container mx-auto p-4 max-w-9xl">
	<h1 class="text-3xl font-bold mb-6">Talmud AI Analysis Test</h1>
	
	<!-- Input Form -->
	<div class="bg-white rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-xl font-semibold mb-4">Select Page to Analyze</h2>
		
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
			<div>
				<label class="block text-sm font-medium mb-1">Tractate</label>
				<select 
					bind:value={tractate}
					class="w-full px-3 py-2 border rounded-md"
				>
					{#each commonTractates as t}
						<option value={t}>{t}</option>
					{/each}
				</select>
			</div>
			
			<div>
				<label class="block text-sm font-medium mb-1">Daf</label>
				<input 
					type="text"
					bind:value={daf}
					placeholder="e.g., 2a, 3b, 10a"
					class="w-full px-3 py-2 border rounded-md"
				/>
			</div>
		</div>
		
		<div class="flex gap-4 mb-4">
			<label class="flex items-center">
				<input 
					type="checkbox" 
					bind:checked={includeRashi}
					class="mr-2"
				/>
				Include Rashi
			</label>
			<label class="flex items-center">
				<input 
					type="checkbox" 
					bind:checked={includeTosafot}
					class="mr-2"
				/>
				Include Tosafot
			</label>
		</div>
		
		<div class="flex items-center gap-2">
			<button 
				on:click={() => analyzeText()}
				disabled={loading}
				class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
			>
				{loading ? 'Analyzing...' : 'Analyze Page'}
			</button>
			
			<button
				on:click={() => analyzeText(true)}
				disabled={loading}
				title="Bypass cache and force fresh analysis"
				class="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
				</svg>
			</button>
			
			{#if responseTime > 0}
				<span class="ml-2 text-sm text-gray-600">
					{responseTime}ms
					{#if analysisData?.cached}
						<span class="text-green-600">(cached)</span>
					{/if}
				</span>
			{/if}
		</div>
	</div>
	
	<!-- Error Display -->
	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
			<h3 class="text-red-800 font-semibold">Error</h3>
			<p class="text-red-700">{error}</p>
		</div>
	{/if}
	
	<!-- Analysis Results -->
	{#if analysisData}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Left Column: Rendered Daf with Classifications -->
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-hidden">
				<h2 class="text-lg font-semibold mb-3">Daf with Text Classification</h2>
				
				<!-- Legend -->
				<div class="flex gap-4 mb-3 text-sm">
					<div class="flex items-center gap-2">
						<span class="w-4 h-4 rounded" style="background-color: {sectionColors.aggadah}"></span>
						<span>Aggadah (Narrative)</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="w-4 h-4 rounded" style="background-color: {sectionColors.halacha}"></span>
						<span>Halacha (Law)</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="w-4 h-4 rounded" style="background-color: {sectionColors.mixed}"></span>
						<span>Mixed</span>
					</div>
				</div>
				
				<!-- Daf Renderer Container -->
				<div class="overflow-x-auto overflow-y-hidden">
					<div bind:this={container} class="daf-container" style="width: 800px; margin: 0 auto; max-width: 100%; position: relative; padding-left: 35px;"></div>
				</div>
			</div>
			
			<!-- Right Column: Analysis Results -->
			<div class="space-y-6">
				<!-- Text Classification Analysis -->
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<h2 class="text-lg font-semibold mb-3">Text Classification</h2>
					
					<div class="grid grid-cols-2 gap-4 mb-4">
						<div class="text-center">
							<div class="text-2xl font-bold text-green-600">
								{Math.round(analysisData.summary?.aggadahPercentage || 0)}%
							</div>
							<div class="text-sm text-gray-600">Aggadah Content</div>
						</div>
						
						<div class="text-center">
							<div class="text-2xl font-bold text-blue-600">
								{Math.round(analysisData.summary?.halachaPercentage || 0)}%
							</div>
							<div class="text-sm text-gray-600">Halacha Content</div>
						</div>
					</div>
					
					{#if analysisData.sections && analysisData.sections.length > 0}
						<div class="text-sm text-gray-600 mb-2">
							Classified {analysisData.sections.length} sections
						</div>
						<div class="space-y-1 max-h-32 overflow-y-auto">
							{#each analysisData.sections.slice(0, 5) as section}
								<div class="flex items-center gap-2 text-xs">
									<span 
										class="w-2 h-2 rounded-full flex-shrink-0" 
										style="background-color: {sectionColors[section.type]}"
									></span>
									<span class="font-medium capitalize">{section.type}</span>
									<span class="text-gray-500 truncate">
										{section.text?.substring(0, 40)}...
									</span>
								</div>
							{/each}
							{#if analysisData.sections.length > 5}
								<div class="text-xs text-gray-500">
									...and {analysisData.sections.length - 5} more sections
								</div>
							{/if}
						</div>
					{/if}
				</div>
				
				<!-- Rabbi Identification -->
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<h2 class="text-lg font-semibold mb-3">Rabbi Identification</h2>
					
					{#if analysisData?.rabbis?.length > 0}
						<div class="text-sm text-gray-600 mb-3">
							Found {analysisData.rabbis.length} rabbis
						</div>
						<div class="space-y-2">
							{#each analysisData.rabbis as rabbi}
								{#if rabbi.period}
									<div class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
										<div class="flex-shrink-0">
											<span 
												class="inline-block w-3 h-3 rounded-full"
												style="background-color: {periodColors[rabbi.period.name] || '#666'}"
											></span>
										</div>
										<div class="flex-1 min-w-0">
											<div class="font-medium truncate">{rabbi.name}</div>
											<div class="text-gray-600 text-xs">
												{rabbi.hebrewName} • {rabbi.period.name}
											</div>
										</div>
										{#if rabbi.confidence}
											<div class="text-xs text-gray-500">
												{formatConfidence(rabbi.confidence)}
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<div class="text-sm text-gray-500">No rabbis identified in this text</div>
					{/if}
				</div>
				
				<!-- Time Period Analysis -->
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<h2 class="text-lg font-semibold mb-3">Time Period Analysis</h2>
					
					{#if analysisData.primaryPeriod}
						<div class="p-3 bg-gray-50 rounded mb-3">
							<div class="font-medium">Primary Period</div>
							<div class="flex items-center gap-2 mt-1">
								<span 
									class="w-3 h-3 rounded-full" 
									style="background-color: {periodColors[analysisData.primaryPeriod.name] || '#000'}"
								></span>
								<span class="font-medium" style="color: {periodColors[analysisData.primaryPeriod.name] || '#000'}">
									{analysisData.primaryPeriod.name}
								</span>
								<span class="text-gray-600">({analysisData.primaryPeriod.hebrewName})</span>
							</div>
							<div class="text-sm text-gray-600 mt-1">
								{formatYear(analysisData.primaryPeriod.startYear)} - {formatYear(analysisData.primaryPeriod.endYear)}
							</div>
						</div>
					{/if}
					
					{#if analysisData.timePeriods && analysisData.timePeriods.length > 1}
						<div class="text-sm text-gray-600 mb-2">All periods represented:</div>
						<div class="space-y-1">
							{#each analysisData.timePeriods as period}
								<div class="flex items-center gap-2 text-sm">
									<span 
										class="w-2 h-2 rounded-full" 
										style="background-color: {periodColors[period.name] || '#666'}"
									></span>
									<span>{period.name} ({period.hebrewName})</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
				
				<!-- Timeline Visualization -->
				{#if highlightedPeriods.length > 0}
					<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
						<h2 class="text-lg font-semibold mb-3">Historical Timeline</h2>
						<Timeline 
							{highlightedPeriods}
							{highlightedDates}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/if}
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
</style>