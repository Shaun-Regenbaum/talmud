<script lang="ts">
	import { onMount } from 'svelte';
	
	let tractate = 'Berakhot';
	let daf = '12a';
	let sefariaData: any = null;
	let hebrewBooksData: any = null;
	let isLoading = false;
	let error = '';
	
	// Map tractate names to numeric IDs for daf-supplier API
	const TRACTATE_TO_ID: Record<string, string> = {
		'Berakhot': '1',
		'Shabbat': '2',
		'Eruvin': '3',
		'Pesachim': '4',
		'Shekalim': '5',
		'Yoma': '6',
		'Sukkah': '7',
		'Beitzah': '8',
		'Rosh_Hashanah': '9',
		'Taanit': '10',
		'Megillah': '11',
		'Moed_Katan': '12',
		'Chagigah': '13'
	};
	
	// Word-by-word comparison results
	let wordComparison: Array<{
		index: number;
		sefariaWord: string;
		hebrewBooksWord: string;
		exactMatch: boolean;
		fuzzyMatch: boolean;
		normalized: {
			sefaria: string;
			hebrewBooks: string;
		}
	}> = [];
	
	// Enhanced Hebrew normalization for better matching
	function normalizeHebrew(text: string): string {
		if (!text) return '';
		
		return text
			// Remove ALL diacritics and cantillation marks
			.replace(/[\u0591-\u05C7\u05F0-\u05F4]/g, '')
			// Normalize different forms of Hebrew letters
			.replace(/[ךםןףץ]/g, (match) => {
				const finals: Record<string, string> = {
					'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'
				};
				return finals[match] || match;
			})
			// Remove ALL punctuation and quotes
			.replace(/[״׳"'`,.:;!?()[\]{}־–—]/g, '')
			// Normalize whitespace
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase();
	}
	
	// Extract clean text from HebrewBooks HTML
	function extractTalmudContent(html: string): string {
		if (!html) return '';
		
		// If it's already plain text
		if (!html.includes('<') && !html.includes('DOCTYPE')) {
			return html.trim();
		}
		
		// Clean HTML
		let text = html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<[^>]*>/g, ' ')
			.replace(/&[a-zA-Z]+;/g, ' ')
			.replace(/&#\d+;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		
		// Remove non-Talmud content
		text = text.replace(/^[\s\S]*?(?=תנן|מתני|גמ|גמרא|משנה|א\]|ב\])/i, '');
		text = text.replace(/(?:רש״י|רשי|תוספות|תוס)[\s\S]*$/i, '');
		
		return text;
	}
	
	// Enhanced fuzzy matching with multiple strategies
	function wordsMatchFuzzy(word1: string, word2: string): boolean {
		if (!word1 || !word2) return false;
		
		// Exact match
		if (word1 === word2) return true;
		
		// Normalized exact match
		const norm1 = normalizeHebrew(word1);
		const norm2 = normalizeHebrew(word2);
		if (norm1 === norm2) return true;
		
		// If either word is empty after normalization, no match
		if (!norm1 || !norm2) return false;
		
		// Substring matching (for abbreviations and partial words)
		if (norm1.length >= 2 && norm2.length >= 2) {
			// Check if one is contained in the other
			if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
			
			// Check if they share a significant common substring
			const minLen = Math.min(norm1.length, norm2.length);
			if (minLen >= 3) {
				for (let i = 0; i <= norm1.length - 3; i++) {
					const substr = norm1.substring(i, i + 3);
					if (norm2.includes(substr)) return true;
				}
			}
		}
		
		// Root matching for Hebrew words (first 2-3 letters)
		if (norm1.length >= 3 && norm2.length >= 3) {
			const root1 = norm1.substring(0, 3);
			const root2 = norm2.substring(0, 3);
			if (root1 === root2) return true;
		}
		
		// Levenshtein distance for close variations
		if (Math.abs(norm1.length - norm2.length) <= 2) {
			const distance = levenshteinDistance(norm1, norm2);
			const maxLen = Math.max(norm1.length, norm2.length);
			// Allow more flexibility for shorter words
			const threshold = maxLen <= 3 ? 1 : Math.ceil(maxLen * 0.3);
			if (distance <= threshold) return true;
		}
		
		return false;
	}
	
	// Calculate Levenshtein distance between two strings
	function levenshteinDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
		
		for (let i = 0; i <= m; i++) dp[i][0] = i;
		for (let j = 0; j <= n; j++) dp[0][j] = j;
		
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = Math.min(
						dp[i - 1][j] + 1,    // deletion
						dp[i][j - 1] + 1,    // insertion
						dp[i - 1][j - 1] + 1 // substitution
					);
				}
			}
		}
		
		return dp[m][n];
	}
	
	// Find optimal alignment between two word arrays
	function findOptimalAlignment(sefariaWords: string[], hebrewBooksWords: string[], maxLength: number = 100) {
		// First, find the best starting offset in HebrewBooks text
		let bestOffset = 0;
		let bestScore = 0;
		
		// Try different offsets in HebrewBooks text
		for (let offset = 0; offset < Math.min(50, hebrewBooksWords.length); offset++) {
			let matches = 0;
			let comparisons = 0;
			
			// Compare first 20 words to find best alignment
			for (let i = 0; i < Math.min(20, sefariaWords.length); i++) {
				if (offset + i < hebrewBooksWords.length) {
					const sWord = sefariaWords[i];
					const hWord = hebrewBooksWords[offset + i];
					
					if (wordsMatchFuzzy(sWord, hWord)) {
						matches++;
					}
					comparisons++;
				}
			}
			
			const score = comparisons > 0 ? matches / comparisons : 0;
			if (score > bestScore) {
				bestScore = score;
				bestOffset = offset;
			}
			
			// If we found a very good match, stop searching
			if (score > 0.7) break;
		}
		
		console.log('Best alignment offset:', bestOffset, 'with score:', bestScore.toFixed(3));
		
		// Create aligned pairs
		const pairs = [];
		let sefariaIdx = 0;
		let hebrewBooksIdx = bestOffset;
		
		while (sefariaIdx < Math.min(maxLength, sefariaWords.length) && 
		       hebrewBooksIdx < hebrewBooksWords.length && 
		       pairs.length < maxLength) {
			
			const sWord = sefariaWords[sefariaIdx];
			const hWord = hebrewBooksWords[hebrewBooksIdx];
			
			// Check if current words match
			const isMatch = wordsMatchFuzzy(sWord, hWord);
			
			if (isMatch) {
				// Perfect alignment
				pairs.push({
					sefaria: sWord,
					hebrewBooks: hWord,
					matched: true
				});
				sefariaIdx++;
				hebrewBooksIdx++;
			} else {
				// Look ahead to see if we can find a match within next few words
				let foundMatch = false;
				
				// Look ahead in both directions
				for (let lookAhead = 1; lookAhead <= 3; lookAhead++) {
					// Try skipping HebrewBooks word
					if (hebrewBooksIdx + lookAhead < hebrewBooksWords.length) {
						if (wordsMatchFuzzy(sWord, hebrewBooksWords[hebrewBooksIdx + lookAhead])) {
							// Add skipped words as insertions
							for (let k = 0; k < lookAhead; k++) {
								pairs.push({
									sefaria: null,
									hebrewBooks: hebrewBooksWords[hebrewBooksIdx + k],
									matched: false
								});
							}
							pairs.push({
								sefaria: sWord,
								hebrewBooks: hebrewBooksWords[hebrewBooksIdx + lookAhead],
								matched: true
							});
							sefariaIdx++;
							hebrewBooksIdx += lookAhead + 1;
							foundMatch = true;
							break;
						}
					}
					
					// Try skipping Sefaria word
					if (sefariaIdx + lookAhead < sefariaWords.length) {
						if (wordsMatchFuzzy(sefariaWords[sefariaIdx + lookAhead], hWord)) {
							// Add skipped words as deletions
							for (let k = 0; k < lookAhead; k++) {
								pairs.push({
									sefaria: sefariaWords[sefariaIdx + k],
									hebrewBooks: null,
									matched: false
								});
							}
							pairs.push({
								sefaria: sefariaWords[sefariaIdx + lookAhead],
								hebrewBooks: hWord,
								matched: true
							});
							sefariaIdx += lookAhead + 1;
							hebrewBooksIdx++;
							foundMatch = true;
							break;
						}
					}
				}
				
				if (!foundMatch) {
					// No match found, add as mismatch and advance both
					pairs.push({
						sefaria: sWord,
						hebrewBooks: hWord,
						matched: false
					});
					sefariaIdx++;
					hebrewBooksIdx++;
				}
			}
		}
		
		// Calculate final score
		const totalMatches = pairs.filter(p => p.matched).length;
		const finalScore = pairs.length > 0 ? totalMatches / pairs.length : 0;
		
		return {
			offset: bestOffset,
			pairs,
			score: finalScore
		};
	}
	
	async function analyzeDaf() {
		isLoading = true;
		error = '';
		wordComparison = [];
		
		try {
			// Convert daf format for daf-supplier
			// The pattern is: 2a=3, 2b=4, 3a=5, 3b=6, etc.
			// So: page N amud a = (N*2) - 1 + 1 = N*2
			//     page N amud b = (N*2) + 1
			const dafNum = parseInt(daf);
			const isAmudB = daf.includes('b');
			const sequentialDaf = isAmudB ? (dafNum * 2) + 1 : (dafNum * 2);
			
			console.log('Converting daf:', { daf, dafNum, isAmudB, sequentialDaf });
			
			// Get tractate ID for daf-supplier
			const tractateId = TRACTATE_TO_ID[tractate];
			if (!tractateId) {
				throw new Error(`Unknown tractate: ${tractate}`);
			}
			
			console.log('Fetching:', {
				sefaria: `${tractate}.${daf}`,
				dafSupplier: `mesechta=${tractateId}&daf=${sequentialDaf}`
			});
			
			// Fetch from both sources
			const [sefariaRes, hebrewBooksRes] = await Promise.all([
				fetch(`https://www.sefaria.org/api/texts/${tractate}.${daf}?commentary=0`),
				fetch(`/api/daf-supplier?mesechta=${tractateId}&daf=${sequentialDaf}`)
			]);
			
			console.log('Response status:', {
				sefaria: sefariaRes.status,
				hebrewBooks: hebrewBooksRes.status
			});
			
			if (!sefariaRes.ok || !hebrewBooksRes.ok) {
				const errorDetails = [];
				if (!sefariaRes.ok) errorDetails.push(`Sefaria: ${sefariaRes.status}`);
				if (!hebrewBooksRes.ok) {
					const hbError = await hebrewBooksRes.text();
					errorDetails.push(`HebrewBooks: ${hebrewBooksRes.status} - ${hbError}`);
				}
				throw new Error(`Failed to fetch data: ${errorDetails.join(', ')}`);
			}
			
			sefariaData = await sefariaRes.json();
			hebrewBooksData = await hebrewBooksRes.json();
			
			console.log('Data received:', {
				sefariaSegments: sefariaData.he?.length,
				hebrewBooksText: hebrewBooksData.mainText?.substring(0, 100)
			});
			
			// Process and compare first segment word by word
			if (sefariaData.he && sefariaData.he.length > 0 && hebrewBooksData.mainText) {
				const sefariaText = sefariaData.he.flat().join(' ');
				const hebrewBooksText = extractTalmudContent(hebrewBooksData.mainText);
				
				console.log('Sefaria text (first 200):', sefariaText.substring(0, 200));
				console.log('HebrewBooks text (first 200):', hebrewBooksText.substring(0, 200));
				
				const sefariaWords = sefariaText.split(/\s+/).filter(w => w.length > 0);
				const hebrewBooksWords = hebrewBooksText.split(/\s+/).filter(w => w.length > 0);
				
				console.log('Word counts:', {
					sefaria: sefariaWords.length,
					hebrewBooks: hebrewBooksWords.length
				});
				
				// Find optimal alignment using sequence alignment
				const alignment = findOptimalAlignment(sefariaWords, hebrewBooksWords, Math.max(sefariaWords.length, hebrewBooksWords.length));
				
				console.log('Alignment found:', {
					sefariaStart: 0,
					hebrewBooksStart: alignment.offset,
					alignedLength: alignment.pairs.length,
					score: alignment.score
				});
				
				// Create word comparison based on alignment
				for (let i = 0; i < alignment.pairs.length; i++) {
					const pair = alignment.pairs[i];
					const sWord = pair.sefaria || '';
					const hWord = pair.hebrewBooks || '';
					const exactMatch = sWord && hWord ? sWord === hWord : false;
					const fuzzyMatch = sWord && hWord ? wordsMatchFuzzy(sWord, hWord) : false;
					const normMatch = sWord && hWord ? normalizeHebrew(sWord) === normalizeHebrew(hWord) : false;
					
					wordComparison.push({
						index: i,
						sefariaWord: sWord,
						hebrewBooksWord: hWord,
						exactMatch,
						fuzzyMatch,
						normalizedMatch: normMatch,
						aligned: pair.matched,
						isInsertion: !pair.sefaria && pair.hebrewBooks,
						isDeletion: pair.sefaria && !pair.hebrewBooks,
						normalized: {
							sefaria: normalizeHebrew(sWord),
							hebrewBooks: normalizeHebrew(hWord)
						}
					});
				}
				
				// Calculate match statistics
				const exactMatches = wordComparison.filter(w => w.exactMatch).length;
				const fuzzyMatches = wordComparison.filter(w => !w.exactMatch && w.fuzzyMatch).length;
				const normalizedMatches = wordComparison.filter(w => !w.exactMatch && w.normalizedMatch).length;
				const totalMatches = wordComparison.filter(w => w.exactMatch || w.fuzzyMatch).length;
				const alignedMatches = wordComparison.filter(w => w.aligned).length;
				const insertions = wordComparison.filter(w => w.isInsertion).length;
				const deletions = wordComparison.filter(w => w.isDeletion).length;
				
				console.log('Match Statistics:', {
					total: wordComparison.length,
					exactMatches,
					fuzzyMatches,
					normalizedMatches,
					totalMatches,
					alignedMatches,
					insertions,
					deletions,
					matchPercentage: (totalMatches / wordComparison.length * 100).toFixed(1) + '%',
					alignmentScore: (alignment.score * 100).toFixed(1) + '%'
				});
				
				console.log('Word comparison created:', wordComparison.length, 'words');
				console.log('First 5 comparisons:', wordComparison.slice(0, 5));
				
				// Force reactivity update
				wordComparison = [...wordComparison];
			} else {
				console.log('Missing data:', {
					hasSefariaHe: !!sefariaData.he,
					sefariaLength: sefariaData.he?.length,
					hasHebrewBooksText: !!hebrewBooksData.mainText
				});
			}
			
		} catch (e: any) {
			error = e.message || 'An error occurred';
			console.error('Error:', e);
		} finally {
			isLoading = false;
		}
	}
	
	onMount(() => {
		analyzeDaf();
	});
	
	// Get match status color
	function getMatchColor(word: any): string {
		if (word.isInsertion) return 'bg-purple-100 border-purple-300';
		if (word.isDeletion) return 'bg-pink-100 border-pink-300';
		if (word.exactMatch) return 'bg-green-100 border-green-300';
		if (word.fuzzyMatch) return 'bg-yellow-100 border-yellow-300';
		if (word.normalizedMatch) return 'bg-blue-100 border-blue-300';
		return 'bg-red-100 border-red-300';
	}
	
	// Get match status text
	function getMatchStatus(word: any): string {
		if (word.isInsertion) return '+ Insert';
		if (word.isDeletion) return '- Delete';
		if (word.exactMatch) return '✓ Exact';
		if (word.fuzzyMatch) return '≈ Fuzzy';
		if (word.normalizedMatch) return '~ Normalized';
		return '✗ None';
	}
