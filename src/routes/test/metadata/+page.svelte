<script lang="ts">
	import { onMount } from 'svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	import { defaultOptions } from '$lib/daf-renderer/options.js';
	
	// Form inputs
	let tractate = 'Berakhot';
	let daf = '2a';
	let includeRashi = false;
	let includeTosafot = false;
	
	// State
	let loading = false;
	let error = '';
	let analysisData: any = null;
	let responseTime = 0;
	let forceRefresh = false;
	
	// Daf renderer
	let rendererInstance: any = null;
	let container: HTMLElement;
	
	// Visualization
	let selectedRabbi: any = null;
	let highlightedSection: any = null;
	
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
	$: highlightedPeriods = analysisData?.timePeriods?.map((p: any) => p.name) || [];
	$: highlightedDates = analysisData?.rabbis
		?.filter((r: any) => r.period)
		?.flatMap((r: any) => {
			// Create date ranges for each rabbi's period
			const startYear = r.period.startYear;
			const endYear = r.period.endYear;
			// Return key years within the rabbi's period
			return [startYear, endYear];
		}) || [];
	
	// Section type colors
	const sectionColors = {
		'aggadah': '#22c55e',
		'halacha': '#3b82f6',
		'mixed': '#a855f7'
	};
	
	async function analyzeText(bypassCache = false) {
		loading = true;
		error = '';
		analysisData = null;
		
		const startTime = Date.now();
		
		try {
			// Parse daf format (e.g., "2a" or "2b" or just "2")
			const pageNum = parseInt(daf.replace(/[ab]/, ''));
			const amud = daf.includes('b') ? 'b' : 'a';
			
			const params = new URLSearchParams({
				tractate,
				page: pageNum.toString(),
				amud,
				includeRashi: includeRashi.toString(),
				includeTosafot: includeTosafot.toString()
			});
			
			if (bypassCache) {
				params.append('refresh', 'true');
			}
			
			const response = await fetch(`/api/talmud-analysis?${params}`);
			responseTime = Date.now() - startTime;
			
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `HTTP ${response.status}`);
			}
			
			analysisData = await response.json();
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
		if (!analysisData || !container) return;
		
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
		
		// Fetch the daf text
		const mesechtaId = {
			'Berakhot': '1', 'Shabbat': '2', 'Eruvin': '3', 'Pesachim': '4',
			'Yoma': '6', 'Sukkah': '7', 'Rosh Hashanah': '9', 'Taanit': '10',
			'Megillah': '11', 'Bava Kamma': '15', 'Bava Metzia': '16', 
			'Bava Batra': '17', 'Sanhedrin': '23', 'Makkot': '24', 'Avodah Zarah': '26'
		}[tractate];
		
		if (!mesechtaId) return;
		
		// Convert daf format for daf-supplier
		const pageNum = parseInt(daf.replace(/[ab]/, ''));
		const amud = daf.includes('b') ? 'b' : 'a';
		const dafSupplierNum = (pageNum - 1) * 2 + (amud === 'a' ? 2 : 3);
		
		const response = await fetch(`/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafSupplierNum}`);
		const data = await response.json();
		
		// Process text with highlights for classified sections
		let mainText = data.mainText || '';
		
		// Add highlighting based on section classifications
		if (analysisData.sections && analysisData.sections.length > 0) {
			analysisData.sections.forEach((section: any) => {
				const color = sectionColors[section.type] || '#666';
				// This is simplified - in production you'd need proper text matching
				const highlightStyle = `background-color: ${color}20; border-left: 3px solid ${color};`;
				// Add highlight spans around classified sections
				// Note: This would need more sophisticated text matching logic
			});
		}
		
		// Render the daf with all commentaries (always show them visually)
		// daf-supplier returns inner and outer, not rashi and tosafot
		rendererInstance.render(
			mainText,
			data.inner || '',  // Inner commentary (usually Rashi)
			data.outer || '', // Outer commentary (usually Tosafot)
			amud,
			false
		);
	}
	
	// Re-render when analysis data changes
	$: if (analysisData && container) {
		renderDafWithHighlights();
	}
	
	onMount(() => {
		// Auto-analyze on load with default values
		analyzeText();
	});
