<script lang="ts">
	import Timeline from '$lib/components/Timeline.svelte';
	import type { TimelineItem } from '$lib/components/Timeline.svelte';
	import ElegantTimeline from '$lib/components/ElegantTimeline.svelte';
	import type { TimelinePeriod } from '$lib/components/ElegantTimeline.svelte';
	
	// Sample data for Jewish historical periods
	const jewishPeriods: TimelineItem[] = [
		{
			id: 'tannaim',
			name: 'Tannaim',
			hebrewName: 'תנאים',
			startYear: 10,
			endYear: 220,
			color: '#3b82f6',
			description: 'The Tannaim were the rabbinic sages whose views are recorded in the Mishnah.',
			items: [
				{ name: 'Hillel', hebrewName: 'הלל', generation: 1 },
				{ name: 'Rabbi Akiva', hebrewName: 'רבי עקיבא', generation: 3 },
				{ name: 'Rabbi Meir', hebrewName: 'רבי מאיר', generation: 4 },
				{ name: 'Rabbi Yehuda HaNasi', hebrewName: 'רבי יהודה הנשיא', generation: 5 }
			]
		},
		{
			id: 'amoraim',
			name: 'Amoraim',
			hebrewName: 'אמוראים',
			startYear: 220,
			endYear: 500,
			color: '#10b981',
			description: 'The Amoraim were the rabbinic sages who produced the Talmud.',
			items: [
				{ name: 'Rav', hebrewName: 'רב', generation: 1, location: 'Babylon' },
				{ name: 'Shmuel', hebrewName: 'שמואל', generation: 1, location: 'Babylon' },
				{ name: 'Rabbi Yochanan', hebrewName: 'רבי יוחנן', generation: 2, location: 'Israel' },
				{ name: 'Rava', hebrewName: 'רבא', generation: 4, location: 'Babylon' },
				{ name: 'Abaye', hebrewName: 'אביי', generation: 4, location: 'Babylon' }
			]
		},
		{
			id: 'savoraim',
			name: 'Savoraim',
			hebrewName: 'סבוראים',
			startYear: 500,
			endYear: 650,
			color: '#f59e0b',
			description: 'The Savoraim were the sages who gave the final touches to the Talmud.',
			items: []
		},
		{
			id: 'geonim',
			name: 'Geonim',
			hebrewName: 'גאונים',
			startYear: 650,
			endYear: 1050,
			color: '#ef4444',
			description: 'The Geonim were the presidents of the two great Babylonian academies.',
			items: [
				{ name: 'Saadia Gaon', hebrewName: 'רב סעדיה גאון', year: 928 },
				{ name: 'Sherira Gaon', hebrewName: 'רב שרירא גאון', year: 968 }
			]
		},
		{
			id: 'rishonim',
			name: 'Rishonim',
			hebrewName: 'ראשונים',
			startYear: 1050,
			endYear: 1500,
			color: '#8b5cf6',
			description: 'The Rishonim were the leading rabbis and poskim of the medieval period.',
			items: [
				{ name: 'Rashi', hebrewName: 'רש"י', year: 1040, location: 'France' },
				{ name: 'Rambam', hebrewName: 'רמב"ם', year: 1138, location: 'Spain/Egypt' },
				{ name: 'Ramban', hebrewName: 'רמב"ן', year: 1194, location: 'Spain' },
				{ name: 'Rosh', hebrewName: 'רא"ש', year: 1250, location: 'Germany/Spain' }
			]
		}
	];
	
	// Sample project timeline
	const projectTimeline: TimelineItem[] = [
		{
			id: 'planning',
			name: 'Planning Phase',
			startYear: 0,
			endYear: 30,
			color: '#3b82f6',
			description: 'Initial project planning and requirements gathering'
		},
		{
			id: 'design',
			name: 'Design Phase',
			startYear: 20,
			endYear: 60,
			color: '#10b981',
			description: 'UI/UX design and architecture planning'
		},
		{
			id: 'development',
			name: 'Development',
			startYear: 50,
			endYear: 150,
			color: '#f59e0b',
			description: 'Core development and implementation'
		},
		{
			id: 'testing',
			name: 'Testing',
			startYear: 120,
			endYear: 180,
			color: '#ef4444',
			description: 'Quality assurance and bug fixes'
		},
		{
			id: 'deployment',
			name: 'Deployment',
			startYear: 170,
			endYear: 200,
			color: '#8b5cf6',
			description: 'Production deployment and monitoring'
		}
	];
	
	// Elegant timeline data with refined colors
	const elegantPeriods: TimelinePeriod[] = [
		{
			id: 'tannaim',
			name: 'Tannaim',
			hebrewName: 'תנאים',
			startYear: 10,
			endYear: 220,
			color: '#5E72E4',  // Soft indigo
			description: 'The rabbinic sages whose views are recorded in the Mishnah, from approximately 10-220 CE.',
			figures: [
				{ name: 'Hillel the Elder', hebrewName: 'הלל הזקן' },
				{ name: 'Rabbi Akiva', hebrewName: 'רבי עקיבא' },
				{ name: 'Rabbi Meir', hebrewName: 'רבי מאיר' },
				{ name: 'Rabbi Judah HaNasi', hebrewName: 'רבי יהודה הנשיא' }
			]
		},
		{
			id: 'amoraim',
			name: 'Amoraim',
			hebrewName: 'אמוראים',
			startYear: 220,
			endYear: 500,
			color: '#00B8D4',  // Refined teal
			description: 'The rabbinic sages who produced the Gemara, the commentary on the Mishnah.',
			figures: [
				{ name: 'Rav', hebrewName: 'רב' },
				{ name: 'Shmuel', hebrewName: 'שמואל' },
				{ name: 'Rabbi Yochanan', hebrewName: 'רבי יוחנן' },
				{ name: 'Rava', hebrewName: 'רבא' }
			]
		},
		{
			id: 'savoraim',
			name: 'Savoraim',
			hebrewName: 'סבוראים',
			startYear: 500,
			endYear: 650,
			color: '#FFB400',  // Warm amber
			description: 'The sages who gave the final touches to the Babylonian Talmud.'
		},
		{
			id: 'geonim',
			name: 'Geonim',
			hebrewName: 'גאונים',
			startYear: 650,
			endYear: 1050,
			color: '#F5365C',  // Sophisticated coral
			description: 'The presidents of the two great Babylonian Talmudic Academies.',
			figures: [
				{ name: 'Saadia Gaon', hebrewName: 'רב סעדיה גאון', year: 928 }
			]
		},
		{
			id: 'rishonim',
			name: 'Rishonim',
			hebrewName: 'ראשונים',
			startYear: 1050,
			endYear: 1500,
			color: '#825EE4',  // Elegant purple
			description: 'The leading rabbis and poskim of the medieval period.',
			figures: [
				{ name: 'Rashi', hebrewName: 'רש"י', year: 1040 },
				{ name: 'Rambam', hebrewName: 'רמב"ם', year: 1138 },
				{ name: 'Ramban', hebrewName: 'רמב"ן', year: 1194 }
			]
		}
	];
	
	let selectedExample = 'elegant';
