/**
 * Advanced text processing for Talmud text formatting
 * Based on talmud-vue implementation
 */

interface ProcessedTexts {
	mainHTML: string;
	rashiHTML: string;
	tosafotHTML: string;
}

export function processTextsForRenderer(
	mainText: string | string[], 
	rashiText: string, 
	tosafotText: string,
	sefariaData?: {
		mainText: string[];
		rashi: string[];
		tosafot: string[];
	}
): ProcessedTexts {
	// Handle empty or null inputs
	if (!mainText) mainText = '';
	if (!rashiText) rashiText = '';
	if (!tosafotText) tosafotText = '';
	
	// Debug Sefaria data
	if (sefariaData) {
		console.log('📊 Sefaria data structure:', {
			mainTextSegments: sefariaData.mainText?.length || 0,
			rashiSegments: sefariaData.rashi?.length || 0,
			tosafotSegments: sefariaData.tosafot?.length || 0,
			firstMainSegment: sefariaData.mainText?.[0]?.substring(0, 100),
			firstRashiSegment: sefariaData.rashi?.[0]?.substring(0, 100)
		});
	}
	const headerRegex = /\{([^\{\}]+)\}/g;
	const hadran = "הדרן עלך";
	const hadranRegex = new RegExp(`<br>[\\w\\s]*${hadran}[\\w\\s]*<br>`, 'g');

	const hadranDiv = (text: "rashi" | "tosafot" | "main", html: string): string =>
		`<div class="hadran" style="font-size: 1.5em;"><span class="sentence-${text}">${html.replace("<br>", "")}</span></div>`;

	// Process main text - handle both string and array formats
	let processedMainText: string;
	
	if (Array.isArray(mainText)) {
		// If it's already an array (like talmud-vue expects)
		processedMainText = mainText.join('<br>');
	} else {
		// If it's a string, convert newlines to <br>
		processedMainText = mainText.split('\n').join('<br>');
	}
	
	let mainHTML: string;
	
	// Main text processing - check for | delimiters first, fallback to Sefaria segmentation
	console.log('🔍 processedMainText contains | delimiters:', processedMainText.includes('|'));
	console.log('🔍 First 200 chars of processedMainText:', processedMainText.substring(0, 200));
	
	if (processedMainText.includes('|')) {
		// Use | delimiter for actual sentences (like talmud-vue-reference)
		console.log('✅ Using | delimiter for sentence segmentation');
		mainHTML = processedMainText
			.split('|') // Split by | delimiter for actual sentences
			.map((sentenceHTML, index) => {
				const trimmed = sentenceHTML.trim();
				if (!trimmed) return '';
				if (trimmed.includes(hadran) && trimmed.split(' ').length < 7) {
					return hadranDiv("main", trimmed);
				}
				// Apply first word styling to Gemara sentences
				const words = trimmed.split(/\s+/);
				if (words.length > 0) {
					const firstWord = `<span class="gemara-first-word" style="font-size: 3em; line-height: 1; display: inline-block; float: right; margin-left: 0.2em;">${words[0]}</span>`;
					const restOfText = words.slice(1).join(' ');
					return `<span class="sentence-main" data-sentence-index="${index}">${firstWord} ${restOfText}</span>`;
				}
				return `<span class="sentence-main" data-sentence-index="${index}">${trimmed}</span>`;
			})
			.filter(html => html) // Remove empty strings
			.join(' ')
			.replaceAll(headerRegex, "<b class='main-header'>$1</b>");
	} else if (sefariaData && sefariaData.mainText.length > 0) {
		// Use Sefaria segmentation with traditional format
		console.log('✅ Using Sefaria segmentation for sentences with traditional format');
		
		// For traditional format, wrap Sefaria segments while preserving the original text layout
		let sefariaIndex = 0;
		let workingText = processedMainText;
		
		// Process each Sefaria segment
		for (const segment of sefariaData.mainText) {
			if (segment && segment.length > 5) { // Skip very short segments
				// Find the segment text in the working text (handling Hebrew and special chars)
				const cleanSegment = segment.replace(/<[^>]*>/g, '').trim();
				if (cleanSegment.length > 5 && workingText.includes(cleanSegment)) {
					// Wrap this segment with span and apply first word styling
					const words = cleanSegment.split(/\s+/);
					let wrappedSegment;
					if (words.length > 0 && sefariaIndex === 0) { // Only for first segment
						const firstWord = `<span class="gemara-first-word" style="font-size: 3em; line-height: 1; display: inline-block; float: right; margin-left: 0.2em;">${words[0]}</span>`;
						const restOfText = words.slice(1).join(' ');
						wrappedSegment = `<span class="sentence-main" data-sentence-index="${sefariaIndex}">${firstWord} ${restOfText}</span>`;
					} else {
						wrappedSegment = `<span class="sentence-main" data-sentence-index="${sefariaIndex}">${cleanSegment}</span>`;
					}
					workingText = workingText.replace(cleanSegment, wrappedSegment);
					sefariaIndex++;
				}
			}
		}
		
		mainHTML = workingText.replaceAll(headerRegex, "<b class='main-header'>$1</b>");
	} else {
		// Fallback: Use traditional format with line breaks
		console.log('⚠️ Fallback: Using traditional format for sentence segmentation');
		console.log('⚠️ No Sefaria data available for linking commentary to main text');
		
		// For traditional format, use natural paragraph/line breaks
		const lines = processedMainText.split(/\r?\n/).filter(line => line.trim());
		mainHTML = lines
			.map((line, index) => {
				const trimmed = line.trim();
				if (!trimmed) return '';
				if (trimmed.includes(hadran) && trimmed.split(' ').length < 7) {
					return hadranDiv("main", trimmed);
				}
				// Apply first word styling to Gemara sentences
				const words = trimmed.split(/\s+/);
				if (words.length > 0) {
					const firstWord = `<span class="gemara-first-word" style="font-size: 3em; line-height: 1; display: inline-block; float: right; margin-left: 0.2em;">${words[0]}</span>`;
					const restOfText = words.slice(1).join(' ');
					return `<span class="sentence-main" data-sentence-index="${index}">${firstWord} ${restOfText}</span>`;
				}
				return `<span class="sentence-main" data-sentence-index="${index}">${trimmed}</span>`;
			})
			.filter(html => html)
			.join('\n')
			.replaceAll(headerRegex, "<b class='main-header'>$1</b>");
	}

	// Process Rashi text
	let rashiHTML: string;
	
	// Process Rashi text - add rashi-header class to existing span.five elements
	rashiHTML = rashiText
		.replaceAll(headerRegex, "<b class='rashi-header' style='font-weight: 600; font-size: 1.1em;'>$1</b>")
		.replaceAll(/<span class="five">/g, "<span class='five rashi-header' style='font-weight: 600; font-size: 1.1em;'>")
		.split('<br>')
		.map(line => {
			if (line.slice(0, hadran.length) == hadran) {
				return hadranDiv("rashi", line);
			}
			return line;
		})
		.join('<br>');

	// Process Tosafot text
	let tosafotHTML: string;
	
	// Process Tosafot text - add tosafot-header class to existing shastitle7 elements
	tosafotHTML = tosafotText
		.replaceAll("} {", "}{")
		.replaceAll(headerRegex, "<b class='tosafot-header' style='font-weight: 600; font-size: 1.1em;'>$1</b>")
		.replaceAll(/<span class="shastitle7">/g, "<span class='shastitle7 tosafot-header' style='font-weight: 600; font-size: 1.1em;'>")
		.split('<br>')
		.map(line => {
			if (line.slice(0, hadran.length) == hadran) {
				return hadranDiv("tosafot", line);
			}
			return line;
		})
		.join('<br>');

	return {
		mainHTML,
		rashiHTML,
		tosafotHTML
	};
}