</script>

<div class="container mx-auto p-4 max-w-7xl">
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
			<div>
				<div class="bg-white rounded-lg shadow-md p-6 mb-6">
					<h2 class="text-xl font-semibold mb-4">Daf with Text Classification</h2>
					
					<!-- Legend -->
					<div class="flex gap-4 mb-4 text-sm">
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
					<div bind:this={container} class="daf-container overflow-hidden" style="min-height: 400px; max-width: 100%;"></div>
				</div>
			</div>
			
			<!-- Right Column: Analysis Results -->
			<div>
				<!-- Summary Stats -->
				<div class="bg-white rounded-lg shadow-md p-6 mb-6">
					<h2 class="text-xl font-semibold mb-4">Analysis Summary</h2>
					
					<div class="grid grid-cols-2 gap-4">
						<div class="text-center">
							<div class="text-3xl font-bold text-green-600">
								{Math.round(analysisData.summary?.aggadahPercentage || 0)}%
							</div>
							<div class="text-sm text-gray-600">Aggadah Content</div>
						</div>
						
						<div class="text-center">
							<div class="text-3xl font-bold text-blue-600">
								{Math.round(analysisData.summary?.halachaPercentage || 0)}%
							</div>
							<div class="text-sm text-gray-600">Halacha Content</div>
						</div>
					</div>
					
					{#if analysisData.primaryPeriod}
						<div class="mt-4 p-3 bg-gray-50 rounded">
							<span class="font-semibold">Primary Period:</span>
							<span class="ml-2" style="color: {periodColors[analysisData.primaryPeriod.name] || '#000'}">
								{analysisData.primaryPeriod.name} ({analysisData.primaryPeriod.hebrewName})
							</span>
							<span class="ml-2 text-sm text-gray-600">
								{formatYear(analysisData.primaryPeriod.startYear)} - {formatYear(analysisData.primaryPeriod.endYear)}
							</span>
						</div>
					{/if}
				</div>
				
				<!-- Timeline Visualization -->
				{#if highlightedPeriods.length > 0}
					<div class="bg-white rounded-lg shadow-md p-6 mb-6">
						<Timeline 
							{highlightedPeriods}
							{highlightedDates}
						/>
					</div>
				{/if}
				
				<!-- Rabbi Timeline Details -->
				{#if analysisData?.rabbis?.length > 0}
					<div class="bg-white rounded-lg shadow-md p-6">
						<h2 class="text-xl font-semibold mb-4">Rabbis Identified ({analysisData.rabbis.length})</h2>
						<div class="space-y-2">
							{#each analysisData.rabbis as rabbi}
								{#if rabbi.period}
									<div class="flex items-center gap-4 p-2 hover:bg-gray-50 rounded">
										<div class="flex-shrink-0">
											<span 
												class="inline-block w-3 h-3 rounded-full"
												style="background-color: {periodColors[rabbi.period.name] || '#666'}"
											></span>
										</div>
										<div class="flex-1">
											<span class="font-semibold">{rabbi.name}</span>
											<span class="text-gray-600 ml-2">({rabbi.hebrewName})</span>
										</div>
										<div class="text-sm text-gray-600">
											{rabbi.period.name} • {formatYear(rabbi.period.startYear)} - {formatYear(rabbi.period.endYear)}
										</div>
									</div>
								{/if}
							{/each}
						</div>
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
		overflow: hidden !important;
	}
	
	:global(.daf-container #daf-wrapper) {
		max-width: 100%;
		overflow: hidden;
	}
	
	:global(.daf-container .main-text) {
		font-family: 'Frank Ruhl Libre', serif;
	}
	
	:global(.daf-container .commentary-text) {
		font-family: 'Noto Rashi Hebrew', serif;
	}
</style>