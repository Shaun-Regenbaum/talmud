import { writable, derived, get } from 'svelte/store';
import { hebrewBooksAPI } from '$lib/hebrewbooks';
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
		async loadPage(tractate: string, pageNum: string, amud: string) {
			const fullPage = `${pageNum}${amud}`;
			console.log('Store: Loading page', { tractate, fullPage });
			
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
				const data = await hebrewBooksAPI.fetchPage(tractate, fullPage);
				
				if (data) {
					update(state => ({
						...state,
						data,
						loading: false
					}));
				} else {
					throw new Error('No data received from API');
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