</script>

<div class="container mx-auto p-4 max-w-7xl">
	<h1 class="text-3xl font-bold mb-6">Word-by-Word Matching Debug</h1>
	
	<!-- Controls -->
	<div class="bg-white rounded-lg shadow-md p-4 mb-6">
		<div class="flex gap-4 items-end">
			<div>
				<label class="block text-sm font-medium mb-1">Tractate</label>
				<select bind:value={tractate} class="px-3 py-2 border rounded">
					<option value="Berakhot">Berakhot</option>
					<option value="Shabbat">Shabbat</option>
					<option value="Eruvin">Eruvin</option>
					<option value="Pesachim">Pesachim</option>
					<option value="Yoma">Yoma</option>
					<option value="Sukkah">Sukkah</option>
					<option value="Beitzah">Beitzah</option>
					<option value="Rosh_Hashanah">Rosh Hashanah</option>
					<option value="Taanit">Taanit</option>
					<option value="Megillah">Megillah</option>
					<option value="Moed_Katan">Moed Katan</option>
					<option value="Chagigah">Chagigah</option>
				</select>
			</div>
			
			<div>
				<label class="block text-sm font-medium mb-1">Daf</label>
				<input 
					type="text" 
					bind:value={daf}
					placeholder="e.g., 2a, 3b"
					class="px-3 py-2 border rounded w-24"
				/>
			</div>
			
			<button 
				on:click={analyzeDaf}
				disabled={isLoading}
				class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
			>
				{isLoading ? 'Analyzing...' : 'Analyze'}
			</button>
		</div>
	</div>
	
	{#if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
			Error: {error}
		</div>
	{/if}
	
	<!-- Word Comparison Table -->
	{#if wordComparison.length > 0}
		<div class="bg-white rounded-lg shadow-md overflow-hidden">
			<div class="p-4 bg-gray-50 border-b">
				<h2 class="text-xl font-semibold">Word-by-Word Comparison</h2>
				<div class="mt-2 flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-green-100 border border-green-300 rounded"></span>
						Exact Match
					</span>
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></span>
						Fuzzy Match
					</span>
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></span>
						Normalized Match
					</span>
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-purple-100 border border-purple-300 rounded"></span>
						Insertion
					</span>
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-pink-100 border border-pink-300 rounded"></span>
						Deletion
					</span>
					<span class="flex items-center gap-1">
						<span class="w-4 h-4 bg-red-100 border border-red-300 rounded"></span>
						No Match
					</span>
				</div>
			</div>
			
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-100 border-b">
						<tr>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">#</th>
							<th class="px-3 py-2 text-right text-xs font-medium text-gray-700">Sefaria</th>
							<th class="px-3 py-2 text-right text-xs font-medium text-gray-700">HebrewBooks</th>
							<th class="px-3 py-2 text-center text-xs font-medium text-gray-700">Match</th>
							<th class="px-3 py-2 text-right text-xs font-medium text-gray-700 text-gray-500">Normalized (S)</th>
							<th class="px-3 py-2 text-right text-xs font-medium text-gray-700 text-gray-500">Normalized (H)</th>
						</tr>
					</thead>
					<tbody>
						{#each wordComparison as word, i}
							<tr class="border-b hover:bg-gray-50 {getMatchColor(word)}">
								<td class="px-3 py-1 text-xs text-gray-600">{word.index + 1}</td>
								<td class="px-3 py-1 text-right font-hebrew text-lg">
									{word.sefariaWord || '—'}
								</td>
								<td class="px-3 py-1 text-right font-hebrew text-lg">
									{word.hebrewBooksWord || '—'}
								</td>
								<td class="px-3 py-1 text-center text-xs font-medium">
									{getMatchStatus(word)}
								</td>
								<td class="px-3 py-1 text-right text-xs text-gray-500 font-mono">
									{word.normalized.sefaria || '—'}
								</td>
								<td class="px-3 py-1 text-right text-xs text-gray-500 font-mono">
									{word.normalized.hebrewBooks || '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			
			<!-- Summary Stats -->
			<div class="p-4 bg-gray-50 border-t">
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
					<div>
						<span class="font-medium text-green-700">Exact:</span>
						<span class="ml-2">{wordComparison.filter(w => w.exactMatch).length}/{wordComparison.length}</span>
					</div>
					<div>
						<span class="font-medium text-yellow-700">Fuzzy:</span>
						<span class="ml-2">{wordComparison.filter(w => !w.exactMatch && w.fuzzyMatch).length}/{wordComparison.length}</span>
					</div>
					<div>
						<span class="font-medium text-blue-700">Normalized:</span>
						<span class="ml-2">{wordComparison.filter(w => !w.exactMatch && !w.fuzzyMatch && w.normalizedMatch).length}/{wordComparison.length}</span>
					</div>
					<div>
						<span class="font-medium text-red-700">No Match:</span>
						<span class="ml-2">{wordComparison.filter(w => !w.exactMatch && !w.fuzzyMatch).length}/{wordComparison.length}</span>
					</div>
				</div>
				<div class="mt-3 pt-3 border-t border-gray-300">
					<div class="flex justify-between items-center">
						<span class="font-medium">Total Match Rate:</span>
						<span class="text-lg font-bold text-blue-600">
							{((wordComparison.filter(w => w.exactMatch || w.fuzzyMatch).length / wordComparison.length) * 100).toFixed(1)}%
						</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.font-hebrew {
		font-family: 'David Libre', 'Noto Serif Hebrew', serif;
		font-size: 1.1rem;
	}
</style>