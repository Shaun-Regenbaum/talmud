<script>
	import { onMount } from 'svelte';
	import createDafRenderer from '$lib/daf-renderer/renderer.js';
	import { defaultOptions } from '$lib/daf-renderer/options.js';
	import { fitSingleLine } from '$lib/daf-renderer/calculate-spacers.js';
	
	let container;
	let loading = false;
	let results = null;
	
	// Example of how fitSingleLine could be used in practice
	async function demonstrateFitIntegration() {
		loading = true;
		
		try {
			// Create dummy container for measurements
			const dummy = document.createElement('div');
			dummy.style.position = 'absolute';
			dummy.style.visibility = 'hidden';
			document.body.appendChild(dummy);
			
			// Example text that might need to fit on one line
			const examples = [
				{
					text: 'גמרא. מתני׳ מאימתי קורין את שמע בערבית',
					context: 'Mishna header',
					width: 400,
					fontSize: 16
				},
				{
					text: 'רש"י ד"ה מאימתי - משעה שהכהנים נכנסים לאכול בתרומתן',
					context: 'Rashi header',
					width: 200,
					fontSize: 10.5
				},
				{
					text: 'תוספות ד"ה מאימתי - וא"ת מאי שנא דתני מאימתי ולא תני מתי',
					context: 'Tosafot header',
					width: 200,
					fontSize: 10.5
				}
			];
			
			results = examples.map(example => {
				const original = { ...example };
				
				// Try to fit on one line
				const fitted = fitSingleLine(
					example.text,
					'Frank Ruhl Libre',
					example.fontSize,
					example.width,
					example.fontSize * 1.2,
					dummy,
					{ preferFontAdjustment: true, maxWidth: example.width * 1.1 }
				);
				
				return {
					original,
					fitted,
					adjustmentMade: fitted.adjusted,
					fontReduction: ((original.fontSize - fitted.fontSize) / original.fontSize * 100).toFixed(1),
					widthIncrease: ((fitted.width - original.width) / original.width * 100).toFixed(1)
				};
			});
			
			dummy.remove();
			
		} catch (err) {
			console.error('Error:', err);
		} finally {
			loading = false;
		}
	}
	
	onMount(() => {
		demonstrateFitIntegration();
	});
</script>

<div class="container mx-auto p-6 max-w-6xl">
	<h1 class="text-2xl font-bold mb-6">Single Line Fit Integration Example</h1>
	
	<div class="mb-6 p-4 bg-blue-50 rounded-lg">
		<h2 class="text-lg font-semibold mb-2">Use Cases for fitSingleLine:</h2>
		<ul class="list-disc list-inside space-y-1 text-sm">
			<li>Mishna headers that introduce new sections</li>
			<li>Rashi/Tosafot headers (ד"ה lines)</li>
			<li>Chapter titles or section markers</li>
			<li>Any text that loses meaning when wrapped</li>
		</ul>
	</div>
	
	{#if loading}
		<div class="text-center py-8">Loading...</div>
	{:else if results}
		<div class="space-y-6">
			{#each results as result}
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
					<h3 class="text-lg font-semibold mb-3">{result.original.context}</h3>
					
					<!-- Original -->
					<div class="mb-4">
						<p class="text-sm text-gray-600 mb-2">Original (may wrap):</p>
						<div class="border border-red-300 p-3 overflow-hidden">
							<div 
								style="font-family: Frank Ruhl Libre; font-size: {result.original.fontSize}px; width: {result.original.width}px; line-height: {result.original.fontSize * 1.2}px; direction: rtl;"
								class="mx-auto border border-gray-400"
							>
								{result.original.text}
							</div>
						</div>
					</div>
					
					<!-- Fitted -->
					<div class="mb-4">
						<p class="text-sm text-gray-600 mb-2">Fitted (single line):</p>
						<div class="border border-green-300 p-3 overflow-hidden">
							<div 
								style="font-family: Frank Ruhl Libre; font-size: {result.fitted.fontSize}px; width: {result.fitted.width}px; line-height: {result.fitted.fontSize * 1.2}px; direction: rtl;"
								class="mx-auto border border-gray-400"
							>
								{result.original.text}
							</div>
						</div>
					</div>
					
					<!-- Stats -->
					<div class="grid grid-cols-3 gap-4 text-sm">
						<div>
							<span class="font-medium">Adjustment Made:</span> 
							<span class="{result.adjustmentMade ? 'text-green-600' : 'text-gray-500'}">
								{result.adjustmentMade ? 'Yes' : 'No'}
							</span>
						</div>
						<div>
							<span class="font-medium">Font Reduction:</span> 
							<span class="{result.fontReduction > 0 ? 'text-blue-600' : 'text-gray-500'}">
								{result.fontReduction}%
							</span>
						</div>
						<div>
							<span class="font-medium">Width Increase:</span> 
							<span class="{result.widthIncrease > 0 ? 'text-orange-600' : 'text-gray-500'}">
								{result.widthIncrease}%
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
		
		<div class="mt-8 p-4 bg-gray-50 rounded-lg">
			<h3 class="font-semibold mb-2">Integration in Renderer:</h3>
			<pre class="text-sm overflow-x-auto"><code>{`// In renderer.js or calculate-spacers.js:

// For specific header lines that must fit
const headerText = "גמרא. מתני׳ מאימתי קורין";
const fitted = fitSingleLine(
  headerText,
  fontFamily,
  fontSize,
  containerWidth,
  lineHeight,
  dummy,
  { preferFontAdjustment: true }
);

// Apply the adjusted values
element.style.fontSize = \`\${fitted.fontSize}px\`;
element.style.width = \`\${fitted.width}px\`;`}</code></pre>
		</div>
	{/if}
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&display=swap');
</style>