/**
 * Setup click handlers and sentence wrapping after rendering
 * Based on talmud-vue's onRendered functionality
 */
export function setupInteractivity(container: HTMLElement, onSentenceClick?: (index: number) => void, onCommentaryClick?: (index: number, type: 'rashi' | 'tosafot') => void) {
	// Setup main text sentence click handlers
	const mainSentences = container.querySelectorAll(".sentence-main");
	mainSentences.forEach((el, index) => {
		el.addEventListener("click", () => {
			// Remove previous highlights
			mainSentences.forEach(sentence => sentence.classList.remove('highlighted'));
			// Highlight clicked sentence
			el.classList.add('highlighted');
			
			// Scroll to selected element if needed
			const rect = el.getBoundingClientRect();
			const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
			if (rect.top < 0 || rect.bottom - viewHeight >= 0) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
			
			onSentenceClick?.(index);
		});
	});

	// Setup commentary wrappers and click handlers
	let count = 0;
	const setupWrapper = (header: Element, text: "tosafot" | "rashi") => {
		if (!header || header.parentElement?.classList.contains(`sentence-${text}`)) {
			return;
		}
		let curr = header.nextSibling;
		const betweenNodes = [];
		if (text == "tosafot") {
			if (!curr) {
				console.warn("Unexpected tosafot formatting");
				return;
			}
			betweenNodes.push(curr); // Curr is second header element (or first text element)
			curr = curr.nextSibling;
		}
		while (curr && (curr.nodeType == 3 || curr.nodeName == "BR")) {
			betweenNodes.push(curr);
			curr = curr.nextSibling;
		}
		const wrapper = document.createElement("span");
		wrapper.classList.add(`sentence-${text}`);
		header.parentNode?.insertBefore(wrapper, header);
		wrapper.append(header, ...betweenNodes);
		const index = count++;
		wrapper.addEventListener("click", () => {
			// Remove previous highlights
			container.querySelectorAll(`.sentence-${text}`).forEach(el => el.classList.remove('highlighted'));
			// Highlight clicked commentary
			wrapper.classList.add('highlighted');
			onCommentaryClick?.(index, text);
		});
	};

	// Setup Rashi wrappers
	const rashiHeaders = container.querySelectorAll(".rashi-header");
	console.log(`🔧 setupInteractivity: Found ${rashiHeaders.length} Rashi headers`);
	rashiHeaders.forEach((header) => setupWrapper(header, "rashi"));

	// Setup Tosafot wrappers
	count = 0;
	const tosafotHeaders = container.querySelectorAll(".tosafot-header");
	console.log(`🔧 setupInteractivity: Found ${tosafotHeaders.length} Tosafot headers`);
	tosafotHeaders.forEach((firstHeader) => setupWrapper(firstHeader, "tosafot"));
}