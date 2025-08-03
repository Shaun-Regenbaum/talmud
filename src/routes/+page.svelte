<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { talmudStore, currentPage, isLoading, pageError, pageInfo, sefariaData } from '$lib/stores/talmud';
	import { rendererStore } from '$lib/stores/renderer';
	import { processTextsForRenderer } from '$lib/text-processor-simple';
	import TranslationPopup from '$lib/components/TranslationPopup.svelte';
	import { openRouterTranslator } from '$lib/openrouter-translator';
	
	// Declare window property for cleanup function
	declare global {
		interface Window {
			__translationCleanup?: () => void;
		}
	}
	
	// Get data from load function
	let { data } = $props();
	
	let dafContainer = $state<HTMLDivElement>();
	
	// Responsive scaling variables
	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
	let rendered = $state(false);
	const dafWidth = 600; // Our content width (from default options)
	const dafOfWindow = 4.4 / 12; // Proportion of window width to use
	
	// Form state - initialized from URL
	let selectedTractate = $state(data.tractate);
	let selectedPage = $state(data.page);
	let selectedAmud = $state(data.amud);
	
	// Translation popup state
	let showTranslationPopup = $state(false);
	let translationPopupX = $state(0);
	let translationPopupY = $state(0);
	let selectedHebrewText = $state('');
	let selectedTranslation = $state('');
	
	
	// Subscribe to store updates
	$effect(() => {
		const info = $pageInfo;
		selectedTractate = info.tractate;
		selectedPage = info.page;
		selectedAmud = info.amud;
	});
	
	// Tractate options for the dropdown
	const tractateOptions = [
		{ value: 'Berakhot', label: 'ברכות', id: 1 },
		{ value: 'Shabbat', label: 'שבת', id: 2 },
		{ value: 'Eruvin', label: 'עירובין', id: 3 },
		{ value: 'Pesachim', label: 'פסחים', id: 4 },
		{ value: 'Shekalim', label: 'שקלים', id: 5 },
		{ value: 'Yoma', label: 'יומא', id: 6 },
		{ value: 'Sukkah', label: 'סוכה', id: 7 },
		{ value: 'Beitzah', label: 'ביצה', id: 8 },
		{ value: 'Rosh Hashanah', label: 'ראש השנה', id: 9 },
		{ value: 'Taanit', label: 'תענית', id: 10 },
		{ value: 'Megillah', label: 'מגילה', id: 11 },
		{ value: 'Moed Katan', label: 'מועד קטן', id: 12 },
		{ value: 'Chagigah', label: 'חגיגה', id: 13 },
		{ value: 'Yevamot', label: 'יבמות', id: 14 },
		{ value: 'Ketubot', label: 'כתובות', id: 15 },
		{ value: 'Nedarim', label: 'נדרים', id: 16 },
		{ value: 'Nazir', label: 'נזיר', id: 17 },
		{ value: 'Sotah', label: 'סוטה', id: 18 },
		{ value: 'Gittin', label: 'גיטין', id: 19 },
		{ value: 'Kiddushin', label: 'קידושין', id: 20 },
		{ value: 'Bava Kamma', label: 'בבא קמא', id: 21 },
		{ value: 'Bava Metzia', label: 'בבא מציעא', id: 22 },
		{ value: 'Bava Batra', label: 'בבא בתרא', id: 23 },
		{ value: 'Sanhedrin', label: 'סנהדרין', id: 24 },
		{ value: 'Makkot', label: 'מכות', id: 25 },
		{ value: 'Shevuot', label: 'שבועות', id: 26 },
		{ value: 'Avodah Zarah', label: 'עבודה זרה', id: 27 },
		{ value: 'Horayot', label: 'הוריות', id: 28 },
		{ value: 'Zevachim', label: 'זבחים', id: 29 },
		{ value: 'Menachot', label: 'מנחות', id: 30 },
		{ value: 'Chullin', label: 'חולין', id: 31 },
		{ value: 'Bekhorot', label: 'בכורות', id: 32 },
		{ value: 'Arakhin', label: 'ערכין', id: 33 },
		{ value: 'Temurah', label: 'תמורה', id: 34 },
		{ value: 'Keritot', label: 'כריתות', id: 35 },
		{ value: 'Meilah', label: 'מעילה', id: 36 },
		{ value: 'Niddah', label: 'נידה', id: 37 }
	];
	
	// Format text for daf-renderer with HTML spans
	function formatText(text: string, prefix: string): string {
		if (!text || text.trim() === '') {
			return `<span class='sentence' id='sentence-${prefix}-0'></span>`;
		}
		
		// Check if text already contains HTML
		const hasHTML = /<[^>]+>/.test(text);
		
		if (hasHTML) {
			// If it already has HTML, just wrap it in a container
			return `<div class='${prefix}-content'>${text}</div>`;
		}
		
		let html = '';
		let wordId = 0;
		
		// Split by newlines first, then into words
		const lines = text.split(/\n+/);
		lines.forEach((line, lineIndex) => {
			if (line.trim()) {
				html += `<span class='sentence' id='sentence-${prefix}-${lineIndex}'>`;
				const words = line.trim().split(/\s+/);
				words.forEach(word => {
					if (word) {
						html += `<span class='word' id='word-${prefix}-${wordId}'>${word}</span> `;
						wordId++;
					}
				});
				html += '</span> ';
			}
		});
		
		return html.trim() || `<span class='sentence' id='sentence-${prefix}-0'></span>`;
	}
	


	// Handle rendering when page data changes
	$effect(() => {
		const pageData = $currentPage;
		const loading = $isLoading;
		
		if (loading || !pageData || !dafContainer) {
			return;
		}
		
		console.log('Effect: Rendering data for', pageData.tractate, pageData.daf + pageData.amud);
		
		// Debug: Check if pageData contains <br> tags before processing
		console.log('Raw pageData mainText contains <br>:', pageData.mainText?.includes('<br>'));
		console.log('Raw pageData mainText first 200 chars:', pageData.mainText?.substring(0, 200));
		
		// Add a small delay to ensure DOM is stable after loading state changes
		setTimeout(() => {
			// Initialize renderer only once
			if (!rendererStore.getRenderer()) {
				rendererStore.initialize(dafContainer);
			}
			
			// Get Sefaria data if available for clean sentence divisions
			const sefariaPageData = $sefariaData;
			
			console.log('Sefaria data available:', {
				hasSefariaData: !!sefariaPageData,
				mainSegments: sefariaPageData?.mainText?.length || 0,
				rashiSegments: sefariaPageData?.rashi?.length || 0,
				tosafotSegments: sefariaPageData?.tosafot?.length || 0
			});
			
			// Process texts using enhanced text processor with smart fallback
			const { mainHTML, rashiHTML, tosafotHTML } = processTextsForRenderer(
				// Use Sefaria segments if available and non-empty, otherwise fall back to HebrewBooks strings
				(sefariaPageData?.mainText?.length > 0) ? sefariaPageData.mainText : pageData.mainText || ' ',
				(sefariaPageData?.rashi?.length > 0) ? sefariaPageData.rashi : pageData.rashi || ' ',
				(sefariaPageData?.tosafot?.length > 0) ? sefariaPageData.tosafot : pageData.tosafot || ' ',
				{
					enableSentenceDivisions: true,
					fallbackToHebrewBooks: true,
					// Pass Sefaria segments for applying to HebrewBooks text when needed
					sefariaSegments: {
						main: sefariaPageData?.mainText || [],
						rashi: sefariaPageData?.rashi || [],
						tosafot: sefariaPageData?.tosafot || []
					},
					// Pass linking data for filtering commentary segments
					linking: sefariaPageData?.linking || {}
				}
			);
			const pageLabel = (pageData.daf + pageData.amud).replace('a', 'א').replace('b', 'ב');
			
			console.log('Processed text lengths:', {
				main: mainHTML.length,
				rashi: rashiHTML.length,
				tosafot: tosafotHTML.length
			});
			
			// Small delay to ensure renderer is ready
			setTimeout(() => {
				rendererStore.render(mainHTML, rashiHTML, tosafotHTML, pageLabel);
				
				// Check for spacing issues after render
				setTimeout(() => {
					const renderer = rendererStore.getRenderer();
					if (renderer && renderer.checkExcessiveSpacing) {
						renderer.checkExcessiveSpacing();
					}
				}, 100);
				
				// Apply dynamic layer selection after rendering
				setTimeout(() => {
					console.log('✅ Traditional daf-renderer layout ready');
					
					// Set up bidirectional linking if Sefaria data is available
					// TEMPORARILY DISABLED - not working correctly
					// if (sefariaPageData?.linking) {
					// 	setupBidirectionalLinking(sefariaPageData.linking, {
					// 		tractate: pageData.tractate,
					// 		daf: pageData.daf,
					// 		amud: pageData.amud
					// 	});
					// }
					
					// Set up text selection handling for translations
					// Always set up if we have Hebrew text and either Sefaria translations or OpenRouter
					if (sefariaPageData?.mainText || pageData.mainText) {
						setupTextSelectionHandling(
							sefariaPageData?.mainText || [pageData.mainText],
							sefariaPageData?.mainTextEnglish || []
						);
					}
					
					// Mark as rendered for scaling
					rendered = true;
				}, 300);
			}, 50);
		}, 100);
	});
	
	// Watch for data changes from navigation
	// In Svelte 5, we need to be explicit about what triggers the effect
	$effect(() => {
		// Access data properties to make them reactive dependencies
		const { tractate, page: pageNum, amud } = data;
		
		// Update form state when data changes
		selectedTractate = tractate;
		selectedPage = pageNum;
		selectedAmud = amud;
		
		// Load the new page
		console.log('Loading page from data:', { tractate, pageNum, amud });
		talmudStore.loadPage(tractate, pageNum, amud);
	});
	
	onMount(async () => {
		// Initial load is handled by the effect above
		console.log('Component mounted with data:', data);
		
		// Setup window resize handler
		const handleResize = () => {
			windowWidth = window.innerWidth;
			rendered = false;
			// Re-enable rendered after a short delay
			setTimeout(() => rendered = true, 100);
		};
		
		window.addEventListener('resize', handleResize);
		
		// Cleanup on unmount
		return () => {
			window.removeEventListener('resize', handleResize);
			// Clean up translation event listeners if they exist
			if (window.__translationCleanup) {
				window.__translationCleanup();
				delete window.__translationCleanup;
			}
		};
	});
	
	// Function to handle form submission
	async function handlePageChange() {
		console.log('handlePageChange called with:', { selectedTractate, selectedPage, selectedAmud });
		
		// Update the URL using SvelteKit navigation
		const params = new URLSearchParams({
			tractate: selectedTractate,
			page: selectedPage,
			amud: selectedAmud
		});
		
		// Force a full page reload to ensure clean rendering
		window.location.href = `?${params.toString()}`;
	}
	
	// Generate transform style for responsive scaling
	function getTransformStyle(): string {
		// TEMPORARILY DISABLED FOR DEBUGGING
		return '';
		
		// if (!rendered) return '';
		// const scale = Math.min(1, (windowWidth * dafOfWindow) / dafWidth); // Cap at 1x scale
		// return scale < 1 ? `transform: scale(${scale}); transform-origin: top left;` : '';
	}
	
	// Generate Hebrew page numbers
	function getHebrewPageNumber(num: number): string {
		const hebrewNumbers: Record<number, string> = {
			1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י',
			11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ',
			21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל',
			31: 'לא', 32: 'לב', 33: 'לג', 34: 'לד', 35: 'לה', 36: 'לו', 37: 'לז', 38: 'לח', 39: 'לט', 40: 'מ',
			41: 'מא', 42: 'מב', 43: 'מג', 44: 'מד', 45: 'מה', 46: 'מו', 47: 'מז', 48: 'מח', 49: 'מט', 50: 'נ',
			51: 'נא', 52: 'נב', 53: 'נג', 54: 'נד', 55: 'נה', 56: 'נו', 57: 'נז', 58: 'נח', 59: 'נט', 60: 'ס',
			61: 'סא', 62: 'סב', 63: 'סג', 64: 'סד', 65: 'סה', 66: 'סו', 67: 'סז', 68: 'סח', 69: 'סט', 70: 'ע',
			71: 'עא', 72: 'עב', 73: 'עג', 74: 'עד', 75: 'עה', 76: 'עו'
		};
		return hebrewNumbers[num] || num.toString();
	}

	// Text selection handling for translations
	function setupTextSelectionHandling(hebrewSegments: string[], englishSegments: string[]) {
		console.log('📖 Setting up text selection handling for translations');
		console.log(`📊 Hebrew segments: ${hebrewSegments.length}, English segments: ${englishSegments.length}`);
		
		// Always set up if OpenRouter is configured, even without Sefaria translations
		if (!openRouterTranslator.isConfigured() && (!englishSegments || englishSegments.length === 0)) {
			console.log('⚠️ No translation method available (no OpenRouter API key and no Sefaria translations)');
			return;
		}
		
		// Handle text selection on the daf container
		const handleMouseUp = (event: MouseEvent) => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) {
				showTranslationPopup = false;
				return;
			}
			
			const selectedText = selection.toString().trim();
			if (!selectedText) {
				showTranslationPopup = false;
				return;
			}
			
			console.log('🔍 Text selected:', selectedText);
			
			// Find which sentence span contains the selection
			const range = selection.getRangeAt(0);
			const container = range.commonAncestorContainer;
			
			// Find the parent sentence span
			let sentenceSpan = container.nodeType === Node.TEXT_NODE 
				? container.parentElement 
				: container as Element;
				
			// Also check if we're inside the daf container
			let insideDaf = false;
			let checkElement = sentenceSpan;
			while (checkElement) {
				if (checkElement.id === 'dafRoot' || 
					checkElement.classList?.contains('dafContainer') ||
					checkElement.classList?.contains('content_area') ||
					checkElement.classList?.contains('maintext')) {
					insideDaf = true;
					break;
				}
				checkElement = checkElement.parentElement;
			}
			
			// Debug: log what containers we found
			console.log('🔍 Container check:', {
				insideDaf,
				containerClasses: sentenceSpan?.parentElement?.className,
				parentId: sentenceSpan?.parentElement?.id
			});
			
			// For now, skip this check to see if the rest works
			// if (!insideDaf) {
			// 	console.log('⚠️ Selection not inside daf container');
			// 	return;
			// }
				
			while (sentenceSpan && !sentenceSpan.classList.contains('sentence-main')) {
				sentenceSpan = sentenceSpan.parentElement;
				// Stop if we've gone too far up
				if (sentenceSpan?.id === 'dafRoot') {
					sentenceSpan = null;
					break;
				}
			}
			
			if (sentenceSpan && sentenceSpan.classList.contains('sentence-main')) {
				const sentenceIndex = parseInt(sentenceSpan.getAttribute('data-sentence-index') || '0');
				console.log(`📍 Selection in sentence ${sentenceIndex}`);
				
				// Always use OpenRouter if configured, with Sefaria as context
				if (openRouterTranslator.isConfigured()) {
					console.log(`🤖 Using OpenRouter for sentence ${sentenceIndex}`);
					selectedHebrewText = selectedText;
					selectedTranslation = 'Translating...';
					
					// Position the popup near the selection with viewport boundary checks
					const rect = range.getBoundingClientRect();
					const popupWidth = 400; // Max width from TranslationPopup.svelte
					const popupHeight = 250; // Conservative estimate for height with translation
					const padding = 20; // More padding for safety
					
					// Calculate X position - prevent bleeding off right edge
					translationPopupX = rect.left;
					if (translationPopupX + popupWidth > window.innerWidth - padding) {
						translationPopupX = window.innerWidth - popupWidth - padding;
					}
					// Prevent bleeding off left edge
					if (translationPopupX < padding) {
						translationPopupX = padding;
					}
					
					// Calculate Y position - prefer below selection, but flip above if needed
					translationPopupY = rect.bottom + 10;
					if (translationPopupY + popupHeight > window.innerHeight - padding) {
						// Show above selection instead
						translationPopupY = rect.top - popupHeight - 10;
						// If still off screen, just position at bottom of viewport
						if (translationPopupY < padding) {
							translationPopupY = window.innerHeight - popupHeight - padding;
						}
					}
					
					showTranslationPopup = true;
					
					// Build context including Sefaria translation if available
					let contextInfo = `Talmud ${$pageInfo.tractate} ${$pageInfo.page}${$pageInfo.amud}`;
					if (englishSegments && englishSegments[sentenceIndex]) {
						contextInfo += `\n\nSefaria translation: "${englishSegments[sentenceIndex]}"`;
					}
					
					// Optionally include surrounding Sefaria translations for better context
					const contextWindow = 2; // Include 2 sentences before and after
					for (let i = Math.max(0, sentenceIndex - contextWindow); i <= Math.min(sentenceIndex + contextWindow, (englishSegments?.length || 0) - 1); i++) {
						if (i !== sentenceIndex && englishSegments && englishSegments[i]) {
							contextInfo += `\n\n[Sentence ${i}] Hebrew: "${hebrewSegments[i]?.replace(/<[^>]*>/g, '').trim() || ''}"`;
							contextInfo += `\n[Sentence ${i}] Sefaria: "${englishSegments[i]}"`;
						}
					}
					
					// Fetch translation from OpenRouter
					openRouterTranslator.translateText({
						text: hebrewSegments[sentenceIndex] || selectedText,
						context: contextInfo
					}).then(response => {
						selectedTranslation = response.translation;
						console.log('✅ OpenRouter translation received');
					}).catch(error => {
						console.error('❌ OpenRouter translation error:', error);
						selectedTranslation = 'Translation failed';
					});
				} else if (englishSegments && englishSegments[sentenceIndex]) {
					// Fall back to Sefaria if no OpenRouter
					selectedHebrewText = selectedText;
					selectedTranslation = englishSegments[sentenceIndex];
					
					// Position the popup near the selection with viewport boundary checks
					const rect = range.getBoundingClientRect();
					const popupWidth = 400; // Max width from TranslationPopup.svelte
					const popupHeight = 250; // Conservative estimate for height with translation
					const padding = 20; // More padding for safety
					
					// Calculate X position - prevent bleeding off right edge
					translationPopupX = rect.left;
					if (translationPopupX + popupWidth > window.innerWidth - padding) {
						translationPopupX = window.innerWidth - popupWidth - padding;
					}
					// Prevent bleeding off left edge
					if (translationPopupX < padding) {
						translationPopupX = padding;
					}
					
					// Calculate Y position - prefer below selection, but flip above if needed
					translationPopupY = rect.bottom + 10;
					if (translationPopupY + popupHeight > window.innerHeight - padding) {
						// Show above selection instead
						translationPopupY = rect.top - popupHeight - 10;
						// If still off screen, just position at bottom of viewport
						if (translationPopupY < padding) {
							translationPopupY = window.innerHeight - popupHeight - padding;
						}
					}
					
					showTranslationPopup = true;
					console.log('✅ Showing translation popup from Sefaria');
				} else {
					console.log(`⚠️ No translation available for sentence ${sentenceIndex}`);
				}
			} else {
				console.log('⚠️ Selection not in a sentence span, trying fallback approach');
				
				// Fallback: Find which Hebrew segment contains the selected text
				let foundIndex = -1;
				for (let i = 0; i < hebrewSegments.length; i++) {
					// Clean both texts for comparison
					const cleanSegment = hebrewSegments[i].replace(/<[^>]*>/g, '').trim();
					if (cleanSegment.includes(selectedText) || selectedText.includes(cleanSegment)) {
						foundIndex = i;
						break;
					}
				}
				
				if (foundIndex >= 0) {
					console.log(`📍 Found text in segment ${foundIndex} via fallback`);
					
					if (openRouterTranslator.isConfigured()) {
						// Always use OpenRouter with Sefaria context
						console.log(`🤖 Using OpenRouter for fallback translation`);
						selectedHebrewText = selectedText;
						selectedTranslation = 'Translating...';
						
						// Position the popup near the selection
						const rect = range.getBoundingClientRect();
						translationPopupX = rect.left;
						translationPopupY = rect.bottom + 10;
						
						showTranslationPopup = true;
						
						// Build context including Sefaria translation if available
						let contextInfo = `Talmud ${$pageInfo.tractate} ${$pageInfo.page}${$pageInfo.amud}`;
						if (englishSegments && englishSegments[foundIndex]) {
							contextInfo += `\n\nSefaria translation: "${englishSegments[foundIndex]}"`;
						}
						
						// Include surrounding context
						const contextWindow = 2;
						for (let i = Math.max(0, foundIndex - contextWindow); i <= Math.min(foundIndex + contextWindow, (englishSegments?.length || 0) - 1); i++) {
							if (i !== foundIndex && englishSegments && englishSegments[i]) {
								contextInfo += `\n\n[Sentence ${i}] Hebrew: "${hebrewSegments[i]?.replace(/<[^>]*>/g, '').trim() || ''}"`;
								contextInfo += `\n[Sentence ${i}] Sefaria: "${englishSegments[i]}"`;
							}
						}
						
						// Fetch translation from OpenRouter
						openRouterTranslator.translateText({
							text: selectedText,
							context: contextInfo
						}).then(response => {
							selectedTranslation = response.translation;
							console.log('✅ OpenRouter translation received');
						}).catch(error => {
							console.error('❌ OpenRouter translation error:', error);
							selectedTranslation = 'Translation failed';
						});
					} else if (englishSegments && englishSegments[foundIndex]) {
						// Fall back to Sefaria if no OpenRouter
						selectedHebrewText = selectedText;
						selectedTranslation = englishSegments[foundIndex];
						
						// Position the popup near the selection
						const rect = range.getBoundingClientRect();
						translationPopupX = rect.left;
						translationPopupY = rect.bottom + 10;
						
						showTranslationPopup = true;
						console.log('✅ Showing translation popup from Sefaria');
					}
				} else if (openRouterTranslator.isConfigured() && selectedText.length > 5) {
					// Direct translation of selected text if we can't find the segment
					console.log('🤖 Using OpenRouter for direct text translation');
					selectedHebrewText = selectedText;
					selectedTranslation = 'Translating...';
					
					// Position the popup near the selection with viewport boundary checks
					const rect = range.getBoundingClientRect();
					const popupWidth = 400; // Max width from TranslationPopup.svelte
					const popupHeight = 250; // Conservative estimate for height with translation
					const padding = 20; // More padding for safety
					
					// Calculate X position - prevent bleeding off right edge
					translationPopupX = rect.left;
					if (translationPopupX + popupWidth > window.innerWidth - padding) {
						translationPopupX = window.innerWidth - popupWidth - padding;
					}
					// Prevent bleeding off left edge
					if (translationPopupX < padding) {
						translationPopupX = padding;
					}
					
					// Calculate Y position - prefer below selection, but flip above if needed
					translationPopupY = rect.bottom + 10;
					if (translationPopupY + popupHeight > window.innerHeight - padding) {
						// Show above selection instead
						translationPopupY = rect.top - popupHeight - 10;
						// If still off screen, just position at bottom of viewport
						if (translationPopupY < padding) {
							translationPopupY = window.innerHeight - popupHeight - padding;
						}
					}
					
					showTranslationPopup = true;
					
					// Build context from all available Sefaria translations
					let contextInfo = `Talmud ${$pageInfo.tractate} ${$pageInfo.page}${$pageInfo.amud}`;
					if (englishSegments && englishSegments.length > 0) {
						contextInfo += '\n\nAvailable Sefaria translations from this page:';
						// Include first few translations for context
						const maxContext = 5;
						for (let i = 0; i < Math.min(maxContext, englishSegments.length); i++) {
							if (englishSegments[i]) {
								contextInfo += `\n\n[Sentence ${i}] Hebrew: "${hebrewSegments[i]?.replace(/<[^>]*>/g, '').trim() || ''}"`;
								contextInfo += `\n[Sentence ${i}] Sefaria: "${englishSegments[i]}"`;
							}
						}
					}
					
					// Fetch translation from OpenRouter
					openRouterTranslator.translateText({
						text: selectedText,
						context: contextInfo
					}).then(response => {
						selectedTranslation = response.translation;
						console.log('✅ OpenRouter translation received');
					}).catch(error => {
						console.error('❌ OpenRouter translation error:', error);
						selectedTranslation = 'Translation failed';
					});
				} else {
					console.log('⚠️ Could not find translation for selected text');
				}
			}
		};
		
		// Hide popup when clicking elsewhere
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target.closest('.translation-popup')) {
				showTranslationPopup = false;
			}
		};
		
		// Add event listeners
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousedown', handleMouseDown);
		
		// Store cleanup function to be called later
		window.__translationCleanup = () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mousedown', handleMouseDown);
		};
	}
	
	// Bidirectional linking functionality
	function setupBidirectionalLinking(linking: any, pageInfo: { tractate: string, daf: string, amud: string }) {
		console.log('🔗 Setting up bidirectional linking for', `${pageInfo.tractate} ${pageInfo.daf}${pageInfo.amud}`);
		
		const baseRef = `${pageInfo.tractate} ${pageInfo.daf}${pageInfo.amud}`;
		const rashiLinking = linking?.rashi || {};
		const tosafotLinking = linking?.tosafot || {};
		
		console.log('📊 Linking data:', { rashiLinking, tosafotLinking });
		
		// Set up event listeners for main text sentence spans
		setupMainTextHovering(baseRef, rashiLinking, tosafotLinking);
		
		// Set up event listeners for commentary spans (when they exist)
		setupCommentaryHovering(baseRef, rashiLinking, tosafotLinking);
	}
	
	function setupMainTextHovering(baseRef: string, rashiLinking: any, tosafotLinking: any) {
		// Find all main text sentence spans created by our text processor
		const mainSentenceSpans = document.querySelectorAll('.sentence-main');
		console.log(`🎯 Found ${mainSentenceSpans.length} main text sentence spans`);
		
		mainSentenceSpans.forEach((span) => {
			const sentenceIndex = parseInt(span.getAttribute('data-sentence-index') || '0');
			
			span.addEventListener('mouseenter', () => {
				highlightLinkedCommentary(sentenceIndex, baseRef, rashiLinking, tosafotLinking);
			});
			
			span.addEventListener('mouseleave', () => {
				clearCommentaryHighlight();
			});
		});
	}
	
	function setupCommentaryHovering(baseRef: string, rashiLinking: any, tosafotLinking: any) {
		// Set up hovering for Rashi spans
		const rashiSpans = document.querySelectorAll('.sentence-rashi');
		console.log(`🎯 Found ${rashiSpans.length} Rashi sentence spans`);
		
		rashiSpans.forEach((span) => {
			const sentenceIndex = parseInt(span.getAttribute('data-sentence-index') || '0');
			
			span.addEventListener('mouseenter', () => {
				highlightLinkedMainText(sentenceIndex, 'rashi', baseRef, rashiLinking);
			});
			
			span.addEventListener('mouseleave', () => {
				clearMainTextHighlight();
			});
		});
		
		// Set up hovering for Tosafot spans
		const tosafotSpans = document.querySelectorAll('.sentence-tosafot');
		console.log(`🎯 Found ${tosafotSpans.length} Tosafot sentence spans`);
		
		tosafotSpans.forEach((span) => {
			const sentenceIndex = parseInt(span.getAttribute('data-sentence-index') || '0');
			
			span.addEventListener('mouseenter', () => {
				highlightLinkedMainText(sentenceIndex, 'tosafot', baseRef, tosafotLinking);
			});
			
			span.addEventListener('mouseleave', () => {
				clearMainTextHighlight();
			});
		});
	}
	
	function highlightLinkedCommentary(mainSegmentIndex: number, baseRef: string, rashiLinking: any, tosafotLinking: any) {
		console.log(`🔍 Highlighting commentary linked to main segment ${mainSegmentIndex}`);
		
		// Clear previous highlights
		clearCommentaryHighlight();
		
		// Highlight linked Rashi segments
		const linkedRashiIndexes = rashiLinking[baseRef]?.[mainSegmentIndex] || [];
		linkedRashiIndexes.forEach((index: number) => {
			const element = document.querySelector(`.sentence-rashi[data-sentence-index="${index}"]`);
			if (element) {
				element.classList.add('highlighted-commentary');
				console.log(`✅ Highlighted Rashi segment ${index}`);
			}
		});
		
		// Highlight linked Tosafot segments
		const linkedTosafotIndexes = tosafotLinking[baseRef]?.[mainSegmentIndex] || [];
		linkedTosafotIndexes.forEach((index: number) => {
			const element = document.querySelector(`.sentence-tosafot[data-sentence-index="${index}"]`);
			if (element) {
				element.classList.add('highlighted-commentary');
				console.log(`✅ Highlighted Tosafot segment ${index}`);
			}
		});
	}
	
	function highlightLinkedMainText(commentaryIndex: number, type: 'rashi' | 'tosafot', baseRef: string, linking: any) {
		console.log(`🔍 Highlighting main text linked to ${type} segment ${commentaryIndex}`);
		
		// Clear previous highlights
		clearMainTextHighlight();
		
		// Find main text segments linked to this commentary
		const linkedMainSegments: number[] = [];
		Object.entries(linking[baseRef] || {}).forEach(([mainSegmentIndex, commentaryIndexes]: [string, any]) => {
			if (Array.isArray(commentaryIndexes) && commentaryIndexes.includes(commentaryIndex)) {
				linkedMainSegments.push(parseInt(mainSegmentIndex));
			}
		});
		
		// Highlight linked main text segments
		linkedMainSegments.forEach(segmentIndex => {
			const element = document.querySelector(`.sentence-main[data-sentence-index="${segmentIndex}"]`);
			if (element) {
				element.classList.add('highlighted-main');
				console.log(`✅ Highlighted main text segment ${segmentIndex}`);
				
				// Auto-scroll to first segment if out of view
				if (segmentIndex === linkedMainSegments[0]) {
					const rect = element.getBoundingClientRect();
					const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
					if (rect.top < 0 || rect.bottom - viewHeight >= 0) {
						element.scrollIntoView({ behavior: 'smooth', block: 'center' });
					}
				}
			}
		});
	}
	
	function clearCommentaryHighlight() {
		document.querySelectorAll('.highlighted-commentary').forEach(el => {
			el.classList.remove('highlighted-commentary');
		});
	}
	
	function clearMainTextHighlight() {
		document.querySelectorAll('.highlighted-main').forEach(el => {
			el.classList.remove('highlighted-main');
		});
	}
