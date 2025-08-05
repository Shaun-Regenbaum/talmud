<script>
	import { onMount } from 'svelte';
	import '$lib/styles/talmud-text.css';
	
	let results = [];
	let loading = false;
	
	const testCases = [
		{ mesechta: 1, daf: '2', name: 'Berakhot 2a - First page with gdropcap' },
		{ mesechta: 1, daf: '64', name: 'Berakhot 64b - End with הדרן עלך' },
		{ mesechta: 2, daf: '5', name: 'Shabbat 5a - Regular page' },
		{ mesechta: 19, daf: '2', name: 'Gittin 2a - Check headers' }
	];
	
	async function analyzeAPIs() {
		loading = true;
		results = [];
		
		for (const test of testCases) {
			try {
				const response = await fetch(`/api/daf-supplier?mesechta=${test.mesechta}&daf=${test.daf}&br=true`);
				const data = await response.json();
				
				// Extract HTML elements
				const extractTags = (text) => {
					const tags = new Set();
					const regex = /<([^>]+)>/g;
					let match;
					while ((match = regex.exec(text)) !== null) {
						tags.add(match[1].split(' ')[0]);
					}
					return Array.from(tags);
				};
				
				// Check for specific patterns
				const analysis = {
					name: test.name,
					mainTags: extractTags(data.mainText || ''),
					rashiTags: extractTags(data.rashi || ''),
					tosafotTags: extractTags(data.tosafot || ''),
					hasGdropcap: data.mainText?.includes('gdropcap'),
					hasHadran: data.mainText?.includes('הדרן עלך'),
					hasFiveClass: data.rashi?.includes('class="five"'),
					hasShastitle7: data.tosafot?.includes('class="shastitle7"'),
					hasDivs: data.tosafot?.includes('<div'),
					samples: {
						mainFirst100: data.mainText?.substring(0, 100),
						rashiFirst100: data.rashi?.substring(0, 100),
						tosafotFirst100: data.tosafot?.substring(0, 100)
					}
				};
				
				results.push(analysis);
			} catch (error) {
				results.push({
					name: test.name,
					error: error.message
				});
			}
		}
		
		loading = false;
	}
	
	onMount(() => {
		analyzeAPIs();
	});
</script>

<style>
	.tag {
		display: inline-block;
		background-color: #e0e7ff;
		color: #3730a3;
		padding: 2px 8px;
		margin: 2px;
		border-radius: 4px;
		font-size: 0.875rem;
		font-family: monospace;
	}
	
	.sample {
		background-color: #f3f4f6;
		padding: 8px;
		margin: 4px 0;
		border-radius: 4px;
		font-size: 0.875rem;
		overflow-x: auto;
		white-space: pre-wrap;
		direction: rtl;
	}
	
	.check {
		color: #10b981;
		font-weight: bold;
	}
	
	.cross {
		color: #ef4444;
		font-weight: bold;
	}
</style>

<div class="max-w-6xl mx-auto p-6">
	<h1 class="text-2xl font-bold mb-6">Daf-Supplier API Analysis</h1>
	
	{#if loading}
		<p>Analyzing API responses...</p>
	{:else}
		<div class="space-y-8">
			{#each results as result}
				<div class="border rounded-lg p-4">
					<h2 class="text-lg font-semibold mb-4">{result.name}</h2>
					
					{#if result.error}
						<p class="text-red-600">Error: {result.error}</p>
					{:else}
						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
							<!-- Main Text Analysis -->
							<div>
								<h3 class="font-medium mb-2">Main Text</h3>
								<div class="text-sm space-y-1">
									<p>גדרופ קאפ (gdropcap): {result.hasGdropcap ? '✓' : '✗'} <span class={result.hasGdropcap ? 'check' : 'cross'}>{result.hasGdropcap ? 'Yes' : 'No'}</span></p>
									<p>הדרן עלך: {result.hasHadran ? '✓' : '✗'} <span class={result.hasHadran ? 'check' : 'cross'}>{result.hasHadran ? 'Yes' : 'No'}</span></p>
									<p>HTML Tags:</p>
									<div>
										{#each result.mainTags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								</div>
							</div>
							
							<!-- Rashi Analysis -->
							<div>
								<h3 class="font-medium mb-2">Rashi</h3>
								<div class="text-sm space-y-1">
									<p>class="five": {result.hasFiveClass ? '✓' : '✗'} <span class={result.hasFiveClass ? 'check' : 'cross'}>{result.hasFiveClass ? 'Yes' : 'No'}</span></p>
									<p>HTML Tags:</p>
									<div>
										{#each result.rashiTags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								</div>
							</div>
							
							<!-- Tosafot Analysis -->
							<div>
								<h3 class="font-medium mb-2">Tosafot</h3>
								<div class="text-sm space-y-1">
									<p>class="shastitle7": {result.hasShastitle7 ? '✓' : '✗'} <span class={result.hasShastitle7 ? 'check' : 'cross'}>{result.hasShastitle7 ? 'Yes' : 'No'}</span></p>
									<p>Has &lt;div&gt;: {result.hasDivs ? '✓' : '✗'} <span class={result.hasDivs ? 'check' : 'cross'}>{result.hasDivs ? 'Yes' : 'No'}</span></p>
									<p>HTML Tags:</p>
									<div>
										{#each result.tosafotTags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								</div>
							</div>
						</div>
						
						<!-- Samples -->
						<div class="mt-4">
							<h3 class="font-medium mb-2">Sample Text (First 100 chars)</h3>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
								<div>
									<p class="font-medium">Main:</p>
									<div class="sample">{result.samples.mainFirst100}</div>
								</div>
								<div>
									<p class="font-medium">Rashi:</p>
									<div class="sample">{result.samples.rashiFirst100}</div>
								</div>
								<div>
									<p class="font-medium">Tosafot:</p>
									<div class="sample">{result.samples.tosafotFirst100}</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		
		<div class="mt-8 p-4 bg-blue-50 rounded-lg">
			<h3 class="font-bold mb-2">Summary of Findings:</h3>
			<ul class="list-disc list-inside space-y-1 text-sm">
				<li><strong>Main Text:</strong> Uses <code>&lt;span class="gdropcap"&gt;</code> for first word, <code>&lt;span class="shastitle4"&gt;</code> for section headers</li>
				<li><strong>Rashi:</strong> Uses <code>&lt;span class="five"&gt;</code> for headers, <code>&lt;span class="mareimakom"&gt;</code> for references</li>
				<li><strong>Tosafot:</strong> Uses <code>&lt;span class="shastitle7"&gt;</code> for headers, wraps sections in <code>&lt;div&gt;</code> tags</li>
				<li><strong>הדרן עלך:</strong> Appears as plain text at the end of tractates</li>
				<li><strong>Renderer Processing:</strong> Converts <code>&lt;div&gt;</code> to <code>&lt;span&gt;</code> in commentary, strips <code>&lt;br&gt;</code> in non-linebreak mode</li>
			</ul>
		</div>
	{/if}
</div>