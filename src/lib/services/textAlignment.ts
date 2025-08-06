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
	sefariaIndex?: number; // Index in original Sefaria text
	hebrewBooksIndex?: number; // Index in original HebrewBooks text
}

export interface AlignmentResult {
	offset: number;
	pairs: WordPair[];
	score: number;
	sefariaWords?: string[]; // Original Sefaria words array
	hebrewBooksWords?: string[]; // Original HebrewBooks words array
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
 * Segment mapping for tracking which words belong to which Sefaria segment
 */
export interface SegmentMapping {
	segmentIndex: number;
	segmentRef: string;
	startWordIndex: number;
	endWordIndex: number;
	hebrewText: string;
	englishText?: string;
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
				matched: true,
				sefariaIndex: sefariaIdx,
				hebrewBooksIndex: hebrewBooksIdx
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
								matched: false,
								hebrewBooksIndex: hebrewBooksIdx + k
							});
						}
						pairs.push({
							sefaria: sWord,
							hebrewBooks: hebrewBooksWords[hebrewBooksIdx + lookAhead],
							matched: true,
							sefariaIndex: sefariaIdx,
							hebrewBooksIndex: hebrewBooksIdx + lookAhead
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
								matched: false,
								sefariaIndex: sefariaIdx + k
							});
						}
						pairs.push({
							sefaria: sefariaWords[sefariaIdx + lookAhead],
							hebrewBooks: hWord,
							matched: true,
							sefariaIndex: sefariaIdx + lookAhead,
							hebrewBooksIndex: hebrewBooksIdx
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
					matched: false,
					sefariaIndex: sefariaIdx,
					hebrewBooksIndex: hebrewBooksIdx
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
	
	// Store original words in alignment result
	alignment.sefariaWords = sefariaWords;
	alignment.hebrewBooksWords = hebrewBooksWords;
	
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

/**
 * Selection context for click-to-context functionality
 */
export interface SelectionContext {
	text: string;
	startWordIndex: number;
	endWordIndex: number;
	segmentMappings?: SegmentMapping[];
	matchedSegments?: number[];
}

/**
 * Find a text selection within the alignment
 * Returns the word indices and context for the selected text
 */
export function findSelectionInAlignment(
	selectedText: string,
	alignment: AlignmentResult,
	source: 'sefaria' | 'hebrewBooks' = 'hebrewBooks'
): SelectionContext | null {
	if (!selectedText || !alignment) return null;
	
	// Get the source words array
	const sourceWords = source === 'sefaria' ? alignment.sefariaWords : alignment.hebrewBooksWords;
	if (!sourceWords) return null;
	
	// Normalize and split the selected text
	const selectedWords = selectedText.split(/\s+/).filter(w => w.length > 0);
	if (selectedWords.length === 0) return null;
	
	// Find the selected words in the source text
	let startIndex = -1;
	for (let i = 0; i <= sourceWords.length - selectedWords.length; i++) {
		let match = true;
		for (let j = 0; j < selectedWords.length; j++) {
			if (!wordsMatchFuzzy(sourceWords[i + j], selectedWords[j])) {
				match = false;
				break;
			}
		}
		if (match) {
			startIndex = i;
			break;
		}
	}
	
	if (startIndex === -1) return null;
	
	return {
		text: selectedText,
		startWordIndex: startIndex,
		endWordIndex: startIndex + selectedWords.length - 1
	};
}

/**
 * Get the Sefaria segment(s) that contain the selected text
 */
export function getSegmentsFromSelection(
	selection: SelectionContext,
	segmentMappings: SegmentMapping[]
): SegmentMapping[] {
	if (!selection || !segmentMappings || segmentMappings.length === 0) return [];
	
	const matchedSegments: SegmentMapping[] = [];
	
	for (const segment of segmentMappings) {
		// Check if the selection overlaps with this segment's word range
		if (
			(selection.startWordIndex >= segment.startWordIndex && selection.startWordIndex <= segment.endWordIndex) ||
			(selection.endWordIndex >= segment.startWordIndex && selection.endWordIndex <= segment.endWordIndex) ||
			(selection.startWordIndex <= segment.startWordIndex && selection.endWordIndex >= segment.endWordIndex)
		) {
			matchedSegments.push(segment);
		}
	}
	
	return matchedSegments;
}

/**
 * Create segment mappings from Sefaria segments
 */
export function createSegmentMappings(
	sefariaSegments: Array<{ ref: string; he: string; en?: string }>
): SegmentMapping[] {
	const mappings: SegmentMapping[] = [];
	let currentWordIndex = 0;
	
	for (let i = 0; i < sefariaSegments.length; i++) {
		const segment = sefariaSegments[i];
		const words = segment.he.split(/\s+/).filter(w => w.length > 0);
		
		mappings.push({
			segmentIndex: i,
			segmentRef: segment.ref,
			startWordIndex: currentWordIndex,
			endWordIndex: currentWordIndex + words.length - 1,
			hebrewText: segment.he,
			englishText: segment.en
		});
		
		currentWordIndex += words.length;
	}
	
	return mappings;
}

/**
 * Get context around a selection (words before and after)
 */
export function getSelectionContext(
	selection: SelectionContext,
	alignment: AlignmentResult,
	contextWords: number = 10,
	source: 'sefaria' | 'hebrewBooks' = 'hebrewBooks'
): string {
	const sourceWords = source === 'sefaria' ? alignment.sefariaWords : alignment.hebrewBooksWords;
	if (!sourceWords || !selection) return '';
	
	const startContext = Math.max(0, selection.startWordIndex - contextWords);
	const endContext = Math.min(sourceWords.length - 1, selection.endWordIndex + contextWords);
	
	return sourceWords.slice(startContext, endContext + 1).join(' ');
}

/**
 * Find corresponding text in the other source through alignment
 */
export function findCorrespondingText(
	selection: SelectionContext,
	alignment: AlignmentResult,
	sourceType: 'sefaria' | 'hebrewBooks'
): SelectionContext | null {
	if (!selection || !alignment.pairs) return null;
	
	// Find the alignment pairs that correspond to the selection
	const targetType = sourceType === 'sefaria' ? 'hebrewBooks' : 'sefaria';
	const indexField = sourceType === 'sefaria' ? 'sefariaIndex' : 'hebrewBooksIndex';
	const targetIndexField = sourceType === 'sefaria' ? 'hebrewBooksIndex' : 'sefariaIndex';
	
	// Find pairs that match the selection range
	const matchedPairs = alignment.pairs.filter(pair => {
		const sourceIndex = pair[indexField];
		return sourceIndex !== undefined && 
		       sourceIndex >= selection.startWordIndex && 
		       sourceIndex <= selection.endWordIndex;
	});
	
	if (matchedPairs.length === 0) return null;
	
	// Get the corresponding indices in the target
	const targetIndices = matchedPairs
		.map(pair => pair[targetIndexField])
		.filter(idx => idx !== undefined) as number[];
	
	if (targetIndices.length === 0) return null;
	
	const minIndex = Math.min(...targetIndices);
	const maxIndex = Math.max(...targetIndices);
	
	// Get the corresponding words
	const targetWords = targetType === 'sefaria' ? alignment.sefariaWords : alignment.hebrewBooksWords;
	if (!targetWords) return null;
	
	const correspondingText = targetWords.slice(minIndex, maxIndex + 1).join(' ');
	
	return {
		text: correspondingText,
		startWordIndex: minIndex,
		endWordIndex: maxIndex
	};
}