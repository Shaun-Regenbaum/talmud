<script lang="ts">
	import ElegantTimeline from '$lib/components/ElegantTimeline.svelte';
	import type { TimelinePeriod } from '$lib/components/ElegantTimeline.svelte';
	
	// Timeline data with refined colors
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
</script>

<div class="container mx-auto p-4 max-w-7xl">
	<h1 class="text-3xl font-bold mb-6">Timeline Component Demo</h1>
	
	<!-- Timeline -->
	<div class="space-y-6">
		<ElegantTimeline 
			periods={elegantPeriods}
			minYear={0}
			maxYear={1600}
		/>
		
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
			<h3 class="font-semibold text-blue-900 mb-2">Timeline Features:</h3>
			<ul class="text-sm text-blue-800 space-y-1">
				<li>• <strong>Minimalist aesthetic</strong> with focus on content</li>
				<li>• <strong>Smooth animations</strong> using tweened motion</li>
				<li>• <strong>Clean typography</strong> with SF Pro-inspired fonts</li>
				<li>• <strong>Subtle interactions</strong> with hover cards and selection</li>
				<li>• <strong>Elegant color palette</strong> with refined muted tones</li>
				<li>• <strong>Smart stacking</strong> to prevent period overlap</li>
				<li>• <strong>Responsive design</strong> adapts to screen size</li>
			</ul>
		</div>
	</div>
	
	<!-- Usage Example -->
	<div class="mt-8 bg-white rounded-lg shadow-md p-6">
		<h2 class="text-xl font-semibold mb-4">Usage Example</h2>
		
		<pre class="text-sm bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto"><code>{`import ElegantTimeline from '$lib/components/ElegantTimeline.svelte';
import type { TimelinePeriod } from '$lib/components/ElegantTimeline.svelte';

const periods: TimelinePeriod[] = [
  {
    id: 'period1',
    name: 'Period Name',
    hebrewName: 'שם בעברית',
    startYear: 100,
    endYear: 300,
    color: '#5E72E4',
    description: 'Description text',
    figures: [
      { name: 'Figure Name', hebrewName: 'שם', year: 150 }
    ]
  }
];

<ElegantTimeline
  {periods}
  minYear={0}
  maxYear={500}
/>`}</code></pre>
	</div>
</div>