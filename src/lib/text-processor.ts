/**
 * Advanced text processing for Talmud text formatting
 * Based on talmud-vue implementation
 */

interface ProcessedTexts {
	mainHTML: string;
	rashiHTML: string;
	tosafotHTML: string;
}

export function processTextsForRenderer(mainText: string | string[], rashiText: string, tosafotText: string): ProcessedTexts {
	// Handle empty or null inputs
	if (!mainText) mainText = '';
	if (!rashiText) rashiText = '';
	if (!tosafotText) tosafotText = '';
	const headerRegex = /\{([^\{\}]+)\}/g;
	const hadran = "הדרן עלך";
	const hadranRegex = new RegExp(`<br>[\\w\\s]*${hadran}[\\w\\s]*<br>`, 'g');

	const hadranDiv = (text: "rashi" | "tosafot" | "main", html: string): string =>
		`<div class="hadran"><span class="sentence-${text}">${html.replace("<br>", "")}</span></div>`;

	// Process main text - handle both string and array formats
	let processedMainText: string;
	
	if (Array.isArray(mainText)) {
		// If it's already an array (like talmud-vue expects)
		processedMainText = mainText.join('<br>');
	} else {
		// If it's a string, convert newlines to <br>
		processedMainText = mainText.split('\n').join('<br>');
	}
	
	const mainHTML: string = processedMainText
		.split('|')    // Split by | delimiter for sentences
		.map(sentenceHTML => {
			const trimmed = sentenceHTML.trim();
			if (!trimmed) return '';
			if (trimmed.includes(hadran) && trimmed.split(' ').length < 7) {
				return hadranDiv("main", trimmed);
			}
			return `<span class="sentence-main">${trimmed}</span>`;
		})
		.filter(html => html) // Remove empty strings
		.join(' ')
		.replaceAll(headerRegex, "<b class='main-header'>$1</b>");

	// Process Rashi text
	const rashiHTML: string = rashiText
		.replaceAll(headerRegex, "<b class='rashi-header'>$1</b>")
		.split('<br>')
		.map(line => {
			if (line.slice(0, hadran.length) == hadran) {
				return hadranDiv("rashi", line);
			}
			return line;
		})
		.join('<br>');

	// Process Tosafot text
	const tosafotHTML: string = tosafotText
		.replaceAll("} {", "}{")
		.replaceAll(headerRegex, "<b class='tosafot-header'>$1</b>")
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
	container.querySelectorAll(".rashi-header")
		.forEach((header) => setupWrapper(header, "rashi"));

	// Setup Tosafot wrappers
	count = 0;
	container.querySelectorAll(".tosafot-header")
		.forEach((firstHeader) => setupWrapper(firstHeader, "tosafot"));
}