</script>

<div class="container mx-auto p-4 max-w-7xl">
	<h1 class="text-3xl font-bold mb-6">Timeline Component Demo</h1>
	
	<!-- Example selector -->
	<div class="mb-6">
		<div class="flex gap-4 mb-4">
			<button
				class="px-4 py-2 rounded-lg font-medium transition-colors"
				class:bg-blue-600={selectedExample === 'elegant'}
				class:text-white={selectedExample === 'elegant'}
				class:bg-gray-200={selectedExample !== 'elegant'}
				on:click={() => selectedExample = 'elegant'}
			>
				Elegant Timeline (New)
			</button>
			<button
				class="px-4 py-2 rounded-lg font-medium transition-colors"
				class:bg-blue-600={selectedExample === 'jewish'}
				class:text-white={selectedExample === 'jewish'}
				class:bg-gray-200={selectedExample !== 'jewish'}
				on:click={() => selectedExample = 'jewish'}
			>
				Original Timeline
			</button>
			<button
				class="px-4 py-2 rounded-lg font-medium transition-colors"
				class:bg-blue-600={selectedExample === 'project'}
				class:text-white={selectedExample === 'project'}
				class:bg-gray-200={selectedExample !== 'project'}
				on:click={() => selectedExample = 'project'}
			>
				Project Timeline
			</button>
		</div>
	</div>
	
	<!-- Elegant Timeline (New Design) -->
	{#if selectedExample === 'elegant'}
		<div class="space-y-6">
			<ElegantTimeline 
				periods={elegantPeriods}
				minYear={0}
				maxYear={1600}
			/>
			
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 class="font-semibold text-blue-900 mb-2">Apple-Inspired Design Features:</h3>
				<ul class="text-sm text-blue-800 space-y-1">
					<li>• <strong>Minimalist aesthetic</strong> with focus on content</li>
					<li>• <strong>Smooth animations</strong> using tweened motion</li>
					<li>• <strong>Clean typography</strong> with SF Pro-inspired fonts</li>
					<li>• <strong>Subtle interactions</strong> with hover cards and selection</li>
					<li>• <strong>Elegant color palette</strong> with proper contrast</li>
					<li>• <strong>Refined details</strong> like edge gradients and shadows</li>
				</ul>
			</div>
		</div>
	{/if}
	
	<!-- Jewish Historical Timeline -->
	{#if selectedExample === 'jewish'}
		<div class="space-y-6">
			<Timeline
				items={jewishPeriods}
				title="Jewish Historical Periods"
				minYear={0}
				maxYear={1600}
				height={300}
				showAxis={true}
				showMarkers={true}
				interactive={true}
			/>
			
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 class="font-semibold text-blue-900 mb-2">Interactive Features:</h3>
				<ul class="text-sm text-blue-800 space-y-1">
					<li>• <strong>Hover</strong> over periods to see details and duration</li>
					<li>• <strong>Click</strong> on a period to see detailed information and key figures</li>
					<li>• <strong>Move cursor</strong> across timeline to see specific years</li>
					<li>• Periods automatically <strong>stack</strong> when they overlap</li>
					<li>• <strong>Responsive design</strong> adapts to screen size</li>
				</ul>
			</div>
		</div>
	{/if}
	
	<!-- Project Timeline -->
	{#if selectedExample === 'project'}
		<div class="space-y-6">
			<Timeline
				items={projectTimeline}
				title="Project Timeline (Days)"
				minYear={0}
				maxYear={200}
				height={250}
				showAxis={true}
				showMarkers={true}
				interactive={true}
			/>
			
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<h3 class="font-semibold text-green-900 mb-2">Timeline Features:</h3>
				<ul class="text-sm text-green-800 space-y-1">
					<li>• <strong>Overlapping phases</strong> show concurrent work</li>
					<li>• <strong>Color coding</strong> for different types of activities</li>
					<li>• <strong>Duration indicators</strong> appear on hover</li>
					<li>• <strong>Smart stacking</strong> prevents overlap</li>
					<li>• <strong>Smooth animations</strong> on load and interaction</li>
				</ul>
			</div>
		</div>
	{/if}
	
	<!-- Component Features -->
	<div class="mt-8 bg-white rounded-lg shadow-md p-6">
		<h2 class="text-xl font-semibold mb-4">Component Features</h2>
		
		<div class="grid md:grid-cols-2 gap-6">
			<div>
				<h3 class="font-semibold mb-2">Visual Features</h3>
				<ul class="text-sm text-gray-600 space-y-1">
					<li>✓ Gradient background for depth</li>
					<li>✓ Automatic axis scaling</li>
					<li>✓ Smart label positioning</li>
					<li>✓ Color-coded periods</li>
					<li>✓ Hebrew text support</li>
					<li>✓ Responsive design</li>
				</ul>
			</div>
			
			<div>
				<h3 class="font-semibold mb-2">Interactive Features</h3>
				<ul class="text-sm text-gray-600 space-y-1">
					<li>✓ Hover tooltips with details</li>
					<li>✓ Click for expanded information</li>
					<li>✓ Interactive cursor with year display</li>
					<li>✓ Smooth animations and transitions</li>
					<li>✓ Touch-friendly on mobile</li>
					<li>✓ Keyboard accessible</li>
				</ul>
			</div>
		</div>
		
		<div class="mt-6 p-4 bg-gray-50 rounded-lg">
			<h3 class="font-semibold mb-2">Usage Example</h3>
			<pre class="text-sm bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto"><code>{`import Timeline from '$lib/components/Timeline.svelte';

const items = [
  {
    id: 'period1',
    name: 'Period Name',
    hebrewName: 'שם בעברית',
    startYear: 100,
    endYear: 300,
    color: '#3b82f6',
    description: 'Description text',
    items: [
      { name: 'Sub-item', generation: 1 }
    ]
  }
];

<Timeline
  {items}
  title="My Timeline"
  minYear={0}
  maxYear={500}
  height={250}
  interactive={true}
/>`}</code></pre>
		</div>
	</div>
</div>