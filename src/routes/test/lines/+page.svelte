<script>
	import { onMount } from 'svelte';
	
	let tractate = 'Berakhot';
	let daf = '2';
	let loading = false;
	let error = null;
	let results = null;
	let forceRefresh = false; // Add state for cache bypass
	
	// Tractate options
	const tractates = [
		{ value: 'Berakhot', mesechta: '1' },
		{ value: 'Shabbat', mesechta: '2' },
		{ value: 'Eruvin', mesechta: '3' },
		{ value: 'Pesachim', mesechta: '4' },
		{ value: 'Shekalim', mesechta: '5' },
		{ value: 'Yoma', mesechta: '6' },
		{ value: 'Sukkah', mesechta: '7' },
		{ value: 'Beitzah', mesechta: '8' },
		{ value: 'Rosh Hashanah', mesechta: '9' },
		{ value: 'Taanit', mesechta: '10' },
		{ value: 'Megillah', mesechta: '11' },
		{ value: 'Moed Katan', mesechta: '12' },
		{ value: 'Chagigah', mesechta: '13' }
	];
	
	// Helper function to convert daf format to daf-supplier format
	function convertDafToSupplierFormat(dafStr) {
		// Parse the daf string (e.g., "2a" or "2b" or just "2")
		const pageNum = parseInt(dafStr.replace(/[ab]/, ''));
		const amud = dafStr.includes('b') ? 'b' : 'a';
		
		// daf-supplier numbering: 2a=2, 2b=3, 3a=4, 3b=5, etc.
		// Formula: for page N amud a: (N-1)*2 + 2
		//          for page N amud b: (N-1)*2 + 3
		const dafSupplierNum = (pageNum - 1) * 2 + (amud === 'a' ? 2 : 3);
		return dafSupplierNum.toString();
	}
	
	async function fetchAndAnalyze(bypassCache = false) {
		loading = true;
		error = null;
		results = null;
		
		try {
			// Get mesechta ID
			const selectedTractate = tractates.find(t => t.value === tractate);
			if (!selectedTractate) {
				throw new Error('Invalid tractate selected');
			}
			
			// Convert daf format for daf-supplier
			const convertedDaf = convertDafToSupplierFormat(daf);
			
			// Fetch from daf-supplier with br=true for line breaks, add nocache if bypassing
			const url = `/api/daf-supplier?mesechta=${selectedTractate.mesechta}&daf=${convertedDaf}&br=true${bypassCache ? '&nocache=true' : ''}`;
			console.log('Fetching:', url);
			console.log(`Converted ${daf} to daf-supplier format: ${convertedDaf}, bypassCache: ${bypassCache}`);
			
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			const data = await response.json();
			console.log('Raw data:', data);
			
			// Analyze lines
			const mainLines = analyzeText(data.mainText || '', 'Main Text');
			const rashiLines = analyzeText(data.rashi || '', 'Rashi');
			const tosafotLines = analyzeText(data.tosafot || '', 'Tosafot');
			
			results = {
				tractate: data.tractate,
				daf: data.daf,
				amud: data.amud,
				analysis: {
					mainText: mainLines,
					rashi: rashiLines,
					tosafot: tosafotLines
				},
				raw: data
			};
			
		} catch (err) {
			console.error('Error:', err);
			error = err.message;
		} finally {
			loading = false;
		}
	}
	
	function stripHtml(html) {
		// First convert line break tags to newlines for analysis
		let text = html.replace(/<br\s*\/?>/gi, '\n');  // Convert <br> and <br/> to newlines
		text = text.replace(/<wbr>/g, '\n');  // Convert <wbr> to newlines as well
		// Then remove other HTML tags and decode entities
		text = text.replace(/<[^>]*>/g, '');
		// Decode common HTML entities
		text = text.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'");
		return text;
	}
	
	function analyzeText(text, label) {
		if (!text) return { label, lines: [], stats: {}, lengthCategories: {} };
		
		// Strip HTML before analysis
		text = stripHtml(text);
		
		// Split by line breaks
		const lines = text.split(/\r?\n/);
		
		// Count non-empty lines seen so far (for determining "start" lines)
		let nonEmptyLineCount = 0;
		
		// Analyze each line
		const lineAnalysis = lines.map((line, index) => {
			const trimmed = line.trim();
			const len = line.length;
			
			// Track non-empty lines for Rashi/Tosafot start detection
			const isNonEmpty = trimmed.length > 0;
			if (isNonEmpty) {
				nonEmptyLineCount++;
			}
			
			// Categorize by length ranges
			let lengthCategory = '';
			let displayCategory = '';
			
			// Check if this is a "start" line (first 4 non-empty lines for Rashi/Tosafot)
			const isStart = (label !== 'Main Text') && isNonEmpty && nonEmptyLineCount <= 4;
			
			// Use trimmed length for categorization to properly identify empty lines
			if (trimmed.length === 0) {
				lengthCategory = 'empty';
				displayCategory = 'empty';
			} else if (len <= 20) {
				lengthCategory = 'single';
				displayCategory = 'single';
			} else if (label !== 'Main Text') {
				// Rashi/Tosafot categorization
				if (len <= 38) {
					lengthCategory = 'short';
					displayCategory = 'short';
				} else if (len <= 80) {
					lengthCategory = 'half';
					displayCategory = 'half';
				} else {
					lengthCategory = 'long';
					displayCategory = 'long';
				}
			} else {
				// Main Text categorization
				if (len <= 58) {
					lengthCategory = 'short';
					displayCategory = 'short';
				} else if (len <= 85) {
					lengthCategory = 'medium';
					displayCategory = 'medium';
				} else {
					lengthCategory = 'long';
					displayCategory = 'long';
				}
			}
			
			return {
				index,
				content: line,
				length: line.length,
				trimmedLength: trimmed.length,
				isEmpty: trimmed.length === 0,
				startsWithSpace: line.length > 0 && line[0] === ' ',
				endsWithSpace: line.length > 0 && line[line.length - 1] === ' ',
				hasHebrewChars: /[\u0590-\u05FF]/.test(line),
				hasNumbers: /\d/.test(line),
				hasSpecialChars: /[<>{}()]/.test(line),
				lengthCategory,
				displayCategory,
				isStart,  // Add as a boolean flag
				isRashiStart: /^[א-ת]"[א-ת]/.test(trimmed) || /^[א-ת][א-ת]"[א-ת]/.test(trimmed)
			};
		});
		
		// Group lines by length category
		const lengthCategories = {};
		lineAnalysis.forEach(line => {
			if (!lengthCategories[line.lengthCategory]) {
				lengthCategories[line.lengthCategory] = {
					count: 0,
					lines: []
				};
			}
			lengthCategories[line.lengthCategory].count++;
			lengthCategories[line.lengthCategory].lines.push(line.index);
		});
		
		// Calculate statistics
		const nonEmptyLines = lineAnalysis.filter(l => !l.isEmpty);
		const stats = {
			totalLines: lines.length,
			nonEmptyLines: nonEmptyLines.length,
			averageLength: lines.length > 0 ? lineAnalysis.reduce((sum, l) => sum + l.length, 0) / lines.length : 0,
			maxLength: lineAnalysis.length > 0 ? Math.max(...lineAnalysis.map(l => l.length)) : 0,
			minLength: nonEmptyLines.length > 0 ? Math.min(...nonEmptyLines.map(l => l.length)) : 0,
			linesWithSpaces: lineAnalysis.filter(l => l.startsWithSpace || l.endsWithSpace).length,
			rashiStartLines: lineAnalysis.filter(l => l.isRashiStart).length
		};
		
		// Calculate spacer requirements based on line categories
		const spacerCalculations = calculateSpacers(lineAnalysis, label);
		
		return {
			label,
			lines: lineAnalysis,
			stats,
			lengthCategories,
			spacerCalculations
		};
	}
	
	function calculateSpacers(lines, label) {
		// Group consecutive lines by category to identify layout blocks
		const blocks = [];
		let currentBlock = null;
		
		lines.forEach((line, index) => {
			if (!currentBlock || currentBlock.category !== line.displayCategory) {
				// Start new block
				currentBlock = {
					category: line.displayCategory,
					startIndex: index,
					endIndex: index,
					lines: [line],
					totalLength: line.length
				};
				blocks.push(currentBlock);
			} else {
				// Continue current block
				currentBlock.endIndex = index;
				currentBlock.lines.push(line);
				currentBlock.totalLength += line.length;
			}
		});
		
		// Calculate spacer requirements
		const spacerData = {
			blocks,
			totalBlocks: blocks.length,
			// Count transitions between different categories
			transitions: blocks.length - 1,
			// Calculate layout metrics
			layoutMetrics: {
				shortToMedium: 0,
				mediumToLong: 0,
				singleToLong: 0,
				emptyBetweenContent: 0
			}
		};
		
		// Analyze transitions
		for (let i = 0; i < blocks.length - 1; i++) {
			const current = blocks[i];
			const next = blocks[i + 1];
			
			if (current.category === 'short' && next.category === 'medium') {
				spacerData.layoutMetrics.shortToMedium++;
			} else if (current.category === 'medium' && next.category === 'long') {
				spacerData.layoutMetrics.mediumToLong++;
			} else if (current.category === 'single' && next.category === 'long') {
				spacerData.layoutMetrics.singleToLong++;
			} else if (current.category !== 'empty' && next.category !== 'empty' && 
					   blocks[i + 1] && blocks[i + 1].category === 'empty') {
				spacerData.layoutMetrics.emptyBetweenContent++;
			}
		}
		
		// Calculate average lines per block type
		const blocksByCategory = {};
		blocks.forEach(block => {
			if (!blocksByCategory[block.category]) {
				blocksByCategory[block.category] = {
					count: 0,
					totalLines: 0,
					blocks: []
				};
			}
			blocksByCategory[block.category].count++;
			blocksByCategory[block.category].totalLines += block.lines.length;
			blocksByCategory[block.category].blocks.push(block);
		});
		
		// Calculate averages
		Object.keys(blocksByCategory).forEach(category => {
			const data = blocksByCategory[category];
			data.averageLinesPerBlock = data.totalLines / data.count;
		});
		
		spacerData.blocksByCategory = blocksByCategory;
		
		// Estimate spacer needs based on category patterns
		spacerData.estimatedSpacers = estimateSpacerNeeds(blocks, label);
		
		return spacerData;
	}
	
	function estimateSpacerNeeds(blocks, label) {
		const spacers = [];
		
		blocks.forEach((block, index) => {
			// Skip last block
			if (index === blocks.length - 1) return;
			
			const nextBlock = blocks[index + 1];
			
			// Determine spacer type based on transition
			let spacerType = 'none';
			let spacerSize = 0;
			
			// Rules for spacer insertion
			if (block.category === 'start' && nextBlock.category !== 'start') {
				spacerType = 'after-header';
				spacerSize = 20; // pixels
			} else if (block.category === 'long' && nextBlock.category === 'single') {
				spacerType = 'paragraph-break';
				spacerSize = 15;
			} else if (block.category === 'medium' && nextBlock.category === 'long') {
				spacerType = 'section-transition';
				spacerSize = 10;
			} else if (nextBlock.category === 'empty') {
				spacerType = 'natural-break';
				spacerSize = 0; // Empty line provides its own spacing
			}
			
			if (spacerType !== 'none') {
				spacers.push({
					afterIndex: block.endIndex,
					beforeIndex: nextBlock.startIndex,
					type: spacerType,
					size: spacerSize,
					fromCategory: block.category,
					toCategory: nextBlock.category
				});
			}
		});
		
		return spacers;
	}
	
	onMount(() => {
		fetchAndAnalyze();
	});
