import { writable, derived, get } from 'svelte/store';
import { TRACTATE_IDS, convertDafToHebrewBooksFormat } from '$lib/hebrewbooks';
import type { HebrewBooksPage } from '$lib/hebrewbooks';

// Types
export interface TalmudPageState {
	tractate: string;
	page: string;
	amud: string;
	data: HebrewBooksPage | null;
	loading: boolean;
	error: string | null;
}

// Create the main store
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
		
		// Load a page
		async loadPage(tractate: string, pageNum: string, amud: string, options: { lineBreakMode?: boolean } = {}) {
			const fullPage = `${pageNum}${amud}`;
			
			// Set loading state
			update(state => ({
				...state,
				tractate,
				page: pageNum,
				amud,
				loading: true,
				error: null,
				data: null // Clear old data while loading
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
				const url = `https://daf-supplier.402.workers.dev?mesechta=${mesechtaId}&daf=${dafForAPI}&br=true`;
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

		// Helper function to get tractate ID for API calls
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

		// Clear error
		clearError() {
			update(state => ({ ...state, error: null }));
		},

		// Get current page reference
		getCurrentPage() {
			const state = get(this);
			return `${state.page}${state.amud}`;
		}
	};
}

// Create the store instance
export const talmudStore = createTalmudStore();

// Derived stores for convenience
export const currentPage = derived(
	talmudStore,
	$talmudStore => $talmudStore.data
);

export const isLoading = derived(
	talmudStore,
	$talmudStore => $talmudStore.loading
);

export const pageError = derived(
	talmudStore,
	$talmudStore => $talmudStore.error
);

export const pageInfo = derived(
	talmudStore,
	$talmudStore => ({
		tractate: $talmudStore.tractate,
		page: $talmudStore.page,
		amud: $talmudStore.amud,
		fullPage: `${$talmudStore.page}${$talmudStore.amud}`
	})
);

