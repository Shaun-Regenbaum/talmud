/**
 * Enhanced text processor for traditional daf-renderer layout
 * Supports both HebrewBooks strings and Sefaria segments for clean sentence divisions
 */

interface TextProcessorOptions {
	enableSentenceDivisions?: boolean;
	fallbackToHebrewBooks?: boolean;
	stripHtmlTags?: boolean;
	sefariaSegments?: {
		main?: string[];
		rashi?: string[];
		tosafot?: string[];
	};
	linking?: {
		rashi?: Record<string, any>;
		tosafot?: Record<string, any>;
	};
}

// Strip HTML tags from text while preserving content
function stripHtmlTags(text: string): string {
	// Remove all HTML tags
	return text.replace(/<[^>]*>/g, '');
}

/**
 * Apply Sefaria segments to HebrewBooks text by finding and wrapping matching text
 */
function applySegmentsToText(
	hebrewBooksText: string, 
	sefariaSegments: string[], 
	prefix: string,
	linking?: Record<string, any>,
	stripHtml: boolean = true
): string {
	if (!hebrewBooksText || !sefariaSegments || sefariaSegments.length === 0) {
		return hebrewBooksText || '';
	}

	console.log(`🔍 Applying ${sefariaSegments.length} Sefaria segments to ${prefix} HebrewBooks text`);
	
	let workingText = hebrewBooksText;
	let successCount = 0;
	
	// For commentary, we need to filter segments based on linking data
	let segmentsToApply = sefariaSegments;
	if (linking && (prefix === 'rashi' || prefix === 'tosafot')) {
		// Build set of linked indexes
		const linkedIndexes = new Set<number>();
		Object.values(linking).forEach((sentenceLinks: any) => {
			if (typeof sentenceLinks === 'object') {
				Object.values(sentenceLinks).forEach((commentaryIndexes: any) => {
					if (Array.isArray(commentaryIndexes)) {
						commentaryIndexes.forEach(idx => linkedIndexes.add(idx));
					}
				});
			}
		});
		
		console.log(`📊 Found ${linkedIndexes.size} linked ${prefix} segments`);
		segmentsToApply = sefariaSegments.filter((_, idx) => linkedIndexes.has(idx));
	}
	
	// Try to find and wrap each segment
	segmentsToApply.forEach((segment, index) => {
		let cleanSegment = segment.trim();
		// Strip HTML if requested
		if (stripHtml) {
			cleanSegment = stripHtmlTags(cleanSegment);
		}
		if (cleanSegment.length > 5) { // Meaningful segment threshold
			// Try exact match first
			if (workingText.includes(cleanSegment)) {
				const wrappedSegment = `<span class="sentence-${prefix}" data-sentence-index="${index}">${cleanSegment}</span>`;
				workingText = workingText.replace(cleanSegment, wrappedSegment);
				successCount++;
			} else {
				// Try with normalized whitespace
				const normalizedSegment = cleanSegment.replace(/\s+/g, ' ');
				const normalizedText = workingText.replace(/\s+/g, ' ');
				const position = normalizedText.indexOf(normalizedSegment);
				
				if (position !== -1) {
					// Found with normalized whitespace - need more complex replacement
					console.log(`🔄 Found segment ${index} with normalized whitespace`);
					successCount++;
				}
			}
		}
	});
	
	console.log(`✅ Applied ${successCount}/${segmentsToApply.length} segments to ${prefix}`);
	
	// Process headers in any remaining unwrapped text
	const headerRegex = /\{([^\{\}]+)\}/g;
	workingText = workingText.replaceAll(headerRegex, `<b class='${prefix}-header'>$1</b>`);
	
	return workingText;
}

