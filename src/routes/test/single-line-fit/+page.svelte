<script>
	import { onMount } from 'svelte';
	import { fitSingleLine } from '$lib/daf-renderer/calculate-spacers.js';
	
	let container;
	let results = [];
	let testText = 'גמרא מתני׳ מאימתי קורין את שמע בערבית משעה שהכהנים נכנסים לאכול בתרומתן';
	let baseWidth = 400;
	let baseFontSize = 16;
	let fontFamily = 'Frank Ruhl Libre';
	
	function runTest() {
		if (!container) return;
		
		// Create dummy container for measurements
		const dummy = document.createElement('div');
		dummy.style.position = 'absolute';
		dummy.style.visibility = 'hidden';
		container.appendChild(dummy);
		
		// Test different adjustment strategies
		const strategies = [
			{ preferFontAdjustment: true, name: 'Font First' },
			{ preferFontAdjustment: false, name: 'Width First' },
			{ preferFontAdjustment: true, maxWidth: baseWidth * 1.5, name: 'Font + 50% Width' },
			{ preferFontAdjustment: false, minFontSize: baseFontSize * 0.8, name: 'Width + 80% Font' }
		];
		
		results = strategies.map(strategy => {
			const result = fitSingleLine(
				testText,
				fontFamily,
				baseFontSize,
				baseWidth,
				baseFontSize * 1.2, // line height
				dummy,
				strategy
			);
			
			return {
				...result,
				strategy: strategy.name,
				fontReduction: ((baseFontSize - result.fontSize) / baseFontSize * 100).toFixed(1),
				widthIncrease: ((result.width - baseWidth) / baseWidth * 100).toFixed(1)
			};
		});
		
		// Clean up
		dummy.remove();
	}
	
	onMount(() => {
		runTest();
	});
</script>

<div class="container mx-auto p-6 max-w-6xl">
	<h1 class="text-2xl font-bold mb-6">Single Line Fit Helper Test</h1>
	
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
		<h2 class="text-lg font-semibold mb-4">Test Parameters</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Test Text</label>
				<input 
					type="text"
					bind:value={testText}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Base Width (px)</label>
				<input 
					type="number"
					bind:value={baseWidth}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Base Font Size (px)</label>
				<input 
					type="number"
					bind:value={baseFontSize}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			<div class="flex items-end">
				<button 
					on:click={runTest}
					class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
				>
					Test Fit
				</button>
			</div>
		</div>
	</div>
	
	<div bind:this={container} class="space-y-6">
		<!-- Original (no adjustment) -->
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
			<h3 class="text-lg font-semibold mb-3">Original (No Adjustment)</h3>
			<div class="border-2 border-red-300 p-4 overflow-hidden">
				<div 
					style="font-family: {fontFamily}; font-size: {baseFontSize}px; width: {baseWidth}px; line-height: {baseFontSize * 1.2}px; direction: rtl;"
					class="mx-auto border border-gray-400"
				>
					{testText}
				</div>
			</div>
			<p class="mt-2 text-sm text-gray-600">
				Width: {baseWidth}px | Font Size: {baseFontSize}px
			</p>
		</div>
		
		<!-- Results -->
		{#each results as result}
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
				<h3 class="text-lg font-semibold mb-3">{result.strategy}</h3>
				<div class="border-2 {result.adjusted ? 'border-green-300' : 'border-gray-300'} p-4 overflow-hidden">
					<div 
						style="font-family: {fontFamily}; font-size: {result.fontSize}px; width: {result.width}px; line-height: {result.fontSize * 1.2}px; direction: rtl;"
						class="mx-auto border border-gray-400"
					>
						{testText}
					</div>
				</div>
				<div class="mt-3 grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="font-medium">Width:</span> {result.width.toFixed(1)}px 
						<span class="{result.widthIncrease > 0 ? 'text-orange-600' : 'text-gray-500'}">
							({result.widthIncrease > 0 ? '+' : ''}{result.widthIncrease}%)
						</span>
					</div>
					<div>
						<span class="font-medium">Font Size:</span> {result.fontSize.toFixed(1)}px
						<span class="{result.fontReduction > 0 ? 'text-blue-600' : 'text-gray-500'}">
							(-{result.fontReduction}%)
						</span>
					</div>
					<div>
						<span class="font-medium">Adjusted:</span> 
						<span class="{result.adjusted ? 'text-green-600' : 'text-gray-500'}">
							{result.adjusted ? 'Yes' : 'No'}
						</span>
					</div>
					<div>
						<span class="font-medium">Height:</span> {result.actualHeight}px
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&display=swap');
</style>