</script>

<main class="min-h-screen bg-gray-100 p-8">
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Header -->
		<div class="bg-white rounded-lg shadow-md p-8">
			<h1 class="text-4xl font-bold text-gray-800 mb-4">Talmud Study Application</h1>
			<p class="text-gray-600 mb-6">
				Interactive Talmud study with AI-powered translations and analysis
			</p>
		</div>

		<!-- Daf Renderer -->
		<div class="bg-white rounded-lg shadow-md p-8">
			<div class="flex items-center justify-between mb-6">
				<h2 class="text-2xl font-bold text-gray-800">
					{$pageInfo.tractate} {$pageInfo.fullPage}
				</h2>
				
				<!-- Page Navigation Form -->
				<div class="flex items-center gap-4 flex-wrap">
					<!-- Tractate Selector -->
					<div class="flex items-center gap-2">
						<label for="tractate-select" class="text-sm font-medium text-gray-700">מסכת:</label>
						<select 
							id="tractate-select"
							bind:value={selectedTractate}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={$isLoading}
						>
							{#each tractateOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					
					<!-- Page Number Input -->
					<div class="flex items-center gap-2">
						<label for="page-select" class="text-sm font-medium text-gray-700">דף:</label>
						<select 
							id="page-select"
							bind:value={selectedPage}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"
							disabled={$isLoading}
						>
							{#each Array.from({length: 76}, (_, i) => i + 2) as pageNum}
								<option value={pageNum.toString()}>{getHebrewPageNumber(pageNum)}</option>
							{/each}
						</select>
					</div>
					
					<!-- Amud Selector -->
					<div class="flex items-center gap-2">
						<label for="amud-select" class="text-sm font-medium text-gray-700">עמוד:</label>
						<select 
							id="amud-select"
							bind:value={selectedAmud}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={$isLoading}
						>
							<option value="a">א</option>
							<option value="b">ב</option>
						</select>
					</div>
					
					<!-- Go Button -->
					<button 
						onclick={handlePageChange}
						class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
						disabled={$isLoading}
					>
						{$isLoading ? 'טוען...' : 'עבור'}
					</button>
					
				</div>
			</div>
			
			<!-- Loading State -->
			{#if $isLoading}
				<div class="w-full h-[800px] border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center">
					<div class="text-center">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
						<p class="mt-4 text-gray-600">Loading Talmud page...</p>
					</div>
				</div>
			{:else if $pageError}
				<div class="w-full h-[800px] border border-red-300 rounded-lg bg-red-50 flex items-center justify-center">
					<div class="text-center">
						<p class="text-red-600 font-semibold">Error loading page</p>
						<p class="text-red-500 mt-2">{$pageError}</p>
						<button 
							onclick={() => talmudStore.loadPage($pageInfo.tractate, $pageInfo.page, $pageInfo.amud)}
							class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
						>
							Retry
						</button>
					</div>
				</div>
			{:else}
				<!-- Always show the container, even if no data yet -->
				<div>
					<!-- Container for the daf renderer -->
					<div bind:this={dafContainer} class="daf" style="position: relative; {getTransformStyle()}">
						<!-- The daf-renderer will populate this container -->
						{#if !$currentPage}
							<div class="flex items-center justify-center h-full text-gray-400">
								<p>Select a page to view</p>
							</div>
						{/if}
					</div>
					
					<!-- Traditional daf-renderer layout only -->
					
					<span class="preload">preload</span>
					
					<!-- Page info below the daf -->
					{#if $currentPage}
						<div class="mt-8 space-y-4">
							<div class="border-t pt-4">
								<p class="text-sm text-gray-500">
									Source: HebrewBooks.org | {$currentPage.tractate} {$currentPage.daf}{$currentPage.amud}
								</p>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="text-center text-sm text-gray-500">
			<p>Powered by daf-renderer, Sefaria API, and OpenRouter</p>
		</div>
	</div>
	
	<!-- Translation Popup -->
	<TranslationPopup 
		x={translationPopupX}
		y={translationPopupY}
		selectedText={selectedHebrewText}
		translation={selectedTranslation}
		visible={showTranslationPopup}
	/>
	
</main>

<style>
	/* Import daf-renderer styles */
	@import '$lib/daf-renderer/styles.css';
	
	/* Hebrew fonts are loaded via app.css */
	
	/* Ensure daf-renderer content is visible */
	:global(.dafRoot) {
		position: relative;
		width: 600px;
		margin: 0 auto;
	}
	
	:global(.daf .text) {
		opacity: 1;
		visibility: visible;
		display: block;
	}
	
	:global(.daf .spacer) {
		display: block;
	}
	
	/* Ensure text spans are visible */
	:global(.daf span) {
		display: inline !important;
		opacity: 1 !important;
		visibility: visible !important;
	}
	
	/* Force font sizes to prevent 0px issue - using default options */
	:global(.dafRoot .main .text span) {
		font-size: 15px !important;
		font-family: "Vilna", serif !important;
	}
	
	:global(.dafRoot .inner .text span) {
		font-size: 10.5px !important;
		font-family: "Rashi", serif !important;
	}
	
	:global(.dafRoot .outer .text span) {
		font-size: 10.5px !important;
		font-family: "Rashi", serif !important;
	}
	
	/* Force layout dimensions - using default options */
	:global(.dafRoot) {
		width: 600px !important;
		--contentWidth: 600px !important;
		--mainWidth: 50% !important;
		--fontSize-main: 15px !important;
		--fontSize-side: 10.5px !important;
		--lineHeight-main: 17px !important;
		--lineHeight-side: 14px !important;
	}
	
	:global(.dafRoot .main),
	:global(.dafRoot .inner),  
	:global(.dafRoot .outer) {
		width: 600px !important;
	}
	
	:global(.dafRoot .text) {
		width: 100% !important;
	}
	
	/* Talmud-vue styling improvements */
	:global(.daf div) {
		text-align-last: initial !important;
	}
	
	/* Hadran styling */
	:global(div.hadran) {
		display: flex;
		justify-content: center;
		font-size: 135%;
		font-family: Vilna;
		transform: translateY(50%);
	}
	
	:global(.hadran span) {
		display: inline-block;
	}
	
	/* Sentence highlighting */
	:global(.sentence-main.highlighted) {
		background-color: #BFDBFE;
	}
	
	:global(.sentence-rashi.highlighted) {
		background-color: #FECACA;
	}
	
	:global(.sentence-tosafot.highlighted) {
		background-color: #FECACA;
	}

	/* Enhanced bidirectional highlighting - TEMPORARILY DISABLED */
	/* :global(.sentence-main.highlighted-main) {
		background-color: #FEF3C7 !important;
		border: 2px solid #F59E0B;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	:global(.sentence-rashi.highlighted-commentary) {
		background-color: #DBEAFE !important;
		border: 2px solid #3B82F6;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	:global(.sentence-tosafot.highlighted-commentary) {
		background-color: #D1FAE5 !important;
		border: 2px solid #10B981;
		border-radius: 3px;
		transition: all 0.2s ease;
	} */
	
	/* Preload font */
	:global(.preload) {
		font-family: Vilna;
		opacity: 0;
	}
	
	/* Header styling */
	:global(.tosafot-header) {
		font-family: Vilna;
		font-size: 135%;
		vertical-align: bottom;
	}
	
	:global(.tosafot-header:nth-of-type(odd)) {
		font-size: 180%;
		vertical-align: bottom;
	}
	
	:global(.main-header, .rashi-header) {
		font-weight: bold;
	}
	
</style>