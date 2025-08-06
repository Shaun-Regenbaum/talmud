<script lang="ts">
	import Timeline from '$lib/components/Timeline.svelte';
</script>

<div class="container mx-auto p-4 max-w-7xl">
	<h1 class="text-3xl font-bold mb-8">Timeline Component Demo</h1>
	
	<!-- Basic Timeline -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">Basic Timeline (No Highlights)</h2>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline />
		</div>
	</div>

	<!-- With Highlighted Period -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">With Highlighted Period (Tannaim)</h2>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				highlightedPeriods={['Tannaim']}
			/>
		</div>
	</div>

	<!-- With Highlighted Dates -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">With Highlighted Dates (70 CE, 200 CE)</h2>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				highlightedDates={[70, 200]}
			/>
		</div>
	</div>

	<!-- With Highlighted Ranges -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">With Highlighted Ranges</h2>
		<p class="text-sm text-gray-600 mb-2">Rabbi Akiva's generation (120-140 CE) and Abaye/Rava's generation (320-350 CE) with custom colors</p>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				highlightedRanges={[
					{ start: 120, end: 140, label: "R' Akiva" },
					{ start: 320, end: 350, label: "Abaye/Rava", color: '#7c3aed' }
				]}
			/>
		</div>
	</div>

	<!-- Combined: Dates and Ranges -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">Combined: Highlighted Dates and Ranges</h2>
		<p class="text-sm text-gray-600 mb-2">Temple destruction (70 CE), Mishnah compiled (200 CE), plus Rabbi Akiva's generation</p>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				highlightedDates={[70, 200]}
				highlightedRanges={[
					{ start: 120, end: 140 }
				]}
			/>
		</div>
	</div>

	<!-- With Custom Events -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">With Custom Events</h2>
		<p class="text-sm text-gray-600 mb-2">Adding custom events like "Rashi born" (1040 CE) and "Rambam born" (1138 CE)</p>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				startYear={-200}
				endYear={1200}
				customEvents={[
					{ year: 1040, label: 'Rashi born', type: 'custom' },
					{ year: 1138, label: 'Rambam born', type: 'custom' }
				]}
			/>
		</div>
	</div>

	<!-- All Features Combined -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold mb-3">All Features Combined</h2>
		<p class="text-sm text-gray-600 mb-2">Amoraim period highlighted, with specific dates and ranges</p>
		<div class="border border-gray-200 rounded-lg p-4">
			<Timeline 
				highlightedPeriods={['Amoraim']}
				highlightedDates={[70, 500]}
				highlightedRanges={[
					{ start: 320, end: 350, label: 'Gen 4' }
				]}
			/>
		</div>
	</div>

	<div class="space-y-6">
		
		<div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
			<h3 class="font-semibold text-gray-900 mb-2">Timeline Features:</h3>
			<ul class="text-sm text-gray-700 space-y-1">
				<li>• <strong>Accurate time spacing</strong> - Events positioned proportionally to actual years</li>
				<li>• <strong>Period highlighting</strong> - Highlight specific Talmudic periods</li>
				<li>• <strong>Date markers</strong> - Add custom date markers with labels</li>
				<li>• <strong>Range highlighting</strong> - Highlight specific time ranges</li>
				<li>• <strong>Generation markers</strong> - Subtle lines showing generational divisions</li>
				<li>• <strong>Minimalist design</strong> - Clean black and white aesthetic</li>
				<li>• <strong>Major events</strong> - Key historical events marked with dots</li>
			</ul>
		</div>
	</div>
	
	<!-- Usage Example -->
	<div class="mt-8 bg-white rounded-lg shadow-md p-6">
		<h2 class="text-xl font-semibold mb-4">Usage Example</h2>
		
		<pre class="text-sm bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto"><code>{`import Timeline from '$lib/components/Timeline.svelte';

// Highlight specific periods and dates
const highlightedPeriods = ['Tannaim', 'Amoraim'];
const highlightedDates = [70, 200]; // Temple destruction, Mishnah compiled
const highlightedRanges = [
  { start: 120, end: 140 }, // Rabbi Akiva's generation
  { start: 320, end: 350 }  // Abaye and Rava's generation
];

<Timeline 
  {highlightedPeriods}
  {highlightedDates}
  {highlightedRanges}
/>`}</code></pre>
	</div>
</div>