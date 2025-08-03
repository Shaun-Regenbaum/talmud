import { writable, derived, get } from 'svelte/store';
import { hebrewBooksAPI } from '$lib/hebrewbooks';
import type { HebrewBooksPage } from '$lib/hebrewbooks';

// Types
export interface SefariaData {
	mainText: string[];
	mainTextEnglish?: string[];
	rashi: string[];
	rashiEnglish?: string[];
	tosafot: string[];
	tosafotEnglish?: string[];
	linking: {
		rashi: Record<string, Record<number, number[]>>;
		tosafot: Record<string, Record<number, number[]>>;
	};
}

export interface TalmudPageState {
	tractate: string;
	page: string;
	amud: string;
	data: HebrewBooksPage | null;
	sefariaData: SefariaData | null;
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
		sefariaData: null,
		loading: false,
		error: null
	});

	return {
		subscribe,
		
		// Load a page
		async loadPage(tractate: string, pageNum: string, amud: string, options: { lineBreakMode?: boolean } = {}) {
			const fullPage = `${pageNum}${amud}`;
			console.log('Store: Loading page', { tractate, fullPage, options });
			
			// Set loading state
			update(state => ({
				...state,
				tractate,
				page: pageNum,
				amud,
				loading: true,
				error: null,
				data: null, // Clear old data while loading
				sefariaData: null
			}));

			try {
				// Build API URLs with options
				const hebrewBooksOptions = options.lineBreakMode ? { br: 'true' } : {};
				const apiParams = new URLSearchParams({
					mesechta: this.getTractateId(tractate),
					daf: `${pageNum}${amud}`,
					...(options.lineBreakMode ? { br: 'true' } : {})
				});
				
				// Fetch both HebrewBooks and Sefaria data in parallel
				const [hebrewBooksData, sefariaResponse] = await Promise.all([
					hebrewBooksAPI.fetchPage(tractate, fullPage, hebrewBooksOptions),
					fetch(`/api/talmud-merged?${apiParams.toString()}`)
				]);
				
				let sefariaData: SefariaData | null = null;
				if (sefariaResponse.ok) {
					const mergedData = await sefariaResponse.json();
					sefariaData = {
						mainText: mergedData.sources.sefaria.mainText || [],
						mainTextEnglish: mergedData.sources.sefaria.english?.mainText || [],
						rashi: mergedData.sources.sefaria.rashi || [],
						rashiEnglish: mergedData.sources.sefaria.english?.rashi || [],
						tosafot: mergedData.sources.sefaria.tosafot || [],
						tosafotEnglish: mergedData.sources.sefaria.english?.tosafot || [],
						linking: mergedData.sources.sefaria.linking || { rashi: {}, tosafot: {} }
					};
				}
				
				if (hebrewBooksData) {
					update(state => ({
						...state,
						data: hebrewBooksData,
						sefariaData,
						loading: false
					}));
				} else {
					throw new Error('No data received from HebrewBooks API');
				}
			} catch (error) {
				console.error('Store: Error loading page:', error);
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

export const sefariaData = derived(
	talmudStore,
	$talmudStore => $talmudStore.sefariaData
);