</script>

<div class="container mx-auto p-4 max-w-6xl">
	<h1 class="text-2xl font-bold mb-4">Daf Line Analysis</h1>
	
	<!-- Controls -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
		<div class="flex gap-4 items-end">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Tractate</label>
				<select 
					bind:value={tractate}
					class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					{#each tractates as t}
						<option value={t.value}>{t.value}</option>
					{/each}
				</select>
			</div>
			
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Daf</label>
				<input 
					type="text"
					bind:value={daf}
					placeholder="e.g., 2a, 3b"
					class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<button 
				on:click={() => fetchAndAnalyze()}
				disabled={loading}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Loading...' : 'Analyze'}
			</button>
			
			<button 
				on:click={() => fetchAndAnalyze(true)}
				disabled={loading}
				class="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
				title="Bypass cache and force fresh fetch from HebrewBooks"
			>
				{loading ? 'Refreshing...' : 'Force Refresh'}
			</button>
		</div>
	</div>
	
	<!-- Error Message -->
	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
			{error}
		</div>
	{/if}
	
	<!-- Results -->
	{#if results}
		<div class="space-y-6">
			<!-- Summary -->
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
				<h2 class="text-lg font-semibold mb-2">
					{results.tractate} {results.daf}{results.amud}
				</h2>
				<div class="grid grid-cols-3 gap-4 text-sm">
					<div>
						<span class="font-medium">Main Text:</span> 
						{results.analysis.mainText.stats.totalLines} lines
					</div>
					<div>
						<span class="font-medium">Rashi:</span> 
						{results.analysis.rashi.stats.totalLines} lines
					</div>
					<div>
						<span class="font-medium">Tosafot:</span> 
						{results.analysis.tosafot.stats.totalLines} lines
					</div>
				</div>
			</div>
			
			<!-- Detailed Analysis -->
			{#each ['mainText', 'rashi', 'tosafot'] as textType}
				{@const analysis = results.analysis[textType]}
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
					<h3 class="text-lg font-semibold mb-3">{analysis.label}</h3>
					
					<!-- Statistics -->
					<div class="bg-gray-50 p-3 rounded mb-4">
						<h4 class="font-medium mb-2">Statistics</h4>
						<div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
							<div>Total lines: {analysis.stats.totalLines}</div>
							<div>Non-empty: {analysis.stats.nonEmptyLines}</div>
							<div>Avg length: {analysis.stats.averageLength ? analysis.stats.averageLength.toFixed(1) : '0'}</div>
							<div>Max length: {analysis.stats.maxLength}</div>
							<div>Min length: {analysis.stats.minLength || 0}</div>
							<div>With spaces: {analysis.stats.linesWithSpaces}</div>
							{#if analysis.stats.rashiStartLines > 0}
								<div>Rashi starts: {analysis.stats.rashiStartLines}</div>
							{/if}
						</div>
					</div>
					
					<!-- Length Categories -->
					{#if Object.keys(analysis.lengthCategories).length > 0}
						<div class="bg-blue-50 p-3 rounded mb-4">
							<h4 class="font-medium mb-2">Length Categories</h4>
							<div class="space-y-1 text-sm">
								{#each Object.entries(analysis.lengthCategories).sort((a, b) => {
									const order = ['empty', 'half', 'single', 'short', 'medium', 'long'];
									return order.indexOf(a[0]) - order.indexOf(b[0]);
								}) as [category, data]}
									<div class="flex justify-between">
										<span>{category}:</span>
										<span class="font-mono">{data.count} lines (lines: {data.lines.slice(0, 5).join(', ')}{data.lines.length > 5 ? '...' : ''})</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					
					<!-- Line Details -->
					<div class="space-y-2">
						<h4 class="font-medium">Line Details</h4>
						<div class="max-h-96 overflow-y-auto border border-gray-200 rounded">
							<table class="w-full text-sm">
								<thead class="bg-gray-50 sticky top-0">
									<tr>
										<th class="px-2 py-1 text-left">#</th>
										<th class="px-2 py-1 text-left">Length</th>
										<th class="px-2 py-1 text-left">Category</th>
										<th class="px-2 py-1 text-left">Flags</th>
										<th class="px-2 py-1 text-right">Content</th>
									</tr>
								</thead>
								<tbody>
									{#each analysis.lines as line}
										<tr class="border-b hover:bg-gray-50">
											<td class="px-2 py-1">{line.index}</td>
											<td class="px-2 py-1">{line.length}</td>
											<td class="px-2 py-1">
												<span class="text-xs font-mono">{line.displayCategory}</span>
											</td>
											<td class="px-2 py-1">
												{#if line.isEmpty}
													<span class="text-xs bg-gray-200 px-1 rounded">empty</span>
												{/if}
												{#if line.startsWithSpace}
													<span class="text-xs bg-yellow-200 px-1 rounded">space→</span>
												{/if}
												{#if line.endsWithSpace}
													<span class="text-xs bg-yellow-200 px-1 rounded">←space</span>
												{/if}
												{#if line.hasSpecialChars}
													<span class="text-xs bg-blue-200 px-1 rounded">special</span>
												{/if}
												{#if line.isRashiStart}
													<span class="text-xs bg-green-200 px-1 rounded">rashi</span>
												{/if}
												{#if line.isStart}
													<span class="text-xs bg-purple-200 px-1 rounded">start</span>
												{/if}
											</td>
											<td class="px-2 py-1 text-right font-mono text-xs" dir="rtl">
												{#if line.isEmpty}
													<span class="text-gray-400">[empty line]</span>
												{:else}
													{line.content}
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
					
					<!-- Text Flow Pattern -->
					{#if analysis.spacerCalculations}
						<div class="bg-purple-50 p-3 rounded mt-4">
							<h4 class="font-medium mb-2">Text Flow Pattern</h4>
							<div class="flex flex-wrap gap-1">
								{#each analysis.spacerCalculations.blocks as block}
									{@const colors = {
										empty: 'bg-gray-200',
										single: 'bg-yellow-200',
										short: 'bg-blue-200',
										half: 'bg-purple-200',
										medium: 'bg-green-200',
										long: 'bg-red-200'
									}}
									<div 
										class="px-2 py-1 text-xs rounded {colors[block.category] || 'bg-gray-100'}"
										title="{block.category}: lines {block.startIndex}-{block.endIndex} ({block.lines.length} lines)"
									>
										{block.category}
										<span class="text-gray-600">({block.lines.length})</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/each}
			
			<!-- Raw Data -->
			<details class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
				<summary class="cursor-pointer font-semibold">Raw Response Data</summary>
				<pre class="mt-4 p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-lg">{JSON.stringify(results.raw, null, 2)}</pre>
			</details>
		</div>
	{/if}
</div>

<style>
	/* Ensure Hebrew text displays properly */
	[dir="rtl"] {
		text-align: right;
		unicode-bidi: embed;
	}
</style>