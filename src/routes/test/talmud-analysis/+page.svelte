<script lang="ts">
	import { onMount } from 'svelte';
	import ElegantTimeline from '$lib/components/ElegantTimeline.svelte';
	import type { TimelinePeriod } from '$lib/components/ElegantTimeline.svelte';
	
	// Form inputs
	let tractate = 'Berakhot';
	let page = '2';
	let amud: 'a' | 'b' = 'a';
	let includeRashi = false;
	let includeTosafot = false;
	
	// State
	let loading = false;
	let error = '';
	let analysisData: any = null;
	let responseTime = 0;
	let showRawResponse = false;
	
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
	$: timelinePeriods = analysisData?.timePeriods?.map((period: any): TimelinePeriod => ({
		id: period.name,
		name: period.name,
		hebrewName: period.hebrewName,
		startYear: period.startYear,
		endYear: period.endYear,
		color: periodColors[period.name] || '#666',
		description: `Historical period in Jewish scholarship`,
		figures: analysisData.rabbis
			?.filter((rabbi: any) => rabbi.period?.name === period.name)
			?.map((rabbi: any) => ({
				name: rabbi.name,
				hebrewName: rabbi.hebrewName,
				year: rabbi.year
			}))
	})) || [];
	
	// Section type colors
	const sectionColors = {
		'aggadah': '#22c55e',
		'halacha': '#3b82f6',
		'mixed': '#a855f7'
	};
	
	async function analyzeText() {
		loading = true;
		error = '';
		analysisData = null;
		
		const startTime = Date.now();
		
		try {
			const params = new URLSearchParams({
				tractate,
				page,
				amud,
				includeRashi: includeRashi.toString(),
				includeTosafot: includeTosafot.toString()
			});
			
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
		
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
				<label class="block text-sm font-medium mb-1">Page</label>
				<input 
					type="number"
					bind:value={page}
					min="2"
					max="200"
					class="w-full px-3 py-2 border rounded-md"
				/>
			</div>
			
			<div>
				<label class="block text-sm font-medium mb-1">Side</label>
				<div class="flex gap-4">
					<label class="flex items-center">
						<input 
							type="radio" 
							value="a" 
							bind:group={amud}
							class="mr-2"
						/>
						<span>a (עמוד א)</span>
					</label>
					<label class="flex items-center">
						<input 
							type="radio" 
							value="b" 
							bind:group={amud}
							class="mr-2"
						/>
						<span>b (עמוד ב)</span>
					</label>
				</div>
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
		
		<button 
			on:click={analyzeText}
			disabled={loading}
			class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
		>
			{loading ? 'Analyzing...' : 'Analyze Page'}
		</button>
		
		{#if responseTime > 0}
			<span class="ml-4 text-sm text-gray-600">
				Response time: {responseTime}ms
				{#if analysisData?.cached}
					<span class="text-green-600">(cached)</span>
				{/if}
			</span>
		{/if}
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
		<!-- Summary Stats -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-xl font-semibold mb-4">Analysis Summary</h2>
			
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div class="text-center">
					<div class="text-3xl font-bold text-blue-600">
						{analysisData.summary?.totalRabbis || 0}
					</div>
					<div class="text-sm text-gray-600">Rabbis Identified</div>
				</div>
				
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
				
				<div class="text-center">
					<div class="text-3xl font-bold text-purple-600">
						{analysisData.timePeriods?.length || 0}
					</div>
					<div class="text-sm text-gray-600">Time Periods</div>
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
		
		<!-- Rabbis List -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-xl font-semibold mb-4">
				Identified Rabbis ({analysisData.rabbis?.length || 0})
			</h2>
			
			{#if analysisData.rabbis && analysisData.rabbis.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each analysisData.rabbis as rabbi}
						<button
							on:click={() => selectedRabbi = selectedRabbi === rabbi ? null : rabbi}
							class="text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
							class:bg-blue-50={selectedRabbi === rabbi}
							class:border-blue-400={selectedRabbi === rabbi}
						>
							<div class="font-semibold">
								{rabbi.name || rabbi.hebrewName}
							</div>
							<div class="text-sm text-gray-600">
								{rabbi.hebrewName} • {rabbi.title}
							</div>
							{#if rabbi.period}
								<div class="text-xs mt-1" style="color: {periodColors[rabbi.period.name] || '#666'}">
									{rabbi.period.name}
									{#if rabbi.generation}
										(Gen {rabbi.generation})
									{/if}
								</div>
							{/if}
							<div class="text-xs text-gray-500 mt-1">
								Confidence: {formatConfidence(rabbi.confidence)}
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No rabbis identified in this text.</p>
			{/if}
		</div>
		
		<!-- Text Sections -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-xl font-semibold mb-4">
				Text Classification
			</h2>
			
			{#if analysisData.sections && analysisData.sections.length > 0}
				<div class="space-y-3">
					{#each analysisData.sections as section}
						<div 
							class="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
							style="border-left: 4px solid {sectionColors[section.type]}"
							on:click={() => highlightedSection = highlightedSection === section ? null : section}
							class:bg-gray-50={highlightedSection === section}
						>
							<div class="flex justify-between items-start mb-2">
								<span 
									class="px-2 py-1 rounded text-white text-sm font-semibold"
									style="background-color: {sectionColors[section.type]}"
								>
									{section.type === 'aggadah' ? 'Aggadah (Narrative)' : 
									 section.type === 'halacha' ? 'Halacha (Law)' : 'Mixed'}
								</span>
								<span class="text-sm text-gray-500">
									Confidence: {formatConfidence(section.confidence)}
								</span>
							</div>
							
							{#if section.text}
								<div class="text-sm text-gray-700 mb-2 line-clamp-3">
									{section.text}
								</div>
							{/if}
							
							{#if section.indicators && section.indicators.length > 0}
								<div class="text-xs text-gray-600">
									<span class="font-semibold">Indicators:</span>
									{#each section.indicators as indicator, i}
										<span class="ml-1">
											{indicator}{i < section.indicators.length - 1 ? ',' : ''}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No text sections classified.</p>
			{/if}
		</div>
		
		<!-- Timeline Visualization -->
		{#if timelinePeriods.length > 0}
			<div class="mb-6">
				<ElegantTimeline 
					periods={timelinePeriods}
					minYear={-500}
					maxYear={1500}
				/>
			</div>
		{/if}
		
		<!-- Debug/Raw Response -->
		<div class="bg-white rounded-lg shadow-md p-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-semibold">Debug Information</h2>
				<button 
					on:click={() => showRawResponse = !showRawResponse}
					class="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
				>
					{showRawResponse ? 'Hide' : 'Show'} Raw Response
				</button>
			</div>
			
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
				<div>
					<span class="font-semibold">Model:</span>
					<span class="ml-1">{analysisData.model}</span>
				</div>
				<div>
					<span class="font-semibold">Confidence:</span>
					<span class="ml-1">{formatConfidence(analysisData.confidence)}</span>
				</div>
				<div>
					<span class="font-semibold">Text Length:</span>
					<span class="ml-1">{analysisData.textLength} chars</span>
				</div>
				<div>
					<span class="font-semibold">Cached:</span>
					<span class="ml-1">{analysisData.cached ? 'Yes' : 'No'}</span>
				</div>
			</div>
			
			{#if showRawResponse}
				<pre class="mt-4 p-4 bg-gray-50 rounded overflow-x-auto text-xs">
{JSON.stringify(analysisData, null, 2)}
				</pre>
			{/if}
		</div>
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>