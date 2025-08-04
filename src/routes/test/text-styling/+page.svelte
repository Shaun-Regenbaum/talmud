<script>
	import { onMount } from 'svelte';
	import { processTextsForRenderer } from '$lib/text-processor';
	import '$lib/styles/talmud-text.css';
	
	let container;
	
	const testTexts = {
		main: `מתני׳ האב זוכה לבתו בקידושיה בכסף בשטר ובביאה זוכה במציאתה ובמעשה ידיה ובהפרת נדריה|
		הדרן עלך האב זוכה|
		ומקבל את גיטה ואינו אוכל פירות בחייה נישאת יתר עליו הבעל שאוכל פירות בחייה`,
		rashi: `<span class="five">מתני׳</span> האב זוכה לבתו - פירש״י שזוכה בקידושיה<br>
		<span class="five">בכסף בשטר ובביאה</span> - אלו שלשה דרכי קידושין<br>
		<span class="five">זוכה במציאתה</span> - כל מה שמוצאת שלו`,
		tosafot: `<span class="shastitle7">האב זוכה</span> - תוספות מפרשים שזוכה דווקא בקטנותה<br>
		<span class="shastitle7">בכסף</span> - פרוטה או שוה פרוטה<br>
		<span class="shastitle7">בשטר</span> - שכותב לה הרי את מקודשת לי`
	};
	
	onMount(() => {
		const { mainHTML, rashiHTML, tosafotHTML } = processTextsForRenderer(
			testTexts.main,
			testTexts.rashi,
			testTexts.tosafot
		);
		
		container.innerHTML = `
			<div class="text-section">
				<h3>Main Text (Gemara)</h3>
				<div class="gemara-text" style="direction: rtl; text-align: justify; line-height: 1.8;">
					${mainHTML}
				</div>
			</div>
			
			<div class="text-section">
				<h3>Rashi</h3>
				<div class="rashi-text" style="direction: rtl; text-align: justify; line-height: 1.6;">
					${rashiHTML}
				</div>
			</div>
			
			<div class="text-section">
				<h3>Tosafot</h3>
				<div class="tosafot-text" style="direction: rtl; text-align: justify; line-height: 1.6;">
					${tosafotHTML}
				</div>
			</div>
		`;
	});
</script>

<style>
	:global(.text-section) {
		margin: 2rem 0;
		padding: 1rem;
		border: 1px solid #ccc;
		border-radius: 8px;
	}
	
	:global(.text-section h3) {
		margin-bottom: 1rem;
		color: #333;
	}
	
</style>

<div class="max-w-4xl mx-auto p-6">
	<h1 class="text-2xl font-bold mb-6">Text Styling Test</h1>
	
	<div bind:this={container}></div>
	
	<div class="mt-6 p-4 bg-gray-100 rounded">
		<h3 class="font-bold mb-2">Styling Rules Applied:</h3>
		<ul class="list-disc list-inside space-y-1 text-sm">
			<li>הדרן עלך text: 1.5x size</li>
			<li>First word of Gemara: 3em size (3-4 lines tall)</li>
			<li>Rashi/Tosafot headers (span.five and span.shastitle7): Bold (600) and 1.1x size</li>
		</ul>
	</div>
</div>