export function processTextsForRenderer(
	mainText: string | string[], 
	rashiText: string | string[], 
	tosafotText: string | string[],
	options?: TextProcessorOptions
): {
	mainHTML: string;
	rashiHTML: string;
	tosafotHTML: string;
} {
	const { 
		enableSentenceDivisions = true, 
		fallbackToHebrewBooks = true,
		stripHtmlTags: shouldStripHtml = true,
		sefariaSegments,
		linking
	} = options || {};
	
	console.log('📝 Processing texts for traditional daf-renderer layout', {
		enableSentenceDivisions,
		mainTextType: Array.isArray(mainText) ? 'array' : 'string',
		rashiTextType: Array.isArray(rashiText) ? 'array' : 'string', 
		tosafotTextType: Array.isArray(tosafotText) ? 'array' : 'string'
	});
	
	// Header regex for basic formatting
	const headerRegex = /\{([^\{\}]+)\}/g;
	
	// Helper function to process text with sentence divisions
	function processTextWithSentences(text: string | string[], prefix: string): string {
		// Check if we have valid Sefaria segments array directly passed
		if (Array.isArray(text) && text.length > 0 && enableSentenceDivisions) {
			const validSegments = text.filter(segment => segment && typeof segment === 'string' && segment.trim().length > 0);
			if (validSegments.length > 0) {
				console.log(`📊 Using Sefaria segments for ${prefix}: ${validSegments.length} segments`);
				// For daf-renderer compatibility, create spans that daf-renderer can process
				// daf-renderer will handle word wrapping within these sentence spans
				return validSegments
					.map((segment, index) => {
						let cleanSegment = segment.replaceAll('\r', '').trim();
						// Strip HTML tags if requested
						if (shouldStripHtml) {
							cleanSegment = stripHtmlTags(cleanSegment);
						}
						// Process headers within segments
						const withHeaders = cleanSegment.replaceAll(headerRegex, `<b class='${prefix}-header'>$1</b>`);
						// Wrap in sentence span with data attributes for potential future use
						return `<span class="sentence-${prefix}" data-sentence-index="${index}">${withHeaders}</span>`;
					})
					.join(' '); // Join with spaces, let daf-renderer handle layout
			}
		}
		
		// Check if we have HebrewBooks string + Sefaria segments to apply
		if (typeof text === 'string' && text.trim().length > 0) {
			const sefariaSegs = sefariaSegments?.[prefix as keyof typeof sefariaSegments];
			const linkingData = prefix === 'rashi' ? linking?.rashi : prefix === 'tosafot' ? linking?.tosafot : undefined;
			
			if (sefariaSegs && sefariaSegs.length > 0 && enableSentenceDivisions) {
				console.log(`🎯 Applying ${sefariaSegs.length} Sefaria segments to ${prefix} HebrewBooks text`);
				return applySegmentsToText(text, sefariaSegs, prefix, linkingData, shouldStripHtml);
			}
			
			// Standard HebrewBooks string processing
			console.log(`📊 Using HebrewBooks string for ${prefix}: ${text.length} chars`);
			const cleanText = text.replaceAll('\r', '').trim();
			return cleanText.replaceAll(headerRegex, `<b class='${prefix}-header'>$1</b>`);
		}
		
		// Handle edge case where we have an array but it's empty or invalid
		if (Array.isArray(text)) {
			console.log(`⚠️ Empty or invalid Sefaria segments for ${prefix}, no fallback string available`);
		} else {
			console.log(`⚠️ No valid ${prefix} text available (not string or array)`);
		}
		
		return '';
	}
	
	// Process each text type
	const mainHTML = processTextWithSentences(mainText, 'main');
	const rashiHTML = processTextWithSentences(rashiText, 'rashi');
	const tosafotHTML = processTextWithSentences(tosafotText, 'tosafot');

	console.log('✅ Enhanced text processing complete:', {
		mainLength: mainHTML.length,
		rashiLength: rashiHTML.length,
		tosafotLength: tosafotHTML.length,
		usedSentenceDivisions: enableSentenceDivisions && (Array.isArray(mainText) || Array.isArray(rashiText) || Array.isArray(tosafotText))
	});

	return {
		mainHTML,
		rashiHTML,
		tosafotHTML
	};
}