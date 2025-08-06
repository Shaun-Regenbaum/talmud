/**
 * @fileoverview Text Alignment Service
 * 
 * Provides advanced text alignment algorithms for matching Hebrew texts
 * from different sources (Sefaria vs HebrewBooks) with different formatting.
 * 
 * Key features:
 * - Enhanced Hebrew normalization (removes nikud, final letters, punctuation)
 * - Multi-strategy fuzzy matching (exact, normalized, substring, root, Levenshtein)
 * - Sequence alignment with gap handling (insertions/deletions)
 * - Optimal offset detection for text alignment
 */

export interface WordPair {
	sefaria: string | null;
	hebrewBooks: string | null;
	matched: boolean;
}

export interface AlignmentResult {
	offset: number;
	pairs: WordPair[];
	score: number;
}

export interface WordComparison {
	index: number;
	sefariaWord: string;
	hebrewBooksWord: string;
	exactMatch: boolean;
	fuzzyMatch: boolean;
	normalizedMatch: boolean;
	aligned: boolean;
	isInsertion: boolean;
	isDeletion: boolean;
	normalized: {
		sefaria: string;
		hebrewBooks: string;
	};
}

export interface MatchStatistics {
	total: number;
	exactMatches: number;
	fuzzyMatches: number;
	normalizedMatches: number;
	totalMatches: number;
	alignedMatches: number;
	insertions: number;
	deletions: number;
	matchPercentage: number;
	alignmentScore: number;
}

/**
 * Enhanced Hebrew normalization for better matching
 */
export function normalizeHebrew(text: string): string {
	if (!text) return '';
	
	return text
		// Remove ALL diacritics and cantillation marks
		.replace(/[\u0591-\u05C7\u05F0-\u05F4]/g, '')
		// Normalize different forms of Hebrew letters (final → regular)
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

/**
 * Calculate Levenshtein distance between two strings
 */
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

/**
 * Enhanced fuzzy matching with multiple strategies
 */
export function wordsMatchFuzzy(word1: string, word2: string): boolean {
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

/**
 * Find optimal alignment between two word arrays using sequence alignment
 */
export function findOptimalAlignment(sefariaWords: string[], hebrewBooksWords: string[], maxLength: number = 100): AlignmentResult {
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
	
	// Create aligned pairs using dynamic programming approach
	const pairs: WordPair[] = [];
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

/**
 * Create word-by-word comparison based on alignment
 */
export function createWordComparison(alignment: AlignmentResult): WordComparison[] {
	const wordComparison: WordComparison[] = [];
	
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
			isInsertion: !pair.sefaria && !!pair.hebrewBooks,
			isDeletion: !!pair.sefaria && !pair.hebrewBooks,
			normalized: {
				sefaria: normalizeHebrew(sWord),
				hebrewBooks: normalizeHebrew(hWord)
			}
		});
	}
	
	return wordComparison;
}

/**
 * Calculate match statistics from word comparison
 */
export function calculateMatchStatistics(wordComparison: WordComparison[], alignmentScore: number): MatchStatistics {
	const exactMatches = wordComparison.filter(w => w.exactMatch).length;
	const fuzzyMatches = wordComparison.filter(w => !w.exactMatch && w.fuzzyMatch).length;
	const normalizedMatches = wordComparison.filter(w => !w.exactMatch && w.normalizedMatch).length;
	const totalMatches = wordComparison.filter(w => w.exactMatch || w.fuzzyMatch).length;
	const alignedMatches = wordComparison.filter(w => w.aligned).length;
	const insertions = wordComparison.filter(w => w.isInsertion).length;
	const deletions = wordComparison.filter(w => w.isDeletion).length;
	
	return {
		total: wordComparison.length,
		exactMatches,
		fuzzyMatches,
		normalizedMatches,
		totalMatches,
		alignedMatches,
		insertions,
		deletions,
		matchPercentage: wordComparison.length > 0 ? (totalMatches / wordComparison.length) * 100 : 0,
		alignmentScore: alignmentScore * 100
	};
}

/**
 * Extract clean text from HebrewBooks HTML
 */
export function extractTalmudContent(html: string): string {
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
	
	return text;
}

/**
 * Align two texts and return detailed comparison results
 */
export function alignTexts(sefariaText: string, hebrewBooksText: string, maxLength: number = 150) {
	const sefariaWords = sefariaText.split(/\s+/).filter(w => w.length > 0);
	const hebrewBooksWords = hebrewBooksText.split(/\s+/).filter(w => w.length > 0);
	
	console.log('Aligning texts:', {
		sefariaWords: sefariaWords.length,
		hebrewBooksWords: hebrewBooksWords.length,
		sefariaPreview: sefariaText.substring(0, 100),
		hebrewBooksPreview: hebrewBooksText.substring(0, 100)
	});
	
	// Find optimal alignment
	const alignment = findOptimalAlignment(sefariaWords, hebrewBooksWords, maxLength);
	
	// Create word comparison
	const wordComparison = createWordComparison(alignment);
	
	// Calculate statistics
	const statistics = calculateMatchStatistics(wordComparison, alignment.score);
	
	console.log('Alignment complete:', {
		offset: alignment.offset,
		alignedLength: alignment.pairs.length,
		score: (alignment.score * 100).toFixed(1) + '%',
		statistics
	});
	
	return {
		alignment,
		wordComparison,
		statistics
	};
}