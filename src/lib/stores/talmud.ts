/**
 * @fileoverview Talmud Store - Central state management for Talmud pages
 * 
 * This store manages the loading and caching of Talmud pages from the daf-supplier API.
 * It handles:
 * - Page navigation and loading states
 * - Error handling and recovery
 * - Data transformation from API format to internal format
 * - Line break conversion for proper rendering
 * 
 * The store provides derived stores for convenient access to specific parts of the state:
 * - currentPage: The current page data
 * - isLoading: Loading state
 * - pageError: Error state
 * - pageInfo: Current page metadata
 */

import { writable, derived, get } from 'svelte/store';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/api/hebrewbooks';
import type { HebrewBooksPage } from '$lib/api/hebrewbooks';

/**
 * State shape for the Talmud page store
 */
export interface TalmudPageState {
	/** Current tractate name (e.g., "Berakhot") */
	tractate: string;
	/** Page number (e.g., "2") */
	page: string;
	/** Side of page - 'a' (recto) or 'b' (verso) */
	amud: string;
	/** Loaded page data */
	data: HebrewBooksPage | null;
	/** Whether page is currently loading */
	loading: boolean;
	/** Error message if load failed */
	error: string | null;
}

/**
 * Creates the main Talmud store for managing page state
 * @returns {Object} Store object with methods for page management
 */
function createTalmudStore() {
	const { subscribe, set, update } = writable<TalmudPageState>({
		tractate: 'Berakhot',
		page: '2',
		amud: 'a',
		data: null,
		loading: false,
		error: null
	});

	return {
		subscribe,
		
		/**
		 * Load a Talmud page from the daf-supplier API
		 * 
		 * @param {string} tractate - Tractate name (e.g., "Berakhot")
		 * @param {string} pageNum - Page number (e.g., "2")
		 * @param {string} amud - Side of page ('a' or 'b')
		 * @param {Object} options - Loading options
		 * @param {boolean} options.lineBreakMode - Whether to preserve line breaks (always true from API)
		 */
		async loadPage(tractate: string, pageNum: string, amud: string, options: { lineBreakMode?: boolean } = {}) {
			const fullPage = `${pageNum}${amud}`;
			
			// Set loading state - keep old data during navigation to prevent renderer clearing
			update(state => ({
				...state,
				tractate,
				page: pageNum,
				amud,
				loading: true,
				error: null
				// Don't clear data during navigation to prevent renderer from disappearing
			}));

			try {
				// Get tractate ID
				const mesechtaId = TRACTATE_IDS[tractate];
				if (!mesechtaId) {
					throw new Error(`Unknown tractate: ${tractate}`);
				}
				
				// Convert daf format to HebrewBooks format (2a -> 2, 2b -> 2b)
				const dafForAPI = convertDafToHebrewBooksFormat(fullPage);
				
				// Fetch directly from daf-supplier with br=true by default
				// The renderer will handle stripping breaks if needed based on the mode
				const url = `/api/daf-supplier?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
				console.log('Fetching from daf-supplier:', url);
				
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`Failed to fetch data: ${response.status}`);
				}
				
				const data = await response.json();
				
				// Convert \r\n line breaks to <br> tags (API now always returns with br=true)
				const convertLineBreaks = (text: string) => {
					return text.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>').replace(/\r/g, '<br>');
				};
				
				// Convert to HebrewBooksPage format for compatibility
				const hebrewBooksData: HebrewBooksPage = {
					tractate: data.tractate || tractate,
					daf: pageNum,
					amud: amud,
					mainText: convertLineBreaks(data.mainText || ''),
					rashi: convertLineBreaks(data.rashi || ''),
					tosafot: convertLineBreaks(data.tosafot || ''),
					otherCommentaries: data.otherCommentaries || {},
					timestamp: data.timestamp || Date.now()
				};
				
				if (hebrewBooksData) {
					update(state => ({
						...state,
						data: hebrewBooksData,
						loading: false
					}));
				} else {
					throw new Error('No data received from HebrewBooks API');
				}
			} catch (error) {
				update(state => ({
					...state,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load page'
				}));
			}
		},

		/**
		 * Get the numeric ID for a tractate name
		 * Used for API calls to daf-supplier
		 * 
		 * @param {string} tractate - Tractate name
		 * @returns {string} Numeric tractate ID
		 */
		getTractateId(tractate: string): string {
			const tractateMapping: Record<string, string> = {
				'Berakhot': '1',
				'Shabbat': '2',
				'Eruvin': '3',
				'Pesachim': '4',
				'Shekalim': '5',
				'Yoma': '6',
				'Sukkah': '7',
				'Beitzah': '8',
				'Rosh Hashanah': '9',
				'Taanit': '10',
				'Megillah': '11',
				'Moed Katan': '12',
				'Chagigah': '13',
				'Yevamot': '14',
				'Ketubot': '15',
				'Nedarim': '16',
				'Nazir': '17',
				'Sotah': '18',
				'Gittin': '19',
				'Kiddushin': '20',
				'Bava Kamma': '21',
				'Bava Metzia': '22',
				'Bava Batra': '23',
				'Sanhedrin': '24',
				'Makkot': '25',
				'Shevuot': '26',
				'Avodah Zarah': '27',
				'Horayot': '28',
				'Zevachim': '29',
				'Menachot': '30',
				'Chullin': '31',
				'Bekhorot': '32',
				'Arakhin': '33',
				'Temurah': '34',
				'Keritot': '35',
				'Meilah': '36',
				'Niddah': '37'
			};
			return tractateMapping[tractate] || '1';
		},

		/**
		 * Clear any error state
		 */
		clearError() {
			update(state => ({ ...state, error: null }));
		},

		/**
		 * Get the current page reference in format "2a"
		 * @returns {string} Page reference
		 */
		getCurrentPage() {
			const state = get(this);
			return `${state.page}${state.amud}`;
		}
	};
}

/** Singleton instance of the Talmud store */
export const talmudStore = createTalmudStore();

/**
 * Derived store containing just the current page data
 * @type {Readable<HebrewBooksPage | null>}
 */
export const currentPage = derived(
	talmudStore,
	$talmudStore => $talmudStore.data
);

/**
 * Derived store for loading state
 * @type {Readable<boolean>}
 */
export const isLoading = derived(
	talmudStore,
	$talmudStore => $talmudStore.loading
);

/**
 * Derived store for error state
 * @type {Readable<string | null>}
 */
export const pageError = derived(
	talmudStore,
	$talmudStore => $talmudStore.error
);

/**
 * Derived store for current page metadata
 * @type {Readable<{tractate: string, page: string, amud: string, fullPage: string}>}
 */
export const pageInfo = derived(
	talmudStore,
	$talmudStore => ({
		tractate: $talmudStore.tractate,
		page: $talmudStore.page,
		amud: $talmudStore.amud,
		fullPage: `${$talmudStore.page}${$talmudStore.amud}`
	})
);

